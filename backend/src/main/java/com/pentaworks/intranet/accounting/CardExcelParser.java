package com.pentaworks.intranet.accounting;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Component;

@Component
public class CardExcelParser {
    public record CardRow(String issuer, String cardNumber, String key, String sheet, int row,
                          Map<String, Object> fields, Map<String, String> raw) {
        public BigDecimal net() {
            return ((BigDecimal)fields.get("approval_amount")).add((BigDecimal)fields.get("approval_cancel_amount"));
        }
    }
    public record Parsed(String issuer, String fileHash, List<CardRow> rows) {}
    private static String header(String s) { return s.replaceAll("\\s+", ""); }
    public Parsed parse(byte[] bytes, String filename, String expectedIssuer) {
        if (bytes.length == 0 || bytes.length > 5 * 1024 * 1024) throw new IllegalArgumentException("카드 엑셀은 5MB 이하의 빈 파일이 아닌 파일을 선택해주세요.");
        if (filename == null || !filename.toLowerCase(Locale.ROOT).matches(".*\\.xlsx?")) throw new IllegalArgumentException("xls 또는 xlsx 파일을 선택해주세요.");
        List<CardRow> rows = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        String detected = null;
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            DataFormatter format = new DataFormatter(Locale.ROOT);
            for (Sheet sheet : wb) {
                Map<String,Integer> columns = null;
                String issuer = null;
                for (Row row : sheet) {
                    if (row.getRowNum() > 20000) throw new IllegalArgumentException("한 시트는 최대 20,000행까지 읽을 수 있습니다.");
                    Map<String,Integer> candidate = new HashMap<>();
                    for (Cell c : row) candidate.put(header(format.formatCellValue(c)), c.getColumnIndex());
                    if (columns == null) {
                        if (candidate.keySet().containsAll(List.of("수신정보구분코드","카드번호","승인일자","승인번호","승인금액(원화)","가맹점명"))) issuer = "BC";
                        else if (candidate.keySet().containsAll(List.of("이용일","카드번호","승인번호","승인금액","승인취소금액","상태","가맹점명"))) issuer = "HANA";
                        else continue;
                        if (detected != null && !detected.equals(issuer)) throw new IllegalArgumentException("서로 다른 카드사 양식이 섞여 있습니다.");
                        detected = issuer;
                        columns = candidate;
                        continue;
                    }
                    Map<String,String> values = new LinkedHashMap<>();
                    for (var c : columns.entrySet()) {
                        Cell cell = row.getCell(c.getValue());
                        if (cell != null && cell.getCellType() == CellType.FORMULA) throw new IllegalArgumentException("수식이 있는 거래 행은 업로드할 수 없습니다.");
                        values.put(c.getKey(), cell == null ? "" : format.formatCellValue(cell).trim());
                    }
                    String first = format.formatCellValue(row.getCell(0)).trim().replaceAll("\\s+", "");
                    if (first.isEmpty() && values.values().stream().allMatch(String::isBlank)) continue;
                    if (Set.of("합계","신용","체크").contains(first) || first.startsWith("이하여백") || first.startsWith("[조회일시")) continue;
                    try {
                        CardRow parsed = convert(issuer, sheet.getSheetName(), row.getRowNum()+1, values);
                        if (!keys.add(parsed.key())) throw new IllegalArgumentException("동일한 거래 키가 파일 안에 두 번 있습니다. 원본을 확인해주세요.");
                        rows.add(parsed);
                        if (rows.size() > 20000) throw new IllegalArgumentException("한 파일은 최대 20,000건까지 반영할 수 있습니다.");
                    } catch (IllegalArgumentException ex) {
                        throw new IllegalArgumentException(sheet.getSheetName() + " " + (row.getRowNum()+1) + "행: " + ex.getMessage());
                    }
                }
            }
        } catch (IllegalArgumentException ex) { throw ex; }
        catch (Exception ex) { throw new IllegalArgumentException("엑셀 파일을 읽을 수 없습니다. 암호화·손상 여부와 파일 형식을 확인해주세요."); }
        if (rows.isEmpty()) throw new IllegalArgumentException("지원하는 BC·하나 승인내역 거래를 찾지 못했습니다.");
        if (expectedIssuer != null && !expectedIssuer.equals(detected)) throw new IllegalArgumentException("선택한 카드사와 엑셀 양식이 다릅니다.");
        return new Parsed(detected, sha(bytes), List.copyOf(rows));
    }

    private CardRow convert(String issuer, String sheet, int row, Map<String,String> v) {
        boolean bc = issuer.equals("BC");
        String card = required(v,"카드번호").replaceAll("[\\s-]+", "").toUpperCase(Locale.ROOT);
        if (!card.matches("[0-9*Xx-]{12,30}")) throw new IllegalArgumentException("카드번호 형식이 올바르지 않습니다.");
        // Only masked source identifiers are retained by this importer.
        if (!card.contains("*") && !card.toUpperCase(Locale.ROOT).contains("X")) throw new IllegalArgumentException("전체 카드번호가 있는 파일은 마스킹 후 업로드해주세요.");
        String approval = required(v,"승인번호");
        if (approval.length() > 50) throw new IllegalArgumentException("승인번호가 너무 깁니다.");
        LocalDate date;
        LocalTime time;
        try { date = LocalDate.parse(required(v, bc?"승인일자":"이용일").replace('.','-')); time=LocalTime.parse(required(v,bc?"승인시간":"이용시간")); }
        catch (Exception ex) { throw new IllegalArgumentException("거래 날짜 또는 시간 형식이 올바르지 않습니다."); }
        String status = bc ? required(v,"수신정보구분코드") : required(v,"상태");
        if (!(bc ? Set.of("신규","취소") : Set.of("정상","승인취소")).contains(status)) throw new IllegalArgumentException("지원하지 않는 승인 상태입니다: " + status);
        String event = bc ? (status.equals("취소")?"CANCELLATION":"APPROVAL") : "SNAPSHOT";
        BigDecimal amount = money(required(v,bc?"승인금액(원화)":"승인금액"), false);
        BigDecimal cancel = bc ? BigDecimal.ZERO.setScale(2) : money(required(v,"승인취소금액"),false);
        if (cancel.signum()>0 || (bc && event.equals("CANCELLATION") && amount.signum()>0) || (bc && event.equals("APPROVAL") && amount.signum()<0) || (!bc && (amount.signum()<0 || amount.add(cancel).signum()<0))) throw new IllegalArgumentException("승인·취소 금액의 부호가 올바르지 않습니다.");
        if (!bc && ((status.equals("정상") && cancel.signum()!=0) || (status.equals("승인취소") && cancel.signum()==0))) throw new IllegalArgumentException("승인 상태와 취소금액이 일치하지 않습니다.");
        Map<String,Object> f = new LinkedHashMap<>();
        f.put("approval_no",approval); f.put("approval_date",date); f.put("source_time",time);
        f.put("time_precision",bc?"SECOND":"MINUTE"); f.put("event_type",event);
        f.put("approval_amount",amount); f.put("approval_cancel_amount",cancel);
        f.put("purchase_amount",bc?null:money(v.get("매입금액"),true));
        f.put("purchase_cancel_amount",bc?null:money(v.get("매출취소금액"),true));
        f.put("supply_amount",bc?money(v.get("거래금액(원화)"),true):null);
        f.put("vat_amount",money(v.get("부가세"),true)); f.put("service_charge",bc?money(v.get("봉사료"),true):null);
        f.put("currency","KRW"); f.put("merchant_name",required(v,"가맹점명"));
        f.put("merchant_business_no",nullable(v.get(bc?"가맹점사업자번호":"가맹점사업자번호")));
        f.put("approval_status",status); f.put("purchase_status",bc?null:nullable(v.get("매입")));
        String purchaseDate=bc?null:nullable(v.get("매입일"));
        try { f.put("purchase_date",purchaseDate==null?null:LocalDate.parse(purchaseDate.replace('.','-'))); }
        catch (Exception ex) { throw new IllegalArgumentException("매입일 형식이 올바르지 않습니다."); }
        // Currency cannot be inferred from country code; keep foreign source fields in raw_payload.
        if (bc && "국내".equals(v.get("국내외사용구분")) && f.get("supply_amount")!=null && f.get("vat_amount")!=null && f.get("service_charge")!=null) {
            BigDecimal expected=((BigDecimal)f.get("supply_amount")).add((BigDecimal)f.get("vat_amount")).add((BigDecimal)f.get("service_charge"));
            if (expected.compareTo(amount)!=0) throw new IllegalArgumentException("승인금액과 공급가액·부가세·봉사료 합계가 다릅니다.");
        }
        String identity = issuer+"|"+card+"|"+date+"|"+approval + (bc?"|"+event+"|"+time:"");
        return new CardRow(issuer,card,sha(identity.getBytes(StandardCharsets.UTF_8)),sheet,row,f,Collections.unmodifiableMap(v));
    }
    static String nullable(String value) { return value==null || value.isBlank() || value.equals("-") ? null:value; }
    static String required(Map<String,String> v,String key) { String result=nullable(v.get(key)); if(result==null) throw new IllegalArgumentException(key+" 값이 없습니다."); return result; }
    static BigDecimal money(String value,boolean optional) {
        String cleaned=nullable(value);
        if(cleaned==null) { if(optional) return null; throw new IllegalArgumentException("금액이 없습니다."); }
        try {
            BigDecimal n=new BigDecimal(cleaned.replace(",", "")).setScale(2,RoundingMode.UNNECESSARY);
            if(n.precision()>18) throw new ArithmeticException();
            return n;
        } catch(Exception ex) { throw new IllegalArgumentException("금액 형식이나 범위가 올바르지 않습니다."); }
    }
    static String sha(byte[] bytes) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); } catch(Exception ex){throw new IllegalStateException(ex);} }
}
