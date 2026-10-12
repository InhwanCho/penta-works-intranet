package com.pentaworks.intranet.accounting;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AccountCrypto {
    private final byte[] encryptionKey, identityKey;
    public AccountCrypto(@Value("${app.accounting.encryption-key:}") String encryption,
                         @Value("${app.accounting.identity-key:}") String identity) {
        encryptionKey=decode(encryption); identityKey=decode(identity);
    }
    private byte[] decode(String s) { try { return s.isBlank()?new byte[0]:Base64.getDecoder().decode(s); } catch(Exception ex){return new byte[0];} }
    public boolean ready(){return encryptionKey.length==32 && identityKey.length>=32;}
    private void require(){if(!ready()) throw new IllegalArgumentException("계좌 암호화 설정이 필요합니다. 서버 관리자에게 문의해주세요.");}
    public String identity(String bank, String number) {
        require();
        try { Mac m=Mac.getInstance("HmacSHA256"); m.init(new SecretKeySpec(identityKey,"HmacSHA256")); return HexFormat.of().formatHex(m.doFinal((bank+"|"+number).getBytes(StandardCharsets.UTF_8))); }
        catch(Exception ex){throw new IllegalStateException("계좌 식별 처리 실패");}
    }
    public String encrypt(String number) {
        require();
        try { byte[] iv=new byte[12];new SecureRandom().nextBytes(iv); Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,iv));return "v1:"+Base64.getEncoder().encodeToString(iv)+":"+Base64.getEncoder().encodeToString(c.doFinal(number.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception ex){throw new IllegalStateException("계좌 암호화 실패");}
    }
    public String decrypt(String value) {
        require();
        try { String[] parts=value.split(":"); if(parts.length!=3 || !parts[0].equals("v1")) throw new IllegalArgumentException(); Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(encryptionKey,"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[1]))); return new String(c.doFinal(Base64.getDecoder().decode(parts[2])),StandardCharsets.UTF_8); }
        catch(Exception ex){throw new IllegalArgumentException("계좌 복호화에 실패했습니다. 서버 암호화 키를 확인해주세요.");}
    }
    static String masked(String number){return "****-"+number.substring(Math.max(0,number.length()-4));}
}
