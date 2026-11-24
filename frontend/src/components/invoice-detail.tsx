import { Fragment } from "react";
import { invoiceMoney, netUnitPriceText, invoiceStatuses, invoiceStatusDetail, lineAmounts, type Invoice, type Party } from "../lib/tax-invoices";

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

function partyRows(party: Party) {
  return [
    ["등록번호", party.corpNum.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3"), "종사업장", party.taxRegId],
    ["상호", party.corpName, "대표자", party.ceoName],
    ["사업장 주소", party.addr],
    ["업태", party.bizType, "종목", party.bizClass],
    ["이메일", party.email],
    ["담당자", party.contactName, "연락처", [party.tel, party.hp].filter((v,i,a) => v && a.indexOf(v) === i).join(" / ")],
  ];
}

function PartyTable({parties, className}: {parties: {party: Party; supplier: boolean}[]; className: string}) {
  const groups = parties.map(({party,supplier}) => ({
    title: supplier ? "공급자" : "공급받는자",
    tone: supplier ? "invoice-supplier" : "invoice-recipient",
    rows: partyRows(party),
  }));
  return <table className={className}>
    {groups.map(group => <colgroup key={group.title}><col className="party-key" /><col /><col className="party-key" /><col /></colgroup>)}
    <thead><tr>{groups.map(group => <th key={group.title} className={group.tone} scope="colgroup" colSpan={4}>{group.title}</th>)}</tr></thead>
    <tbody>{groups[0].rows.map(([key],i) => <tr key={key}>{groups.map(group => {
      const [label,value,other,detail] = group.rows[i];
      return <Fragment key={group.title}><th className={group.tone}>{label}</th><td colSpan={other ? 1 : 3}>{value}</td>
        {other && <><th className={group.tone}>{other}</th><td>{detail}</td></>}</Fragment>;
    })}</tr>)}</tbody>
  </table>;
}

export function InvoiceDetail({invoice}: {invoice: Invoice}) {
  const doc = invoice.document;
  const parties = [{party: invoice.issuer, supplier: true}, {party: doc.customer, supplier: false}];
  const reason = invoiceStatusDetail(invoice);
  return <article className="invoice-paper">
    <header><div><h2>{invoice.original_id ? "수정" : ""}{doc.taxType === 3 ? "계산서" : doc.taxType === 2 ? "영세율 세금계산서" : "세금계산서"}</h2>
</div>
      <strong className={`tax-badge ${invoice.status.toLowerCase()}`}>{invoice.environment === "test" && "테스트 · "}{invoiceStatuses[invoice.status]}</strong></header>
    <div className="invoice-identifiers"><div>국세청 승인번호 <b>{invoice.nts_key || "미확인"}</b></div><div>관리번호 <b>{invoice.mgt_key}</b></div></div>
    {invoice.status === "SCHEDULED" && <p><strong>예약 발급　{invoice.scheduled_date} 오전 2시 (한국시간)</strong></p>}
    <p>바로빌 <b>{stateLabel(invoice.remote_state,barobill)}</b> · 국세청 <b>{stateLabel(invoice.nts_state,nts)}</b></p>
    {reason && <p className="invoice-reason">{reason}</p>}
    <div className="invoice-parties">
      <PartyTable parties={parties} className="party-wide" />
      {parties.map(group => <PartyTable key={String(group.supplier)} parties={[group]} className="party-narrow" />)}
    </div>
    <dl className="invoice-amounts">{[
      ["작성일자",doc.writeDate],["공급가액",invoiceMoney(invoice.supply_amount)],
      ["세액",invoiceMoney(invoice.tax_amount)],["비고",doc.remark],
    ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="invoice-lines"><table><thead><tr>{["공급일자","품목","규격","수량","단가(원)","공급가액","세액","비고"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{doc.items.map((item,i) => {
        const amount = lineAmounts(item,doc.taxType);
        return <tr key={i}><td>{item.date}</td><td>{item.name}</td><td>{item.specification}</td><td>{invoice.correction_sign===-1?"−":""}{item.quantity}</td>
          <td>{netUnitPriceText(item, amount.supply)}</td>
          <td>{(amount.supply*BigInt(invoice.correction_sign??1)).toLocaleString("ko-KR")}</td><td>{(amount.tax*BigInt(invoice.correction_sign??1)).toLocaleString("ko-KR")}</td><td>{item.note}</td></tr>;
      })}</tbody></table></div>
    <div className="invoice-summary"><span>이 금액을 <b>{doc.purposeType === 1 ? "영수" : "청구"}</b>합니다.</span><strong>합계금액 {invoiceMoney(invoice.total_amount)}</strong></div>

  </article>;
}
