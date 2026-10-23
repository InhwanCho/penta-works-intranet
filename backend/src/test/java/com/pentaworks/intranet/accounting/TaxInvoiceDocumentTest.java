package com.pentaworks.intranet.accounting;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TaxInvoiceDocumentTest {
    static TaxInvoiceDocument.Party party(){return new TaxInvoiceDocument.Party("675-87-00483","주식회사 펜타웍스","대표자","인천광역시 남동구 호구포로74번길 78","제조업","전기장비","담당자","test@example.com","032-000-0000","");}
    static TaxInvoiceDocument doc(int type,String quantity,String price){return new TaxInvoiceDocument(LocalDate.of(2026,1,20),type,2,new TaxInvoiceDocument.Party("1234567891","테스트 거래처","대표자","서울특별시 테스트로 100","서비스업","서비스","담당자","test@example.com","",""),"",List.of(new TaxInvoiceDocument.Item(LocalDate.of(2026,1,19),"유지보수","EA",new BigDecimal(quantity),new BigDecimal(price),"")));}
    @Test void decimalMoneyIsExactAndTaxRoundsDownPerLine(){var totals=doc(1,"3","100.1").validate(true);assertEquals(new BigDecimal("300"),totals.supply());assertEquals(new BigDecimal("30"),totals.tax());assertEquals(new BigDecimal("330"),totals.total());assertEquals(new BigDecimal("0"),doc(2,"3","100.1").validate(true).tax());assertEquals(new BigDecimal("0"),doc(3,"3","100.1").validate(true).tax());}
    @Test void validatesBusinessNoWithoutAcceptingPlaceholders(){assertTrue(TaxInvoiceDocument.validBusinessNo("6758700483"));assertFalse(TaxInvoiceDocument.validBusinessNo("6758700484"));assertFalse(TaxInvoiceDocument.validBusinessNo("0000000000"));}
    @Test void validatesDateRangeAndZeroAmounts(){var d=doc(1,"1","100");assertThrows(IllegalArgumentException.class,()->new TaxInvoiceDocument(d.writeDate(),1,2,party(),"",List.of(new TaxInvoiceDocument.Item(LocalDate.of(2026,2,1),"부품","EA",BigDecimal.ONE,BigDecimal.TEN,""))).validate(true));assertThrows(IllegalArgumentException.class,()->doc(1,"0","100").validate(true));assertThrows(IllegalArgumentException.class,()->doc(1,"1","0").validate(true));assertThrows(IllegalArgumentException.class,()->doc(1,"1.00001","100").validate(true));}
    @Test void soapEscapesFieldsAndUsesInvoiceTypeForExemptTransactions(){var p=party();var d=doc(3,"2","100");d=new TaxInvoiceDocument(d.writeDate(),d.taxType(),d.purposeType(),d.customer(),"A&B <테스트>",d.items());String xml=TaxInvoiceClient.invoiceXml("PW123",d,p,"account");assertTrue(xml.contains("<TaxInvoiceType>2</TaxInvoiceType>"));assertTrue(xml.contains("A&amp;B &lt;테스트&gt;"));assertTrue(xml.contains("<TaxTotal>0</TaxTotal>"));assertTrue(xml.contains("<MgtNum>PW123</MgtNum>"));assertTrue(xml.contains("<AmountTotal>200</AmountTotal>"));}
}
