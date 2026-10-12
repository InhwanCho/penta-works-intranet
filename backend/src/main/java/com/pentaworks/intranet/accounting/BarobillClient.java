package com.pentaworks.intranet.accounting;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.w3c.dom.*;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

@Component
public class BarobillClient {
    static final String NS="http://ws.baroservice.com/";
    private final String cert,corp,user,environment;
    private final URI endpoint;
    private final HttpClient http;
    public record RemoteAccount(String bankCode,String bankName,String number,String alias,boolean foreign) {}
    public static class UpstreamException extends RuntimeException { public UpstreamException(String message){super(message);} }
    @org.springframework.beans.factory.annotation.Autowired
    public BarobillClient(@Value("${app.integrations.barobill.cert-key:}") String cert,
                         @Value("${app.integrations.barobill.corp-num:}") String corp,
                         @Value("${app.integrations.barobill.user-id:}") String user,
                         @Value("${app.integrations.barobill.environment:production}") String env) {
        this(cert,corp,user,env,URI.create(env.equals("test")?"https://testws.baroservice.com/BANKACCOUNT.asmx":"https://ws.baroservice.com/BANKACCOUNT.asmx"));
    }
    BarobillClient(String cert,String corp,String user,String env,URI endpoint) {
        this.cert=cert; this.corp=corp.replace("-","");this.user=user;this.environment=env;this.endpoint=endpoint;
        http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
    }
    public boolean ready(){return !cert.isBlank() && corp.matches("[0-9]{10}") && !user.isBlank() && Set.of("test","production").contains(environment);}
    public String environment(){return environment;}
    private void require(){if(!ready())throw new IllegalArgumentException("바로빌 계좌조회 설정이 필요합니다. 서버 관리자에게 문의해주세요.");}
    public List<RemoteAccount> accounts() {
        require(); var p=credentials();p.put("AvailOnly","1");
        Element result=call("GetBankAccountEx2",p,Duration.ofSeconds(20));
        List<RemoteAccount> list=new ArrayList<>();
        for(Element e:children(result,"BankAccountEx")) {
            String number=text(e,"BankAccountNum"); if(number.matches("-\\d+")) throw failure(number);
            String bank=text(e,"BankCode"); number=number.replace("-","").replace(" ","");
            if(number.isEmpty() || bank.isEmpty()) throw new UpstreamException("바로빌 계좌 응답에 필수 정보가 없습니다.");
            String name=text(e,"BankName"), alias=text(e,"Alias");
            list.add(new RemoteAccount(bank,name.isBlank()?bank:name,number,alias, !text(e,"ForeignCurrencyCodes").isBlank()));
        }
        return List.copyOf(list);
    }
    public List<Map<String,String>> transactions(String number, LocalDate from, LocalDate to) {
        require(); checkDates(from,to);
        List<Map<String,String>> all=new ArrayList<>();Set<String> keys=new HashSet<>();
        long deadline=System.nanoTime()+Duration.ofSeconds(90).toNanos(); int max=1,expected=-1;
        for(int page=1;page<=max;page++) {
            long left=deadline-System.nanoTime(); if(left<=0) throw new UpstreamException("바로빌 조회 시간이 초과되었습니다. 조회 기간을 줄여 다시 시도해주세요.");
            var p=credentials();p.put("ID",user);p.put("BankAccountNum",number);
            p.put("StartDate",from.format(DateTimeFormatter.BASIC_ISO_DATE));p.put("EndDate",to.format(DateTimeFormatter.BASIC_ISO_DATE));
            p.put("TransDirection","1");p.put("CountPerPage","100");p.put("CurrentPage",String.valueOf(page));p.put("OrderDirection","1");
            Element result=call("GetPeriodBankAccountTransLog",p,Duration.ofNanos(Math.min(left,Duration.ofSeconds(20).toNanos())));
            int current=integer(result,"CurrentPage");if(current<0)throw failure(String.valueOf(current));
            int pages=integer(result,"MaxPageNum"), count=integer(result,"MaxIndex");
            if(current!=page || pages<0 || pages>200 || count<0 || count>20000 || (page>1 && (pages!=max || count!=expected))) throw new UpstreamException("바로빌 페이지 정보가 변경되었거나 올바르지 않습니다. 다시 조회해주세요.");
            max=Math.max(1,pages);expected=count;
            Element container=child(result,"BankAccountLogList");
            if(container!=null) for(Element row:children(container,"BankAccountTransLog")) {
                Map<String,String> v=new LinkedHashMap<>();
                for(String name:List.of("BankAccountNum","TransRefKey","TransDT","Deposit","Withdraw","Balance","CurrencyCode","TransType","TransOffice","TransRemark1","TransRemark2","CmsCode","Memo")) v.put(name,text(row,name));
                String key=v.get("TransRefKey");
                if(key.isBlank() || !keys.add(key)) throw new UpstreamException("바로빌 거래 키가 없거나 중복되었습니다. 다시 조회해주세요.");
                all.add(v);
            }
        }
        if(all.size()!=expected)throw new UpstreamException("바로빌 거래 건수와 페이지 합계가 다릅니다. 저장하지 않았으니 다시 조회해주세요.");
        return List.copyOf(all);
    }
    static void checkDates(LocalDate from,LocalDate to){if(from==null || to==null || to.isBefore(from) || ChronoUnit.DAYS.between(from,to)>=200) throw new IllegalArgumentException("조회 기간은 시작일부터 200일 이내로 선택해주세요.");}
    private LinkedHashMap<String,String> credentials(){var p=new LinkedHashMap<String,String>();p.put("CERTKEY",cert);p.put("CorpNum",corp);return p;}
    private Element call(String method,Map<String,String> params,Duration timeout) {
        StringBuilder body=new StringBuilder("<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><"+method+" xmlns=\""+NS+"\">");
        params.forEach((k,v)->body.append('<').append(k).append('>').append(escape(v)).append("</").append(k).append('>'));
        body.append("</").append(method).append("></soap:Body></soap:Envelope>");
        var req=HttpRequest.newBuilder(endpoint).timeout(timeout).header("Content-Type","text/xml; charset=utf-8").header("SOAPAction","\""+NS+method+"\"").POST(HttpRequest.BodyPublishers.ofString(body.toString(),StandardCharsets.UTF_8)).build();
        try {
            var response=http.send(req,HttpResponse.BodyHandlers.ofInputStream());
            byte[] bytes;try(var stream=response.body()){bytes=stream.readNBytes(4*1024*1024+1);}
            if(bytes.length>4*1024*1024 || response.statusCode()!=200) throw new UpstreamException("바로빌 서버 응답 오류입니다. 잠시 후 다시 조회해주세요.");
            var xml=DocumentBuilderFactory.newInstance();xml.setNamespaceAware(true);xml.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);xml.setFeature("http://xml.org/sax/features/external-general-entities",false);xml.setFeature("http://xml.org/sax/features/external-parameter-entities",false);xml.setXIncludeAware(false);xml.setExpandEntityReferences(false);xml.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");xml.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
            var builder=xml.newDocumentBuilder();builder.setErrorHandler(new DefaultHandler(){@Override public void fatalError(SAXParseException e)throws SAXException{throw e;}});
            var doc=builder.parse(new ByteArrayInputStream(bytes));
            var results=doc.getElementsByTagNameNS(NS,method+"Result");
            if(results.getLength()!=1)throw new UpstreamException("바로빌 응답 형식이 올바르지 않습니다.");
            return (Element)results.item(0);
        }catch(UpstreamException ex){throw ex;}
        catch(InterruptedException ex){Thread.currentThread().interrupt();throw new UpstreamException("바로빌 조회가 중단되었습니다.");}
        catch(Exception ex){throw new UpstreamException("바로빌에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");}
    }
    private static UpstreamException failure(String code){return new UpstreamException("바로빌 조회에 실패했습니다. 오류 코드: "+code);}
    private static String escape(String s){return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");}
    static Element child(Element parent,String name){for(var node=parent.getFirstChild();node!=null;node=node.getNextSibling())if(node instanceof Element e && name.equals(e.getLocalName()))return e;return null;}
    static List<Element> children(Element parent,String name){List<Element> list=new ArrayList<>();for(var node=parent.getFirstChild();node!=null;node=node.getNextSibling())if(node instanceof Element e && name.equals(e.getLocalName()))list.add(e);return list;}
    private static String text(Element e,String name){Element c=child(e,name);return c==null?"":c.getTextContent().trim();}
    private static int integer(Element e,String name){try{return Integer.parseInt(text(e,name));}catch(Exception ex){throw new UpstreamException("바로빌 페이지 응답이 올바르지 않습니다.");}}
}
