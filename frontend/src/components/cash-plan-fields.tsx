"use client";

import { useId } from "react";

export function PlanChoice({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: [string, string][]; onChange: (value: string) => void; disabled?: boolean;
}) {
  const name = useId();
  if (options.length > 3) return <label>{label}<select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
  return <fieldset className="cash-plan-choice" disabled={disabled}>
    <legend>{label}</legend>
    <div>{options.map(([key, text]) => <label key={key}>
      <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />{text}
    </label>)}</div>
  </fieldset>;
}

export type PlanSchedule = { plannedDate: string; repeat: string; endMonth: string; previousBusinessDay: boolean };

export function planOccurrences(schedule: PlanSchedule) {
  if (schedule.repeat === "once") return 1;
  const [year, month] = schedule.plannedDate.split("-").map(Number);
  const [endYear, endMonth] = schedule.endMonth.split("-").map(Number);
  return (endYear - year) * 12 + endMonth - month + 1;
}

export function PlanScheduleFields({ value, onChange, single = false, prefix = "" }: {
  value: PlanSchedule; onChange: (value: PlanSchedule) => void; single?: boolean; prefix?: string;
}) {
  const firstMonth = value.plannedDate.slice(0, 7);
  function changeDate(plannedDate: string) {
    const month = plannedDate.slice(0, 7);
    onChange({ ...value, plannedDate, endMonth: value.endMonth < month ? month : value.endMonth });
  }
  return <div className="cash-plan-schedule">
    {!single && <PlanChoice label={prefix + "일정"} value={value.repeat}
      options={[["once", "한 번"], ["day", "매월 같은 날"], ["end", "매월 말일"]]}
      onChange={repeat => onChange({ ...value, repeat })} />}
    <div className="cash-plan-dates">
      {value.repeat === "end" && !single
        ? <label>{prefix}시작월<input required type="month" min="2000-01" max="2100-12" value={firstMonth} onChange={e => changeDate(e.target.value ? e.target.value + "-01" : "")} /></label>
        : <label>{prefix}예정일<input required type="date" min="2000-01-01" max="2100-12-31" value={value.plannedDate} onChange={e => changeDate(e.target.value)} /></label>}
      {!single && value.repeat !== "once" && <label>{prefix}종료월<input required type="month" min={firstMonth} max="2100-12" value={value.endMonth} onChange={e => onChange({ ...value, endMonth: e.target.value })} /></label>}
    </div>
    <label className="cash-check"><input type="checkbox" checked={value.previousBusinessDay}
      onChange={e => onChange({ ...value, previousBusinessDay: e.target.checked })} />휴일이면 직전 영업일</label>
  </div>;
}
