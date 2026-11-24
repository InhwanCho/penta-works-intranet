package com.pentaworks.intranet.accounting;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;

final class HanaStatement {
    private static final Pattern ENVELOPE=Pattern.compile("\\bUSSM_M_DATA\\s*=\\s*'([A-Za-z0-9+/=]++)'");
    private static final Pattern DATE=Pattern.compile("(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일");
    private static final Pattern ACCOUNT=Pattern.compile("[0-9]+\\*+(\\d{4})");
    private static final Pattern CARD=Pattern.compile("(\\d{4})\\s*_?\\s*결제계좌");
    private static IllegalArgumentException invalid(String reason){return new IllegalArgumentException("하나카드 명세서: "+reason);}

    static CardExcelParser.Parsed parse(byte[] bytes,String businessNo,List<String> cards) {
        if(bytes.length==0 || bytes.length>5*1024*1024) throw invalid("최대 5MB 파일을 선택해주세요.");
        var envelope=ENVELOPE.matcher(new String(bytes,StandardCharsets.UTF_8));
        String payload=null;
        while(envelope.find()) payload=envelope.group(1);
        if(payload==null) throw invalid("지원하는 보안메일 원본 HTML을 선택해주세요.");
        String plain;
        try {
            byte[] key=MessageDigest.getInstance("MD5").digest(businessNo.getBytes(StandardCharsets.UTF_8));
            var cipher=Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new IvParameterSpec(key));
            plain=new String(cipher.doFinal(Base64.getDecoder().decode(payload)),StandardCharsets.UTF_8);
        } catch(Exception ex){throw invalid("등록된 회사 사업자번호로 열 수 없습니다.");}
        var html=Jsoup.parse(plain);
        Element totalLabel=html.selectFirst("img[alt=결제금액]");
        if(totalLabel==null) throw invalid("총 청구금액을 찾을 수 없습니다.");
        BigDecimal total=money(totalLabel.closest("tr").selectFirst("td").text());
        LocalDate due=null;
        String account=null,card=null;
        var rows=new ArrayList<CardExcelParser.CardRow>();
        var occurrences=new HashMap<String,Integer>();
        Element details=null,cancels=null;
        for(var tr:html.select("tr")) {
            var c=tr.children();
            if(c.isEmpty() || c.stream().anyMatch(e->e.selectFirst("table")!=null)) continue;
            String first=c.get(0).text().replaceAll("\\s+","");
            if(first.equals("원결제일") && c.size()>1) {
                var m=DATE.matcher(c.get(1).text());
                if(m.find()) due=LocalDate.of(Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)),Integer.parseInt(m.group(3)));
            }
            if(first.equals("원화결제계좌") && c.size()>1) {
                var m=ACCOUNT.matcher(c.get(1).text());
                if(m.find()) account=m.group(1);
            }
            var table=tr.closest("table");
            if(first.equals("이용일자") && tr.text().replaceAll("\\s+","").contains("당월결제하실금액")) details=table;
            if(first.equals("이용일자") && tr.text().contains("취소일자")) cancels=table;
            if(table==null || table!=details && table!=cancels) continue;
            if(table==details && c.size()==1 && tr.text().contains("결제계좌")) {
                var match=CARD.matcher(tr.text());
                card=match.find()?resolve(cards,match.group(1)):null;
            }
            if(!first.matches("\\d{2}/\\d{2}")) continue;
            boolean cancel=table==cancels;
            if(due==null || c.size()!=(cancel?6:11)) throw invalid("거래 열 또는 결제일을 확인해주세요.");
            String number=card;
            if(cancel) {
                var match=Pattern.compile("(\\d{4})$").matcher(c.get(3).text());
                number=match.find()?resolve(cards,match.group(1)):null;
            }
            if(number==null) throw invalid("거래의 카드를 식별할 수 없습니다.");
            int month=Integer.parseInt(first.substring(0,2)),day=Integer.parseInt(first.substring(3));
            LocalDate date=LocalDate.of(due.getYear()-(month>due.getMonthValue()?1:0),month,day);
            BigDecimal amount=cancel?money(c.get(4).text()):(c.get(5).text().isBlank()?BigDecimal.ZERO:money(c.get(5).text())).add(c.get(6).text().isBlank()?BigDecimal.ZERO:money(c.get(6).text()));
            String installment=cancel?"0":c.get(4).text();
            var values=Map.of("카드번호",number,"이용일",date.toString(),"가맹점명",c.get(cancel?2:1).text(),"결제금액",amount.toPlainString(),
                    "이용원금",cancel?amount.toPlainString():c.get(2).text(),"취소여부",cancel || c.get(2).text().startsWith("-")?"Y":"N","청구회차",installment.isBlank()?"0":installment);
            rows.add(CardExcelParser.convert("HANA","이용상세내역",rows.size()+1,values,occurrences));
        }
        if(due==null || account==null || rows.isEmpty() || rows.stream().map(CardExcelParser.CardRow::net).reduce(BigDecimal.ZERO,BigDecimal::add).compareTo(total)!=0)
            throw invalid("청구 총액과 상세 합계 또는 결제계좌를 확인할 수 없어 저장하지 않았습니다.");
        return new CardExcelParser.Parsed("HANA",CardExcelParser.sha(bytes),List.copyOf(rows),
                new CardExcelParser.Bill(due,KoreanBusinessCalendar.onOrAfter(due.withDayOfMonth(25)),total,account));
    }
    private static BigDecimal money(String value){return CardExcelParser.money(value,false);}
    private static String resolve(List<String> cards,String suffix){
        var matches=cards.stream().filter(c->c.endsWith(suffix)).toList();
        if(matches.size()!=1) throw invalid("끝번호 "+suffix+"에 해당하는 하나카드 한 장을 등록해주세요.");
        return matches.get(0);
    }
}
