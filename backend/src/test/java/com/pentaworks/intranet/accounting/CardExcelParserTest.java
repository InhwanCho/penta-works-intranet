package com.pentaworks.intranet.accounting;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CardExcelParserTest {
    static byte[] workbook(boolean bc,String amount,String cancel,String status,boolean duplicate) throws Exception {
        try(Workbook wb=bc?new XSSFWorkbook():new HSSFWorkbook();var out=new ByteArrayOutputStream()) {
            var sheet=wb.createSheet("승인내역");int start=bc?0:5;
            if(!bc)sheet.createRow(0).createCell(0).setCellValue("요약정보");
            String[] names=bc?new String[]{"수신정보구분코드","카드번호","승인일자","승인시간","승인번호","승인금액(원화)","가맹점명"}:new String[]{"상태","카드번호","이용일","이용시간","승인번호","승인금액","승인취소금액","가맹점명","매입금액","매출취소\n금액","매입일","매입"};
            String[] values=bc?new String[]{status,"4171-0317-****-0987","2026-10-06","09:14:08","00123456",amount,"테스트 가맹점"}:new String[]{status,"5531-****-****-2987","2026.10.06","09:14","00123456",amount,cancel,"테스트 가맹점","0","0","-","미매입"};
            var header=sheet.createRow(start);for(int i=0;i<names.length;i++)header.createCell(i).setCellValue(names[i]);
            for(int j=0;j<(duplicate?2:1);j++){var row=sheet.createRow(start+j+1);for(int i=0;i<values.length;i++)row.createCell(i).setCellValue(values[i]);}
            sheet.createRow(start+(duplicate?3:2)).createCell(0).setCellValue(bc?"합 계":"이하 여백 (End of document)");wb.write(out);return out.toByteArray();
        }
    }
    @Test void readsRealXlsAndXlsxAndPreservesCancellationSignsAndApprovalZeros() throws Exception {
        var parser=new CardExcelParser();
        var bc=parser.parse(workbook(true,"-150,000","0","취소",false),"bc.xlsx","BC");
        assertEquals(new BigDecimal("-150000.00"),bc.rows().get(0).net());
        assertEquals("00123456",bc.rows().get(0).fields().get("approval_no"));
        var hana=parser.parse(workbook(false,"21,000","-21,000","승인취소",false),"hana.xls","HANA");
        assertEquals(new BigDecimal("0.00"),hana.rows().get(0).net());
        assertEquals(7,hana.rows().get(0).row());
    }
    @Test void rejectsDuplicateWrongIssuerAndBrokenSigns() throws Exception {
        var parser=new CardExcelParser();
        assertThrows(IllegalArgumentException.class,()->parser.parse(workbook(true,"150,000","0","취소",false),"bc.xlsx","BC"));
        assertThrows(IllegalArgumentException.class,()->parser.parse(workbook(false,"21,000","-22,000","승인취소",false),"hana.xls","HANA"));
        assertThrows(IllegalArgumentException.class,()->parser.parse(workbook(true,"150,000","0","신규",true),"bc.xlsx","BC"));
        assertThrows(IllegalArgumentException.class,()->parser.parse(workbook(true,"150,000","0","신규",false),"bc.xlsx","HANA"));
    }
    @Test void hanaMutableCancellationDoesNotChangeKey() throws Exception {
        var parser=new CardExcelParser();var first=parser.parse(workbook(false,"21,000","0","정상",false),"h.xls","HANA");
        var second=parser.parse(workbook(false,"21,000","-21,000","승인취소",false),"h.xls","HANA");
        assertEquals(first.rows().get(0).key(),second.rows().get(0).key());
    }
}
