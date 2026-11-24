package com.pentaworks.intranet.accounting;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

public record InvoiceCorrection(int version, int code, LocalDate date, boolean decrease, BigDecimal gross,
                                List<BigDecimal> quantities, TaxInvoiceDocument replacement, String requestKey) {
    public record Part(TaxInvoiceDocument document, int sign, BigDecimal supply, BigDecimal tax) {
        static Part of(TaxInvoiceDocument doc,int sign) {
            var totals=doc.validate(true);
            var factor=BigDecimal.valueOf(sign);
            return new Part(doc,sign,totals.supply().multiply(factor),totals.tax().multiply(factor));
        }
    }
    public List<Part> plan(TaxInvoiceDocument original) {
        var written=original.writeDate();
        if (code==1) {
            if(replacement==null || !written.equals(replacement.writeDate()) || (replacement.taxType()==3)!=(original.taxType()==3))
                throw new IllegalArgumentException("원본 작성일과 계산서 종류를 확인해주세요.");
            return List.of(Part.of(original,-1),Part.of(replacement,1));
        }
        if (code==6) return List.of(Part.of(original,-1));
        if (date==null || date.isBefore(written) || date.isAfter(LocalDate.now(ZoneId.of("Asia/Seoul"))))
            throw new IllegalArgumentException("사유 발생일을 원본 작성일부터 오늘 사이로 입력해주세요.");
        var writeDate=code==5?written:date;
        String remark=code==5?"내국신용장 등 개설일 "+date:"당초 작성일 "+written;
        var lines=new ArrayList<TaxInvoiceDocument.Item>();
        if(code==2) {
            if(gross==null || gross.signum()<=0) throw new IllegalArgumentException("세금 포함 변동액을 입력해주세요.");
            lines.add(new TaxInvoiceDocument.Item(date,"공급가액 변동","",BigDecimal.ONE,null,"",gross));
        } else if(code==3 || code==4 || code==5) {
            if(code==5 && date.isAfter(LocalDate.of(written.getYear(),written.getMonthValue()<=6?6:12,1).plusMonths(1).withDayOfMonth(25)))
                throw new IllegalArgumentException("내국신용장 등 개설일은 해당 과세기간 종료 후 25일 이내여야 합니다.");
            if(code==5 && original.taxType()!=1) throw new IllegalArgumentException("과세 원본을 선택해주세요.");
            if(code!=4 && (quantities==null || quantities.size()!=original.items().size())) throw new IllegalArgumentException("대상 품목 수량을 확인해주세요.");
            for(int i=0;i<original.items().size();i++) {
                var item=original.items().get(i);
                var qty=code==4?item.quantity():quantities.get(i);
                if(qty==null || qty.signum()<0 || qty.compareTo(item.quantity())>0) throw new IllegalArgumentException("대상 수량이 원본 수량을 초과합니다.");
                if(qty.signum()>0) lines.add(new TaxInvoiceDocument.Item(code==5?item.date():date,item.name(),item.specification(),qty,item.unitPrice(),item.note(),item.grossUnitPrice()));
            }
        } else throw new IllegalArgumentException("수정 사유를 확인해주세요.");
        var doc=new TaxInvoiceDocument(writeDate,original.taxType(),original.purposeType(),original.customer(),remark,lines);
        var part=Part.of(doc,code==2 && !decrease?1:-1);
        if(code!=5) return List.of(part);
        // Preserve each converted line's exact net amount even for fractional unit prices.
        var zeroLines=lines.stream().map(item->new TaxInvoiceDocument.Item(item.date(),item.name(),item.specification(),BigDecimal.ONE,item.supply(1),item.note())).toList();
        return List.of(part,Part.of(new TaxInvoiceDocument(written,2,original.purposeType(),original.customer(),remark,zeroLines),1));
    }
}
