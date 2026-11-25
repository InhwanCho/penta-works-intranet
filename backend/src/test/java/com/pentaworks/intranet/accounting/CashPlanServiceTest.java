package com.pentaworks.intranet.accounting;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CashPlanServiceTest {
    @Test void payrollRecommendationRequiresTheEmployeeEvenWithGenericKeywords() {
        var plan=java.util.Map.<String,Object>of(
            "title","신명준(오후) 급여","direction","OUT","match_keywords","급여",
            "planned_date","2026-01-02","match_days",7,"amount",100000,"settled",0);
        var transaction=new java.util.HashMap<String,Object>(java.util.Map.of(
            "trans_at",java.sql.Timestamp.valueOf("2026-01-02 09:00:00"),
            "description","급여 조재영","counterparty_text","","withdraw_amount",100000,"available",100000));
        CashPlanService.annotateCandidate(plan,transaction);
        assertEquals(false,transaction.get("recommended"));
        transaction.put("description","급여 신명준");
        CashPlanService.annotateCandidate(plan,transaction);
        assertEquals(true,transaction.get("recommended"));
    }

    @org.junit.jupiter.api.Test void toleranceIsInclusiveAndUnknownBudgetIsNotAutomatic() {
        var expected=new java.math.BigDecimal("100000");
        org.junit.jupiter.api.Assertions.assertTrue(CashPlanService.withinTolerance(expected,new java.math.BigDecimal("80000")));
        org.junit.jupiter.api.Assertions.assertTrue(CashPlanService.withinTolerance(expected,new java.math.BigDecimal("120000")));
        org.junit.jupiter.api.Assertions.assertFalse(CashPlanService.withinTolerance(expected,new java.math.BigDecimal("120001")));
        assertTrue(CashPlanService.withinTolerance(new BigDecimal("1000"),new BigDecimal("11000")));
        assertFalse(CashPlanService.withinTolerance(new BigDecimal("1000"),new BigDecimal("11001")));
        assertTrue(CashPlanService.withinTolerance(new BigDecimal("15000"),new BigDecimal("5000")));
        org.junit.jupiter.api.Assertions.assertFalse(CashPlanService.withinTolerance(java.math.BigDecimal.ZERO,java.math.BigDecimal.ZERO));
    }

    @Test void bcSplitWithdrawalsMatchOnlyAnUnambiguousExactBalance() {
        var plan=java.util.Map.<String,Object>of("amount",5067059,"settled",0);
        var first=java.util.Map.<String,Object>of("id",335,"available",4507709,"withdraw_amount",4507709,
            "description","비씨카드출금","trans_at",java.sql.Timestamp.valueOf("2026-11-25 08:00:00"));
        var second=new java.util.HashMap<>(first);
        second.put("id",336);second.put("available",559350);second.put("withdraw_amount",559350);
        assertEquals(java.util.Set.of(335L,336L),CashPlanService.uniqueCardPair(plan,java.util.List.of(first,second)));
        second.put("available",559351);
        assertTrue(CashPlanService.uniqueCardPair(plan,java.util.List.of(first,second)).isEmpty());
    }
    @Test void confirmedCardDetailsRequireDatesAndAccount() {
        assertThrows(IllegalArgumentException.class,()->AccountingService.validateCardCash(new AccountingService.CardCashInput(null,null,null,"CONFIRMED","",0)));
        assertThrows(IllegalArgumentException.class,()->AccountingService.validateCardCash(new AccountingService.CardCashInput(LocalDate.of(2026,1,2),null,null,"ESTIMATED","",0)));
        assertDoesNotThrow(()->AccountingService.validateCardCash(new AccountingService.CardCashInput(null,null,null,"ESTIMATED","미확정",0)));
    }
    @Test void cardBillsUseTheirOwnBank() {
        assertTrue(CashPlanService.cardBankMatches("BC","003","기업은행"));
        assertTrue(CashPlanService.cardBankMatches("HANA","081","하나은행"));
        assertFalse(CashPlanService.cardBankMatches("BC","081","하나은행"));
        assertFalse(CashPlanService.cardBankMatches("HANA","003","기업은행"));
    }

    @Test void monthlyRecurrenceDoesNotDriftAfterFebruary() {
        LocalDate start=LocalDate.of(2026,1,31);
        assertEquals(LocalDate.of(2026,2,28),CashPlanService.occurrence(start,1,false));
        assertEquals(LocalDate.of(2026,3,31),CashPlanService.occurrence(start,2,false));
        assertEquals(LocalDate.of(2028,2,29),CashPlanService.occurrence(start,25,true));
        assertEquals(LocalDate.of(2026,4,30),CashPlanService.occurrence(LocalDate.of(2026,3,15),1,true));
    }
    @Test void cashAmountsArePositiveWholeWonWithinSafeRange() {
        for(String value:new String[]{"0","-1","0.5","1000000000000"})assertThrows(IllegalArgumentException.class,()->CashPlanService.positive(new BigDecimal(value)));
        assertDoesNotThrow(()->CashPlanService.positive(new BigDecimal("999999999999.00")));
    }
}
