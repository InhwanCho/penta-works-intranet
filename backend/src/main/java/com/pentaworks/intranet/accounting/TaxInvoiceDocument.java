package com.pentaworks.intranet.accounting;

import java.math.*;
import java.time.*;
import java.util.*;

public record TaxInvoiceDocument(LocalDate writeDate, int taxType, int purposeType, Party customer, String remark, List<Item> items) {
    public record Party(String corpNum,String corpName,String ceoName,String addr,String bizType,String bizClass,String contactName,String email,String tel,String taxRegId,String hp) {
        public Party(String corpNum,String corpName,String ceoName,String addr,String bizType,String bizClass,String contactName,String email,String tel,String taxRegId){this(corpNum,corpName,ceoName,addr,bizType,bizClass,contactName,email,tel,taxRegId,"");}
        public Party { corpNum=clean(corpNum).replace("-","").replace(" ","");corpName=clean(corpName);ceoName=clean(ceoName);addr=clean(addr);bizType=clean(bizType);bizClass=clean(bizClass);contactName=clean(contactName);email=clean(email);tel=clean(tel);taxRegId=clean(taxRegId);hp=clean(hp); }
        void validate(boolean issuing) {
            for(String v:List.of(corpNum,corpName,ceoName,addr,bizType,bizClass,contactName,email,tel,taxRegId,hp))if(v.length()>200)throw invalid("사업자 정보는 항목당 200자 이내로 입력해주세요.");
            if(!corpNum.isEmpty()&&!validBusinessNo(corpNum))throw invalid("사업자등록번호를 확인해주세요.");
            if(!taxRegId.isEmpty()&&!taxRegId.matches("[0-9]{4}"))throw invalid("종사업장 번호는 4자리 숫자로 입력해주세요.");
            if(!email.isEmpty()&&!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))throw invalid("이메일 주소를 확인해주세요.");
            if(issuing && (!validBusinessNo(corpNum)||corpName.isBlank()||ceoName.isBlank()||addr.length()<10||bizType.isBlank()||bizClass.isBlank()||email.isBlank()))throw invalid("발급 전 사업자번호·상호·대표자·상세 주소·업태·종목·이메일을 입력해주세요.");
        }
    }
    public record Item(LocalDate date,String name,String specification,BigDecimal quantity,BigDecimal unitPrice,String note) {
        public Item {name=clean(name);specification=clean(specification);note=clean(note);}
        BigDecimal supply(){return quantity.multiply(unitPrice).setScale(0,RoundingMode.DOWN);}
        BigDecimal tax(int type){return type==1?supply().divide(BigDecimal.TEN,0,RoundingMode.DOWN):BigDecimal.ZERO;}
    }
    public record Totals(BigDecimal supply,BigDecimal tax,BigDecimal total){}
    public Totals validate(boolean issuing){
        if(writeDate==null||writeDate.isAfter(LocalDate.now(ZoneId.of("Asia/Seoul")))||writeDate.getYear()<2000)throw invalid("작성일자는 2000년 이후부터 오늘까지 선택해주세요.");
        if(taxType<1||taxType>3||purposeType<1||purposeType>2)throw invalid("발급 옵션을 확인해주세요.");
        if(customer==null||customer.corpName().isBlank())throw invalid("공급받는자 상호를 입력해주세요.");
        customer.validate(issuing);
        if(clean(remark).length()>150)throw invalid("비고는 150자 이내로 입력해주세요.");
        if(items==null||items.isEmpty()||items.size()>99)throw invalid("품목은 1~99개로 입력해주세요.");
        BigDecimal supply=BigDecimal.ZERO,tax=BigDecimal.ZERO;
        for(Item item:items){
            if(item==null||item.name().isBlank()||item.name().length()>100||item.specification().length()>100||item.note().length()>100)throw invalid("품목명은 필수이며 품목명·규격·비고는 100자 이내로 입력해주세요.");
            if(item.quantity()==null||item.unitPrice()==null||item.quantity().signum()<=0||item.unitPrice().signum()<0||item.quantity().scale()>4||item.unitPrice().scale()>4||item.quantity().precision()>16||item.unitPrice().precision()>16)throw invalid("수량은 양수, 단가는 0 이상이며 소수점은 4자리까지 입력해주세요.");
            if(item.date()==null||!YearMonth.from(item.date()).equals(YearMonth.from(writeDate)))throw invalid("공급일자는 작성일자와 같은 달로 입력해주세요.");
            if(item.supply().signum()<=0)throw invalid("품목 공급가액은 1원 이상이어야 합니다.");
            supply=supply.add(item.supply());tax=tax.add(item.tax(taxType));
        }
        if(supply.add(tax).compareTo(new BigDecimal("99999999999999"))>0)throw invalid("합계금액이 허용 범위를 초과했습니다.");
        return new Totals(supply,tax,supply.add(tax));
    }
    static boolean validBusinessNo(String n){if(n==null||!n.matches("[0-9]{10}")||n.chars().distinct().count()==1)return false;int[] weights={1,3,7,1,3,7,1,3,5};int sum=0;for(int i=0;i<9;i++)sum+=(n.charAt(i)-'0')*weights[i];sum+=((n.charAt(8)-'0')*5)/10;return (10-sum%10)%10==n.charAt(9)-'0';}
    static String clean(String value){return value==null?"":value.trim();}
    static IllegalArgumentException invalid(String text){return new IllegalArgumentException(text);}
}
