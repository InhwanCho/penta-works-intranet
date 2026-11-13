import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/cash-planning.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { cashTotals, monthBounds } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('cash net includes only remaining plans, counts card bills once and excludes transfer principal', () => {
  const plans = [
    { direction: 'IN', remaining: 400, status: 'ACTIVE' },
    { direction: 'OUT', remaining: 200, status: 'ACTIVE' },
    { direction: 'OUT', remaining: 50, card_issuer: 'BC', status: 'ACTIVE' },
    { direction: 'OUT', remaining: 999, status: 'VOID' },
    { direction: 'OUT', remaining: 0, card_issuer: 'HANA', status: 'ACTIVE' },
  ];
  assert.deepEqual(cashTotals([{ income: 1000, expense: 305, transfer: -5000 }], plans),
    { income: 1000, expense: 305, plannedIn: 400, plannedOut: 200, cardOut: 50, net: 845 });
});
test('empty day is zero and month bounds include leap day and year end', () => {
  assert.equal(cashTotals([], []).net, 0);
  assert.equal(monthBounds('2028-02').to, '2028-02-29');
  assert.equal(monthBounds('2026-12').to, '2026-12-31');
});

test('positive cash net includes plus sign, zero and negative remain unambiguous', async () => {
 const { signedCashMoney } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 assert.equal(signedCashMoney(1000), '+1,000원');
 assert.equal(signedCashMoney(-1000), '-1,000원');
 assert.equal(signedCashMoney(0), '0원');
});
const ledgerCode=ts.transpileModule(readFileSync(new URL('../src/lib/counterparty-ledger.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {vatTotals,ledgerAmounts}=await import(`data:text/javascript;base64,${Buffer.from(ledgerCode).toString('base64')}`);
test('VAT excludes receipts and non deductible purchases; ledger uses gross amounts',()=>{
 const rows=[{kind:'SALE',amount:1100,vat:100},{kind:'PURCHASE',amount:550,vat:50,deductible:true},{kind:'PURCHASE',amount:220,vat:20,deductible:false},{kind:'RECEIPT',amount:1100,vat:0}];
 assert.deepEqual(vatTotals(rows),{sales:100,purchases:50,net:50});
 assert.deepEqual(ledgerAmounts(rows[0],'sales'),{debit:1100,credit:0});
 assert.deepEqual(ledgerAmounts(rows[3],'sales'),{debit:0,credit:1100});
 assert.deepEqual(ledgerAmounts(rows[1],'purchases'),{debit:0,credit:550});
});

 test('execution confirmation closes budget difference without altering actuals', async () => {
 const {planStatus,isOpenPlan}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 const plan={direction:'OUT',amount:110,settled:105,remaining:0,status:'ACTIVE',execution_confirmed:true,planned_date:'2026-11-10'};
 assert.equal(planStatus(plan),'완료');assert.equal(isOpenPlan(plan),false);
 assert.equal(cashTotals([{income:0,expense:105}],[plan]).plannedOut,0);
 assert.equal(planStatus({...plan,execution_confirmed:false,remaining:5}),'집행 연결 · 확정 대기');
 assert.equal(isOpenPlan({...plan,execution_confirmed:false,settled:110}),true);
 });

test('cash tolerance accepts either 20 percent or absolute 10000 won inclusive',async()=>{
 const {withinCashTolerance:within}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 assert.equal(within(1000,11000),true);assert.equal(within(1000,11001),false);
 assert.equal(within(100000,120000),true);assert.equal(within(100000,120001),false);
 assert.equal(within(15000,5000),true);assert.equal(within(0,5000),false);
});
const bankCode=ts.transpileModule(readFileSync(new URL('../src/lib/bank-review.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {bankReviewStatus}=await import(`data:text/javascript;base64,${Buffer.from(bankCode).toString('base64')}`);
test('bank review distinguishes allocation from final confirmation',()=>{
 const row={withdraw_amount:100,deposit_amount:0,allocated_total:0,confirmed_total:0};
 assert.equal(bankReviewStatus(row),'미확인');
 assert.equal(bankReviewStatus({...row,allocated_total:50}),'일부 연결');
 assert.equal(bankReviewStatus({...row,allocated_total:100}),'연결됨 · 완료 대기');
 assert.equal(bankReviewStatus({...row,allocated_total:100,confirmed_total:100}),'확인 완료');
 assert.equal(bankReviewStatus({...row,reviewed_without_plan:true}),'확인 완료 · 계획 없음');
});
const dailyCode=ts.transpileModule(readFileSync(new URL('../src/lib/cash-daily.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replace('"./cash-planning"',JSON.stringify(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`));
const {dailyBankRows}=await import(`data:text/javascript;base64,${Buffer.from(dailyCode).toString('base64')}`);
test('bank rows preserve totals and unknown balances and include unassigned plans',()=>{
 const accounts=[{id:1,bank_code:'HANA',bank_name:'하나'},{id:2,bank_code:'IBK',bank_name:'기업'}];
 const days=[{date:'2026-11-13',account_id:1,income:100,expense:20,transfer:-50},{date:'2026-11-13',account_id:2,income:0,expense:10,transfer:50}];
 const plans=[{account_id:1,direction:'OUT',remaining:30,status:'ACTIVE'},{account_id:2,direction:'OUT',remaining:40,card_issuer:'BC',status:'ACTIVE'},{account_id:null,direction:'IN',remaining:25,status:'ACTIVE'}];
 const rows=dailyBankRows(accounts,days,plans,[{date:'2026-11-13',account_id:1,balance:200},{date:'2026-11-13',account_id:2,balance:null}],'2026-11-13');
 assert.equal(rows.length,3);assert.equal(rows[1].balance,null);assert.equal(rows[0].balance,200);
 assert.equal(rows.reduce((sum,row)=>sum+row.net,0),cashTotals(days,plans).net);
 assert.equal(rows[1].cardOut,40);assert.equal(rows[2].plannedIn,25);
});

const recommendationsCode=ts.transpileModule(readFileSync(new URL('../src/lib/execution-recommendations.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {uniqueRecommendation}=await import(`data:text/javascript;base64,${Buffer.from(recommendationsCode).toString('base64')}`);
test('preselection requires one candidate with no competing plan or reversal',()=>{
 const candidate={id:11,recommended:true,reversal:false};const plan={id:1,recommendations:[candidate]};
 assert.equal(uniqueRecommendation(plan,[plan]),candidate);
 assert.equal(uniqueRecommendation(plan,[plan,{id:2,recommendations:[{...candidate,recommended:false}]}]),undefined);
 assert.equal(uniqueRecommendation({...plan,recommendations:[candidate,{...candidate,id:12}]},[plan]),undefined);
 assert.equal(uniqueRecommendation({...plan,recommendations:[{...candidate,reversal:true}]},[plan]),undefined);
});
test('only the review hub owns plan and bank confirmation editors',()=>{
 for(const name of ['cash-workspace','accounting-transactions']) {
 const text=readFileSync(new URL(`../src/components/${name}.tsx`,import.meta.url),'utf8');
 assert.doesNotMatch(text,/ExecutionEditor|BankExecutionReview|setMatching|setReviewRow|allocations\/|\/review`,/);
 }
 const hub=readFileSync(new URL('../src/components/execution-review.tsx',import.meta.url),'utf8');
 assert.match(hub,/<ExecutionEditor/);assert.match(hub,/<BankExecutionReview/);
});
