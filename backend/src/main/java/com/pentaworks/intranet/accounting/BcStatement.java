package com.pentaworks.intranet.accounting;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;

final class BcStatement {
    record Part(String department, String account, LocalDate date, BigDecimal amount,
                List<CardExcelParser.CardRow> rows, String hash) {}
    private static final String MONEY="(-?[\\d,]+)";
    private static final Pattern ROW=Pattern.compile("^\\h*\\S+\\h+(\\d{4})-(\\d{4})-\\h+(\\d{4})\\.(\\d{2})\\h*(.*)\\R\\h*\\*{4}-(\\d{4})\\h+\\.(\\d{2})\\h*(.*?)\\h+"+MONEY+"\\h+"+MONEY+"\\h+"+MONEY+"\\h+\\d+\\h+"+MONEY+"\\h+(\\d+)\\h*$",Pattern.MULTILINE);
    private BcStatement() {}

    static Part read(byte[] data,String company) throws IOException {
        String text;
        try(var pdf=Loader.loadPDF(data)) {
            if(pdf.getNumberOfPages()>100) throw invalid("파일당 최대 100쪽까지 가능합니다.");
            var stripper=new PDFTextStripper();
            stripper.setSortByPosition(true);
            text=stripper.getText(pdf);
        } catch(IOException ex) { throw invalid("텍스트가 포함된 BC카드 명세서 PDF를 선택해주세요."); }
        if(!text.contains("비씨카드") || !field(text,"사업자번호\\h+([0-9-]+)").replace("-","").equals(company))
            throw invalid("BC카드 명세서와 등록된 사업자번호를 확인해주세요.");
        String department=field(text,"부서코드\\(부서명\\)\\h+(\\d+)");
        String account=field(text,"계좌번호\\h+([0-9*]+)");
        LocalDate date=LocalDate.parse(field(text,"결제일\\h+(\\d{4}\\h*/\\h*\\d{2}\\h*/\\h*\\d{2})").replaceAll("\\s+","").replace('/','-'));
        BigDecimal bill=money(field(text,"결제하실\\h+총\\h+금액\\h+-?[\\d,]+\\h+-?[\\d,]+\\h+"+MONEY));
        var rows=new ArrayList<CardExcelParser.CardRow>();
        var counts=new HashMap<String,Integer>();
        var matcher=ROW.matcher(text);
        while(matcher.find()) {
            String number=matcher.group(1)+matcher.group(2)+"****"+matcher.group(6);
            var used=LocalDate.of(Integer.parseInt(matcher.group(3)),Integer.parseInt(matcher.group(4)),Integer.parseInt(matcher.group(7)));
            String merchant=(matcher.group(5)+matcher.group(8)).strip();
            int end=matcher.end();
            if(end<text.length() && text.charAt(end)=='\n') {
                var next=text.substring(end+1).lines().findFirst().orElse("").strip();
                if(next.matches("[가-힣]{1,4}")) merchant+=next;
            }
            var amount=money(matcher.group(9)).add(money(matcher.group(10)));
            var fields=new LinkedHashMap<String,Object>();
            fields.put("approval_date",used); fields.put("time_precision","DAY"); fields.put("event_type","SNAPSHOT");
            fields.put("merchant_name",merchant); fields.put("currency","KRW"); fields.put("approval_status",amount.signum()<0?"청구취소":"청구");
            fields.put("approval_cancel_amount",BigDecimal.ZERO); fields.put("billed_amount",amount); fields.put("statement_principal",money(matcher.group(11)));
            String key=String.join("|","BC-PDF",date.toString(),department,number,used.toString(),merchant,amount.toPlainString(),matcher.group(13));
            rows.add(new CardExcelParser.CardRow("BC",number,hash(key+"|"+counts.merge(key,1,Integer::sum)),department,rows.size()+1,fields,Map.of()));
        }
        long expected=Pattern.compile("\\*{4}-\\d{4}\\h+\\.\\d{2}").matcher(text).results().count();
        if(rows.isEmpty() || rows.size()!=expected || rows.stream().map(CardExcelParser.CardRow::net).reduce(BigDecimal.ZERO,BigDecimal::add).compareTo(bill)!=0)
            throw invalid("명세서 상세 합계가 청구금액과 일치하지 않거나 읽을 수 없는 거래가 있습니다.");
        return new Part(department,account,date,bill,List.copyOf(rows),CardExcelParser.sha(data));
    }
    static CardExcelParser.Parsed combine(List<Part> parts) {
        var first=parts.get(0);
        var codes=new HashSet<String>();
        var rows=new ArrayList<CardExcelParser.CardRow>();
        var cards=new HashSet<String>();
        BigDecimal total=BigDecimal.ZERO;
        for(var part:parts) {
            if(!first.date().equals(part.date()) || !first.account().equals(part.account()) || !codes.add(part.department()))
                throw invalid("같은 결제일과 계좌의 서로 다른 부서 명세서를 선택해주세요.");
            var partCards=new HashSet<>(part.rows().stream().map(CardExcelParser.CardRow::cardNumber).toList());
            if(!Collections.disjoint(cards,partCards)) throw invalid("같은 카드가 여러 명세서에 있습니다.");
            cards.addAll(partCards); rows.addAll(part.rows()); total=total.add(part.amount());
        }
        String hash=hash(String.join("|",parts.stream().map(Part::hash).sorted().toList()));
        var date=first.date();
        if(!KoreanBusinessCalendar.onOrAfter(date.withDayOfMonth(25)).equals(date))
            throw invalid("명세서 결제일과 카드 결제예정일이 다릅니다.");
        return new CardExcelParser.Parsed("BC",hash,List.copyOf(rows),new CardExcelParser.Bill(date,date,total,first.account()));
    }
    private static BigDecimal money(String amount){return CardExcelParser.money(amount,false);}
    private static String hash(String value){return CardExcelParser.sha(value.getBytes(StandardCharsets.UTF_8));}
    private static String field(String text,String pattern) {
        var match=Pattern.compile(pattern).matcher(text);
        if(!match.find()) throw invalid("결제일, 계좌, 부서코드 및 청구 총액을 확인해주세요.");
        return match.group(1);
    }
    private static IllegalArgumentException invalid(String text){return new IllegalArgumentException("BC 명세서: "+text);}
}
