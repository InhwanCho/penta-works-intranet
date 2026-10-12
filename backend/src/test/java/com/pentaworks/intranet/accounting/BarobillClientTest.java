package com.pentaworks.intranet.accounting;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BarobillClientTest {
    private String page(int current,int max,int count,String key){return "<CurrentPage>"+current+"</CurrentPage><MaxPageNum>"+max+"</MaxPageNum><MaxIndex>"+count+"</MaxIndex><BankAccountLogList><BankAccountTransLog><BankAccountNum>1234</BankAccountNum><TransRefKey>"+key+"</TransRefKey><TransDT>20261001100000</TransDT><Deposit>100</Deposit><Withdraw>0</Withdraw></BankAccountTransLog></BankAccountLogList>";}
    private String envelope(String method,String value){return "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body><"+method+"Response xmlns=\""+BarobillClient.NS+"\"><"+method+"Result>"+value+"</"+method+"Result></"+method+"Response></s:Body></s:Envelope>";}
    @Test void consumesFinalPageAndUsesOfficialParameterOrder() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var hits=new AtomicInteger();
        server.createContext("/",exchange->{int n=hits.incrementAndGet();String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
            assertTrue(body.contains("<TransDirection>1</TransDirection>"));assertTrue(body.contains("<CurrentPage>"+n+"</CurrentPage>"));
            byte[] response=envelope("GetPeriodBankAccountTransLog",page(n,2,2,"key"+n)).getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,response.length);try(var out=exchange.getResponseBody()){out.write(response);}});server.start();
        try {var client=new BarobillClient("fake","1234567890","test","test",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));
            assertEquals(2,client.transactions("1234",LocalDate.of(2026,10,1),LocalDate.of(2026,10,2)).size());assertEquals(2,hits.get());
        }finally{server.stop(0);}
    }
    @Test void rejectsProviderErrorInsteadOfReturningEmptySuccess() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{byte[] response=envelope("GetPeriodBankAccountTransLog","<CurrentPage>-50002</CurrentPage>").getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,response.length);try(var out=exchange.getResponseBody()){out.write(response);}});server.start();
        try {var client=new BarobillClient("fake","1234567890","test","test",URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/"));var error=assertThrows(BarobillClient.UpstreamException.class,()->client.transactions("1234",LocalDate.of(2026,10,1),LocalDate.of(2026,10,2)));assertTrue(error.getMessage().contains("-50002"));}
        finally{server.stop(0);}
    }
    @Test void keysAreStableAndCiphertextIsRandomizedAndAuthenticated() {
        String key=java.util.Base64.getEncoder().encodeToString(new byte[32]);var crypto=new AccountCrypto(key,key);
        String a=crypto.encrypt("1234567890"),b=crypto.encrypt("1234567890");assertNotEquals(a,b);assertEquals("1234567890",crypto.decrypt(a));assertEquals(crypto.identity("IBK","1234"),crypto.identity("IBK","1234"));assertNotEquals(crypto.identity("IBK","1234"),crypto.identity("HANA","1234"));
        assertThrows(IllegalArgumentException.class,()->crypto.decrypt(a.substring(0,a.length()-3)+"AAA"));
    }
}
