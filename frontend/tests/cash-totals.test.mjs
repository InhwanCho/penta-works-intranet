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
