"use client";
import { useResetListFilters } from "@/lib/use-reset-list-filters";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { invoiceDisplayStatus, type Invoice } from "@/lib/tax-invoices";
import { monthBounds } from "@/lib/cash-planning";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { CashDialog } from "./cash-dialog";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, seoulToday, signedCashMoney } from "@/lib/cash-planning";
import { ledgerAmounts, vatTotals, type LedgerRow } from "@/lib/counterparty-ledger";
import { AccountingLoader } from "./loading-indicator";

type Data = { rows: LedgerRow[]; opening: { counterparty: string; receivable: number; payable: number }[]; parties: string[]; from: string; to: string };
const kinds: Record<string,string> = { SALE: "매출", PURCHASE: "매입", RECEIPT: "수금", PAYMENT: "지급" };
export function CounterpartyLedger() {
 const today=seoulToday();
 const [year,setYear]=useState(Number(today.slice(0,4))),[quarter,setQuarter]=useState(Math.ceil(Number(today.slice(5,7))/3));
 const [party,setParty]=useState(""),[mode,setMode]=useState("sales"),[editor,setEditor]=useState<LedgerRow|"new"|null>(null),[error,setError]=useState("");
 useResetListFilters(()=>{const date=seoulToday();setYear(Number(date.slice(0,4)));setQuarter(Math.ceil(Number(date.slice(5,7))/3));setParty("");setMode("sales");});
 const [linkRow,setLinkRow]=useState<LedgerRow|null>(null);
 const [summaryOpen,setSummaryOpen]=useState(false);
 const [plans,setPlans]=useState(true);
 const data=useApiQuery<Data>(`/accounting/counterparty-ledger?year=${year}&quarter=${quarter}&plans=${plans}`);
 const totals=useMemo(()=>vatTotals(data.data?.rows??[]),[data.data]);
 const ledger=useMemo(()=>{
  const byParty=new Map<string,Map<string,LedgerRow[]>>();
  for(const row of data.data?.rows??[]){
   if((party&&row.counterparty!==party)||!(mode==="sales"?["SALE","RECEIPT"]:["PURCHASE","PAYMENT"]).includes(row.kind))continue;
   let months=byParty.get(row.counterparty);
   if(!months){months=new Map();byParty.set(row.counterparty,months);}
   const month=row.date.slice(0,7),entries=months.get(month);
   if(entries)entries.push(row);else months.set(month,[row]);
  }
  return {byParty,parties:party?[party]:Array.from(new Set([...(data.data?.parties??[]),...byParty.keys()])),opening:new Map((data.data?.opening??[]).map(row=>[row.counterparty,row]))};
 },[data.data,party,mode]);
 const balances=useMemo(()=>{
   let receivable=0, payable=0;
   for(const opening of data.data?.opening??[]) {
     if(party && opening.counterparty!==party) continue;
     receivable+=Number(opening.receivable);
     payable+=Number(opening.payable);
   }
   for(const row of data.data?.rows??[]) {
     if(party && row.counterparty!==party) continue;
     const amount=Number(row.amount);
     switch(row.kind) {
       case "SALE": receivable+=amount; break;
       case "RECEIPT": receivable-=amount; break;
       case "PURCHASE": payable+=amount; break;
       case "PAYMENT": payable-=amount; break;
     }
   }
   return {receivable,payable};
 },[data.data,party]);
 const [linking,setLinking]=useState(false);
 async function acceptRecommendation(row:LedgerRow) {
   setLinking(true); setError("");
   try {
     await api(`/accounting/counterparty-ledger/${row.id}/invoice`,{method:"PUT",body:JSON.stringify({plans,invoiceId:row.recommended_invoice_id,previousId:null})});
     await data.refetch();
   } catch(e){setError(e instanceof Error?e.message:"추천 연결을 저장하지 못했습니다.");}
   finally{setLinking(false);}
 }
 const paymentMonth=quarter===4?`${year+1}년 1월`:`${year}년 ${quarter*3+1}월`;
 return <div className="cash-workspace accounting-office ledger-workspace"><header className="cash-page-heading"><h1>거래처 원장 · 부가세</h1>{!plans&&<button className="cash-create" disabled={!data.data} onClick={()=>setEditor("new")}>거래 등록</button>}</header>
 <div className="ledger-toolbar">
 <div className="accounting-filter-bar"><label>자료 기준<select value={plans?"plans":"manual"} onChange={e=>{setPlans(e.target.value==="plans");setParty("");}}><option value="plans">입출금 계획 자동 원장</option><option value="manual">수동 등록 원장</option></select></label><label>연도 <input aria-label="원장 연도" type="number" min="2000" max="2100" value={year} onChange={e=>{const n=Number(e.target.value);if(n>=2000&&n<=2100)setYear(n);}} /></label><label>조회 분기<select aria-label="조회 분기" value={quarter} onChange={e=>setQuarter(Number(e.target.value))}>{[1,2,3,4].map(q=><option key={q} value={q}>{q}분기 ({q*3-2}~{q*3}월)</option>)}</select></label><button onClick={()=>void data.refetch()}>새로고침</button><button disabled={!data.data} onClick={()=>window.print()}>인쇄</button></div>
 {data.data&&<aside className="ledger-overview" aria-label="분기 요약">
   <dl><div><dt>받을 잔액</dt><dd>{money(balances.receivable)}</dd></div>
   <div><dt>지급할 잔액</dt><dd>{money(balances.payable)}</dd></div>
   <div><dt>부가세 {totals.net<0?"환급":"납부"} 예상</dt><dd>{money(Math.abs(totals.net))}</dd></div></dl>
   <button type="button" aria-haspopup="dialog" onClick={()=>setSummaryOpen(true)}>분기 요약 상세</button>
 </aside>}</div>
 {summaryOpen && data.data && <CashDialog title={`${year}년 ${quarter}분기 요약 상세`} onClose={()=>setSummaryOpen(false)}>
   <div className="ledger-summary-detail">
     <p>{data.data.from} ~ {data.data.to} · {plans?"입출금 계획 자동 원장":"수동 등록 원장"}</p>
     <section><h3>{party||"전체 거래처"} · 분기 말 잔액</h3>
       <dl><dt>받을 잔액</dt><dd>{money(balances.receivable)}</dd><dt>지급할 잔액</dt><dd>{money(balances.payable)}</dd></dl>
     </section>
     <section><h3>전체 거래처 · 예상 부가세</h3>
       <dl><dt>매출세액</dt><dd>{money(totals.sales)}</dd>
       <dt>{plans?"예상 매입세액":"공제 대상 매입세액"}</dt><dd>{money(totals.purchases)}</dd>
       <dt>{totals.net<0?"환급":"납부"} 예상 차액</dt><dd><strong>{money(Math.abs(totals.net))}</strong></dd>
       <dt>납부 준비월</dt><dd>{paymentMonth}</dd></dl>
     </section>
     <section><h3>계산 기준</h3><p>{plans?"확정 계획과 실적이 연결된 계획을 예정일 기준으로 집계합니다. 입금 계획은 매출, 출금 계획은 공제 가능 매입으로 가정해 합계금액의 1/11(원 미만 버림)을 예상 세액으로 표시합니다. 카드 결제대금 및 급여·대출 등으로 식별한 항목은 제외합니다. 수금·지급은 연결한 은행 실적만 실제 날짜와 금액으로 반영합니다.":"등록한 거래 전체 기준의 단순 추정입니다. 매출·매입의 부가세만 집계하며 수금·지급은 세액을 늘리지 않습니다. 예정고지·기납부세액·가산세·기타 공제는 반영하지 않았습니다. 은행 입출금 및 세금계산서 화면의 자료는 자동 합산되지 않으므로 증빙별로 한 번씩 등록하세요. 매입 공제 여부는 증빙을 확인해 지정하세요."} <a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7693&mi=2310" target="_blank" rel="noreferrer">국세청 계산 기준</a></p></section>
   </div>
 </CashDialog>}
 {data.isError&&<p role="alert">{data.error.message}</p>}{data.isPending&&<AccountingLoader />}
 {data.data&&<>
 <div className="ledger-controls"><h2>거래처별 원장</h2><div className="accounting-filter-bar"><label>거래처<select aria-label="거래처 선택" value={party} onChange={e=>setParty(e.target.value)}><option value="">전체 거래처</option>{data.data?.parties.map(p=><option key={p}>{p}</option>)}</select></label><label>원장 종류<select aria-label="원장 종류" value={mode} onChange={e=>setMode(e.target.value)}><option value="sales">외상매출금 · 매출/수금</option><option value="purchases">외상매입금 · 매입/지급</option></select></label></div></div>
 {!ledger.parties.length&&<p className="cash-empty">{plans?"이 기간에 반영할 확정 계획이나 연결 실적이 없습니다.":"등록된 거래가 없습니다."}</p>}
 {ledger.parties.map(name=>{
  const months=ledger.byParty.get(name),opening=ledger.opening.get(name);
  let balance=Number(mode==="sales"?opening?.receivable??0:opening?.payable??0),debits=0,credits=0;
  if(!months?.size && !balance) return null;
  return <section className="cash-panel" key={name}><div className="cash-panel-heading"><h2>{name}</h2><span>{data.data?.from} ~ {data.data?.to} · {mode==="sales"?"외상매출금":"외상매입금"}</span></div><div className="cash-table-scroll"><table className={`cash-table ledger-table ledger-${mode} ${plans?"":"ledger-manual"}`}>
    <colgroup><col className="ledger-date"/><col/><col span={3} className="ledger-amount"/>
      {mode==="sales"&&<col className="ledger-invoice"/>}
      {!plans&&<><col span={2} className="ledger-amount"/><col className="ledger-action"/></>}
    </colgroup><thead><tr>{["일자","적요",mode==="sales"?"매출 (차변)":"지급 (차변)",mode==="sales"?"수금 (대변)":"매입 (대변)",mode==="sales"?"받을 잔액":"지급할 잔액",...(mode==="sales"?["세금계산서"]:[]),...(plans?[]:["공급가액","부가세","관리"])].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{balance!==0 && <tr><td colSpan={4}>전기 이월</td><td className="number">{signedCashMoney(balance)}</td>{mode==="sales"&&<td/>}{!plans&&<td colSpan={3}/>}</tr>}{Array.from(months??[]).map(([month,entries])=>{
   let md=0,mc=0;
   return <Fragment key={month}>{entries.map(r=>{const {debit,credit}=ledgerAmounts(r,mode);md+=debit;mc+=credit;debits+=debit;credits+=credit;balance+=mode==="sales"?debit-credit:credit-debit;return <tr key={r.kind+"-"+r.id}><td>{r.date}</td><td>{r.description}<small>{kinds[r.kind]}{!plans&&r.kind==="PURCHASE"?r.deductible?" · 공제":" · 불공제":""}</small></td><td className="number">{debit?money(debit):"—"}</td><td className="number">{credit?money(credit):"—"}</td><td className="number">{signedCashMoney(balance)}</td>{mode==="sales"&&<td>{r.kind==="SALE"?<>
     {r.invoice_id && !r.invoice_deleted ? <Link href={`/accounting/tax-invoices/${r.invoice_id}`}>{invoiceDisplayStatus({status:r.invoice_status!,nts_state:r.nts_state??null})} ↗</Link> : r.recommended_invoice_id ? <>
       <Link href={`/accounting/tax-invoices/${r.recommended_invoice_id}`}>추천 문서 ↗</Link>{" "}
       <button disabled={linking} onClick={()=>void acceptRecommendation(r)}>추천 연결</button>
     </> : <span>{r.invoice_deleted?"삭제된 문서":"미연결"}</span>}
     {" "}<button onClick={()=>setLinkRow(r)}>{r.invoice_id?"연결 변경":r.recommended_invoice_id?"직접 선택":"연결"}</button>
   </>:"—"}</td>}{!plans&&<><td className="number">{["SALE","PURCHASE"].includes(r.kind)?money(Number(r.amount)-Number(r.vat)):"—"}</td><td className="number">{["SALE","PURCHASE"].includes(r.kind)?money(r.vat):"—"}</td><td><button onClick={()=>setEditor(r)}>수정</button></td></>}</tr>;})}<tr className="cash-ledger-subtotal"><th colSpan={2}>{Number(month.slice(5))}월 합계</th><td className="number">{money(md)}</td><td className="number">{money(mc)}</td><td colSpan={(plans?1:4)+(mode==="sales"?1:0)}/></tr><tr className="cash-ledger-subtotal ledger-cumulative"><th colSpan={2}>기간 누계</th><td className="number">{money(debits)}</td><td className="number">{money(credits)}</td><td className="number">{signedCashMoney(balance)}</td>{mode==="sales"&&<td/>}{!plans&&<td colSpan={3}/>}</tr></Fragment>;
  })}</tbody></table></div></section>;
 })}</>}{linkRow&&<LedgerInvoicePicker row={linkRow} plans={plans} close={()=>setLinkRow(null)} saved={()=>{setLinkRow(null);void data.refetch();}}/>}{error&&<p role="alert">{error}</p>}{editor&&<LedgerEditor key={editor==="new"?"new":editor.id} row={editor==="new"?null:editor} parties={data.data?.parties??[]} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);setError("");void data.refetch();}}/>}</div>;
}
function LedgerInvoicePicker({row,plans,close,saved}:{row:LedgerRow;plans:boolean;close:()=>void;saved:()=>void}) {
 const [month,setMonth]=useState(row.date.slice(0,7));
 const [search,setSearch]=useState(""),[page,setPage]=useState(1);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const keyword=useDebouncedValue(search.trim());
 const bounds=monthBounds(month || row.date.slice(0,7));
 const query=useApiQuery<{rows:Invoice[];total:number}>(`/accounting/tax-invoices?${new URLSearchParams({...bounds,condition:"corpName",status:"ISSUED",keyword,page:String(page)})}`,!!month);
 async function save(invoiceId:number|null) {
   setBusy(true);setError("");
   try {
     await api(`/accounting/counterparty-ledger/${row.id}/invoice`,{method:"PUT",body:JSON.stringify({plans,invoiceId,previousId:row.invoice_id??null})});
     saved();
   } catch(e){setError(e instanceof Error?e.message:"연결을 저장하지 못했습니다.");}
   finally{setBusy(false);}
 }
 const invoices=query.data?.rows.filter(i=>i.environment!=="test")??[];
 return <CashDialog title="세금계산서 연결" onClose={close} closeDisabled={busy}>
   <p><strong>{row.counterparty}</strong> · {row.description} · {money(row.amount)}</p>
   <div className="accounting-filter-bar ledger-invoice-filters"><label>작성월<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setPage(1);}}/></label>
   <label>공급받는자<input autoFocus value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label></div>
   {query.isFetching&&<AccountingLoader/>}{query.isError&&<p role="alert">{query.error.message}</p>}
   {month&&query.isSuccess&&<div className="cash-table-scroll"><table className="cash-table"><thead><tr>{["작성일","공급받는자","합계금액","연결"].map(h=><th key={h}>{h}</th>)}</tr></thead>
   <tbody>{invoices.map(i=><tr key={i.id}><td>{i.write_date}</td><td><Link href={`/accounting/tax-invoices/${i.id}`} target="_blank">{i.customer_name} ↗</Link></td><td>{money(i.total_amount)}</td><td><button disabled={busy||i.id===row.invoice_id} onClick={()=>void save(i.id)}>{i.id===row.invoice_id?"연결됨":"선택"}</button></td></tr>)}
   {!invoices.length&&<tr><td colSpan={4}>표시할 발급 문서가 없습니다.</td></tr>}</tbody></table></div>}
   {Number(query.data?.total)>30&&<div><button disabled={page===1} onClick={()=>setPage(page-1)}>이전</button> {page} <button disabled={page*30>=Number(query.data?.total)} onClick={()=>setPage(page+1)}>다음</button></div>}
   {row.invoice_id&&<button disabled={busy} onClick={()=>void save(null)}>연결 해제</button>}{error&&<p role="alert">{error}</p>}
 </CashDialog>;
}
function LedgerEditor({row,parties,onClose,onSaved}:{row:LedgerRow|null;parties:string[];onClose:()=>void;onSaved:()=>void}) {
 const [form,setForm]=useState({date:row?.date??seoulToday(),counterparty:row?.counterparty??"",kind:row?.kind??"SALE",description:row?.description??"",amount:String(row?.amount??""),vat:String(row?.vat??"0"),deductible:Boolean(row?.deductible)}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const taxable=["SALE","PURCHASE"].includes(form.kind);
 const field=(key:string,value:string|boolean)=>setForm(f=>({...f,[key]:value}));
 async function save(cancel=false){setBusy(true);setError("");try{await api(`/accounting/counterparty-ledger${row?`/${row.id}`:""}${cancel?"/cancel":""}`,{method:cancel||!row?"POST":"PUT",body:JSON.stringify(cancel?{version:row?.version}:{...form,amount:Number(form.amount),vat:taxable?Number(form.vat):0,deductible:form.kind==="PURCHASE"&&form.deductible,version:row?.version??0})});onSaved();}catch(e){setError(e instanceof Error?e.message:"저장하지 못했습니다.");}finally{setBusy(false);}}
 return <CashDialog title={row?"원장 거래 수정":"원장 거래 등록"} onClose={onClose} closeDisabled={busy}><form className="cash-form" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}><div className="cash-form-grid"><label>일자<input required type="date" min="2000-01-01" max="2100-12-31" value={form.date} onChange={e=>field("date",e.target.value)}/></label><label>구분<select value={form.kind} onChange={e=>field("kind",e.target.value)}>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="wide">거래처<input required maxLength={200} list="ledger-parties" value={form.counterparty} onChange={e=>field("counterparty",e.target.value)}/><datalist id="ledger-parties">{parties.map(p=><option key={p}>{p}</option>)}</datalist></label><label className="wide">적요<input required maxLength={500} value={form.description} onChange={e=>field("description",e.target.value)}/></label><label>{taxable?"합계금액 (부가세 포함)":"금액"}<input required type="number" min="1" max="999999999999" step="1" value={form.amount} onChange={e=>field("amount",e.target.value)}/></label>{taxable&&<label>부가세<input required type="number" min="0" max={Number(form.amount)||0} step="1" value={form.vat} onChange={e=>field("vat",e.target.value)}/><button type="button" onClick={()=>field("vat",String(Math.floor(Number(form.amount)/11)))}>10% 과세 포함액으로 계산</button></label>}{form.kind==="PURCHASE"&&<label className="cash-check"><input type="checkbox" checked={form.deductible} onChange={e=>field("deductible",e.target.checked)}/>매입세액 공제 대상</label>}</div></fieldset>{taxable&&<p>공급가액 {money(Number(form.amount)-Number(form.vat))} · 면세·영세율 거래는 부가세 0원으로 입력하세요. 수정세금계산서 등 감액 거래는 현재 지원하지 않습니다.</p>}{error&&<p role="alert">{error}</p>}<footer>{row&&<button className="accounting-cancel" disabled={busy} type="button" onClick={()=>{if(window.confirm("이 원장 거래를 취소할까요?"))void save(true);}}>거래 취소</button>}<button className="cash-create" disabled={busy}>{busy?"저장 중…":"저장"}</button></footer></form></CashDialog>;
}
