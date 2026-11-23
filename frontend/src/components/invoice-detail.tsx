import { Fragment } from "react";
import { invoiceMoney, invoiceStatuses, invoiceStatusDetail, lineAmounts, type Invoice, type Party } from "../lib/tax-invoices";

const barobill: Record<string, string> = {
  "1000": "임시저장", "2010": "발급예정 승인 대기", "2011": "발급예정 승인 완료",
  "2020": "역발행 요청 · 발급 대기", "3011": "발급예정 건 발급 완료", "3021": "역발행 완료",
  "3014": "발급 완료", "4012": "발급예정 거부", "4022": "역발행 요청 거부",
  "5013": "승인 전 공급자가 취소", "5023": "승인 전 공급받는자가 취소", "5031": "승인 또는 발급 후 공급자가 취소",
};
const nts: Record<string, string> = { "1": "전송 전", "2": "전송 대기", "3": "전송 중", "4": "전송 완료", "5": "전송 실패" };
function stateLabel(code: string | null, labels: Record<string,string>) {
  return code ? labels[code] ?? `미분류 상태 (코드 ${code})` : "미확인";
}

function InvoiceParty({party, supplier}: {party: Party; supplier?: boolean}) {
  const fields = [
    ["사업자번호", party.corpNum.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")],
    ["대표자", party.ceoName], ["종사업장", party.taxRegId], ["주소", party.addr],
    ["업태", party.bizType], ["종목", party.bizClass], ["담당자", party.contactName],
    ["이메일", party.email], ["연락처", party.tel], ["휴대폰", party.hp],
  ];
  return <section className={supplier ? "invoice-supplier" : "invoice-recipient"}>
    <h3>{supplier ? "공급자" : "공급받는자"}</h3><strong>{party.corpName}</strong>
    <dl>{fields.filter(([,value]) => value).map(([label,value]) =>
      <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>
  </section>;
}

export function InvoiceDetail({invoice}: {invoice: Invoice}) {
  const doc = invoice.document;
  const reason = invoiceStatusDetail(invoice);
  return <article className="invoice-paper">
    <header><div><h2>{doc.taxType === 3 ? "계산서" : "세금계산서"}</h2>
      <p>작성일 {doc.writeDate} · {doc.purposeType === 1 ? "영수" : "청구"} · {["","과세","영세율","면세"][doc.taxType]}</p></div>
      <strong className={`tax-badge ${invoice.status.toLowerCase()}`}>{invoice.environment === "test" && "테스트 · "}{invoiceStatuses[invoice.status]}</strong></header>
    <div className="invoice-identifiers"><div>국세청 승인번호 <b>{invoice.nts_key || "미확인"}</b></div><div>관리번호 <b>{invoice.mgt_key}</b></div></div>
    <p>바로빌 <b>{stateLabel(invoice.remote_state,barobill)}</b> · 국세청 <b>{stateLabel(invoice.nts_state,nts)}</b></p>
    {reason && <p className="invoice-reason">{reason}</p>}
    <div className="invoice-parties"><InvoiceParty party={invoice.issuer} supplier /><InvoiceParty party={doc.customer} /></div>
    <div className="invoice-lines"><table><thead><tr>{["공급일자","품목명 / 규격","수량","단가(원)","공급가액","세액","비고"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{doc.items.map((item,i) => {
        const amount = lineAmounts(item,doc.taxType);
        return <tr key={i}><td>{item.date}</td><td>{item.name}<small>{item.specification}</small></td><td>{item.quantity}</td>
          <td>{Number(item.grossUnitPrice ?? item.unitPrice).toLocaleString("ko-KR",{maximumFractionDigits:4})}{item.grossUnitPrice != null && <small>세금 포함</small>}</td>
          <td>{amount.supply.toLocaleString("ko-KR")}</td><td>{amount.tax.toLocaleString("ko-KR")}</td><td>{item.note}</td></tr>;
      })}</tbody></table></div>
    <div className="invoice-summary"><strong>합계 {invoiceMoney(invoice.total_amount)}</strong></div>
    {doc.remark && <p>비고　{doc.remark}</p>}
  </article>;
}
