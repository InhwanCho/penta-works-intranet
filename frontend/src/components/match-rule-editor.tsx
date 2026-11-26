"use client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { CashPlan } from "@/lib/cash-planning";
const split = (value: string) => [...new Set(value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean))];
export function MatchRuleEditor({ plan, effectiveKeywords, disabled, onSave }: {
  plan: CashPlan;
  effectiveKeywords: string[];
  disabled: boolean;
  onSave: (keywords: string, days: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const tags = effectiveKeywords;
  const days = plan.match_days ?? 7;
  async function add(value: string, clearDraft = false) {
    const additions = split(value);
    if (!additions.length || additions.some(word => word.replace(/[^\p{L}\p{N}]/gu, "").length < 2)) {
      setError("검색어는 두 글자 이상 입력해주세요.");
      return;
    }
    const next = [...new Set([...tags, ...additions])].join(", ");
    if (next.length > 500) {
      setError("검색어 전체는 500자 이내로 입력해주세요.");
      return;
    }
    setError("");
    if ((next === tags.join(", ") || await onSave(next, days)) && clearDraft) setDraft("");
  }

  return <details className="review-disclosure">
    <summary><span><strong>현재 자동 식별 규칙</strong><small>검색어·날짜 범위 확인 및 수정</small></span><span className="review-disclosure-chevron" aria-hidden><ChevronDown /></span></summary>
    <div className="review-disclosure-body">
      <fieldset disabled={disabled} className="match-rule-fields">
        <label>적요 검색어</label>
        <div className="match-rule-tags">{tags.map(word => <button type="button" className="match-rule-tag" key={word} aria-label={word + " 검색어 제거"} onClick={() => { setError(""); void onSave(tags.filter(tag => tag !== word).join(", ") || "-", days); }}>{word}<span aria-hidden>×</span></button>)}{!tags.length && <small>적용된 검색어가 없습니다.</small>}</div>
        <div className="match-rule-add">
          <input aria-label="검색어 직접 입력" value={draft} maxLength={500} placeholder="검색어 입력 후 Enter" onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void add(draft, true); }
          }} />
          <button type="button" disabled={!draft.trim()} onClick={() => void add(draft, true)}>추가</button>
        </div>
        <label className="match-rule-days">예정일 전후<select value={days} onChange={event => void onSave(plan.match_keywords ?? "", Number(event.target.value))}>
          {Array.from({ length: 29 }, (_, day) => <option key={day} value={day}>{day}</option>)}
        </select>일</label>
        <small>변경 사항은 자동으로 저장됩니다.</small>
      </fieldset>
      {error && <p role="alert" className="cash-error">{error}</p>}
    </div>
  </details>;
}
