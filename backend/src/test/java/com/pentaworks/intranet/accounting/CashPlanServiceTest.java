package com.pentaworks.intranet.accounting;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CashPlanServiceTest {
    @org.junit.jupiter.api.Test void toleranceIsInclusiveAndUnknownBudgetIsNotAutomatic() {
        var expected=new java.math.BigDecimal("100");
        org.junit.jupiter.api.Assertions.assertTrue(CashPlanService.withinTolerance(expected,new java.math.BigDecimal("80")));
        org.junit.jupiter.api.Assertions.assertTrue(CashPlanService.withinTolerance(expected,new java.math.BigDecimal("120")));
        org.junit.jupiter.api.Assertions.assertFalse(CashPlanService.withinTolerance(expected,new java.math.BigDecimal("121")));
        org.junit.jupiter.api.Assertions.assertFalse(CashPlanService.withinTolerance(java.math.BigDecimal.ZERO,java.math.BigDecimal.ZERO));
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
