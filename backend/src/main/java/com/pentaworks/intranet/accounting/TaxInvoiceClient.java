package com.pentaworks.intranet.accounting;

import java.net.URI;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.stereotype.Component;
import org.w3c.dom.Element;

@Component
public class TaxInvoiceClient {
    private final BarobillClient client;
    public TaxInvoiceClient(BarobillClient client){this.client=client;}
    public boolean ready(){return client.ready();}
    public String environment(){return client.environment();}
    public String corpNumber(){return client.corpNumber();}
    private URI endpoint(){return URI.create(client.environment().equals("test")?"https://testws.baroservice.com/TI.asmx":"https://ws.baroservice.com/TI.asmx");}
    public int issue(String key,TaxInvoiceDocument document,TaxInvoiceDocument.Party issuer){
        if(!issuer.corpNum().equals(corpNumber()))throw new IllegalArgumentException("공급자 사업자번호가 바로빌 연동 사업자와 다릅니다.");
        String payload=client.taxCredentials()+"<Invoice>"+invoiceXml(key,document,issuer,client.contactId())+"</Invoice><SendSMS>false</SendSMS><ForceIssue>false</ForceIssue><MailTitle></MailTitle>";
        Element result=client.callXml(endpoint(),"RegistAndIssueTaxInvoice",payload,Duration.ofSeconds(20));
        try{return Integer.parseInt(result.getTextContent().trim());}catch(NumberFormatException e){throw new BarobillClient.UpstreamException("발급 응답을 확인하지 못했습니다. 상태 조회가 필요합니다.");}
    }
    public Map<String,String> state(String key){
        Element result=client.callXml(endpoint(),"GetTaxInvoiceStateEX",client.taxCredentials()+tag("MgtKey",key),Duration.ofSeconds(20));
        Map<String,String> state=new LinkedHashMap<>();
        for(String name:List.of("BarobillState","NTSSendState","NTSSendKey","NTSSendResult","IssueDT"))state.put(name,BarobillClient.text(result,name));
        if(!state.get("BarobillState").matches("[0-9]+"))throw new BarobillClient.UpstreamException("바로빌에서 상태를 확인하지 못했습니다. 관리번호로 확인해주세요.");
        return state;
    }
    public TaxInvoiceDocument.Party registeredIssuer(TaxInvoiceDocument.Party fallback){
        // Use issuer details from the most recent transmitted sales invoice; do not guess company details.
        var today=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul"));
        String params=client.taxCredentials()+tag("UserID",client.contactId())+"<TaxType>1</TaxType><DateType>1</DateType>"+tag("StartDate",today.minusDays(89).format(DateTimeFormatter.BASIC_ISO_DATE))+tag("EndDate",today.format(DateTimeFormatter.BASIC_ISO_DATE))+"<CountPerPage>100</CountPerPage><CurrentPage>1</CurrentPage>";
        var result=client.callXml(endpoint(),"GetPeriodTaxInvoiceSalesListEx",params,Duration.ofSeconds(20));
        if(!"1".equals(BarobillClient.text(result,"CurrentPage")))throw new IllegalArgumentException("바로빌 회사정보 조회에 실패했습니다.");
        var list=BarobillClient.child(result,"SimpleTaxInvoiceEx2List");
        if(list==null)return registeredContact(fallback);
        var latest=BarobillClient.children(list,"SimpleTaxInvoiceEx2").stream().filter(e->corpNumber().equals(BarobillClient.text(e,"InvoicerCorpNum"))).max(Comparator.comparing(e->BarobillClient.text(e,"IssueDT"))).orElse(null);
        if(latest==null)return registeredContact(fallback);
        var party=new TaxInvoiceDocument.Party(corpNumber(),BarobillClient.text(latest,"InvoicerCorpName"),BarobillClient.text(latest,"InvoicerCEOName"),BarobillClient.text(latest,"InvoicerAddr"),BarobillClient.text(latest,"InvoicerBizType"),BarobillClient.text(latest,"InvoicerBizClass"),BarobillClient.text(latest,"InvoicerContactName"),BarobillClient.text(latest,"InvoicerEmail"),"",BarobillClient.text(latest,"InvoicerTaxRegID"));
        if(!party.corpName().contains("펜타웍스")||!party.addr().contains("남동구"))throw new IllegalArgumentException("바로빌 정보가 남동구 소재 펜타웍스와 일치하지 않습니다. 공급자 정보를 확인해주세요.");
        return registeredContact(party);
    }
    private TaxInvoiceDocument.Party registeredContact(TaxInvoiceDocument.Party party){
        if(!party.corpNum().equals(corpNumber())||!party.corpName().contains("펜타웍스")||!party.addr().contains("남동구"))throw new IllegalArgumentException("공급자 기본정보와 바로빌 연동 사업자가 일치하지 않습니다.");
        Element result=client.callXml(endpoint(),"GetCorpMemberContacts",client.taxCredentials()+tag("CheckCorpNum",corpNumber()),Duration.ofSeconds(20));
        var contact=BarobillClient.children(result,"Contact").stream().filter(e->client.contactId().equals(BarobillClient.text(e,"ID"))).findFirst().orElseThrow(()->new IllegalArgumentException("바로빌 연동 계정의 담당자 정보를 찾지 못했습니다."));
        return new TaxInvoiceDocument.Party(party.corpNum(),party.corpName(),party.ceoName(),party.addr(),party.bizType(),party.bizClass(),BarobillClient.text(contact,"ContactName"),BarobillClient.text(contact,"Email"),BarobillClient.text(contact,"TEL"),party.taxRegId(),BarobillClient.text(contact,"HP"));
    }
    static String invoiceXml(String key,TaxInvoiceDocument d,TaxInvoiceDocument.Party issuer,String contactId){
        var totals=d.validate(true);StringBuilder xml=new StringBuilder();
        xml.append("<InvoicerParty>").append(tag("ContactID",contactId)).append(tag("CorpNum",issuer.corpNum())).append(tag("MgtNum",key)).append(partyXml(issuer)).append("</InvoicerParty>");
        xml.append("<InvoiceeParty>").append(tag("CorpNum",d.customer().corpNum())).append(partyXml(d.customer())).append("</InvoiceeParty>");
        xml.append("<IssueDirection>1</IssueDirection>").append(tag("TaxInvoiceType",d.taxType()==3?2:1)).append(tag("TaxType",d.taxType())).append("<TaxCalcType>1</TaxCalcType>").append(tag("PurposeType",d.purposeType())).append(tag("WriteDate",d.writeDate().format(DateTimeFormatter.BASIC_ISO_DATE))).append(tag("AmountTotal",totals.supply().toPlainString())).append(tag("TaxTotal",totals.tax().toPlainString())).append(tag("TotalAmount",totals.total().toPlainString())).append(tag("Remark1",d.remark()));
        xml.append("<TaxInvoiceTradeLineItems>");
        for(var item:d.items())xml.append("<TaxInvoiceTradeLineItem>").append(tag("PurchaseExpiry",item.date().format(DateTimeFormatter.BASIC_ISO_DATE))).append(tag("Name",item.name())).append(tag("Information",item.specification())).append(tag("ChargeableUnit",item.quantity().toPlainString())).append(tag("UnitPrice",item.unitPrice().toPlainString())).append(tag("Amount",item.supply().toPlainString())).append(tag("Tax",item.tax(d.taxType()).toPlainString())).append(tag("Description",item.note())).append("</TaxInvoiceTradeLineItem>");
        return xml.append("</TaxInvoiceTradeLineItems>").toString();
    }
    private static String partyXml(TaxInvoiceDocument.Party p){return tag("CorpName",p.corpName())+tag("TaxRegID",p.taxRegId())+tag("CEOName",p.ceoName())+tag("Addr",p.addr())+tag("BizClass",p.bizClass())+tag("BizType",p.bizType())+tag("ContactName",p.contactName())+tag("TEL",p.tel())+tag("HP",p.hp())+tag("Email",p.email());}
    private static String tag(String name,Object value){return "<"+name+">"+BarobillClient.escape(value==null?"":String.valueOf(value))+"</"+name+">";}
}
