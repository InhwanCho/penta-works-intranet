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
const ledgerCode=ts.transpileModule(readFileSync(new URL('../src/lib/counterparty-ledger.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {vatTotals,ledgerAmounts}=await import(`data:text/javascript;base64,${Buffer.from(ledgerCode).toString('base64')}`);
test('VAT excludes receipts and non deductible purchases; ledger uses gross amounts',()=>{
 const rows=[{kind:'SALE',amount:1100,vat:100},{kind:'PURCHASE',amount:550,vat:50,deductible:true},{kind:'PURCHASE',amount:220,vat:20,deductible:false},{kind:'RECEIPT',amount:1100,vat:0}];
 assert.deepEqual(vatTotals(rows),{sales:100,purchases:50,net:50});
 assert.deepEqual(ledgerAmounts(rows[0],'sales'),{debit:1100,credit:0});
 assert.deepEqual(ledgerAmounts(rows[3],'sales'),{debit:0,credit:1100});
 assert.deepEqual(ledgerAmounts(rows[1],'purchases'),{debit:0,credit:550});
});
