// 금액 민감도(코드 계산): 충돌하는 운임 값마다 기준 운임 대비 할인율과 연 절감액을 계산한다.
// 가정: 물동량 전량에 같은 요율 적용, 환율 고정(보고서에 적힌 값). 화면에 가정을 함께 표시한다.
import { fieldValue, type EvidenceInput, type WorkReportInput } from "./workspace";
import type { EvaluatedClaim } from "../rules";

export interface SensitivityRow {
  label: string; // 값의 출처(보고서·근거 제목)
  rate: number;
  discountPct: number; // 기준 대비 저렴한 비율(%)
  annualSavingKrw: number;
}
export interface Sensitivity {
  field: string; // 충돌한 항목(예: A 선사 40ft 운임)
  unit?: string;
  base: { label: string; field: string; rate: number }; // 비교 기준(예: 현 선사 2,100)
  volume: { label: string; value: number; unit?: string };
  fxKrwPerUsd: number;
  rows: SensitivityRow[]; // 값이 큰 절감부터
  changePct: number; // 가장 큰 절감 대비 가장 작은 절감이 몇 % 줄었나
  asserted?: { value: number; diffPct: number }; // 보고서 본문에 적힌 절감액과 계산값 차이
}

export const savingOf = (base: number, rate: number, volume: number, fx: number) => Math.round((base - rate) * volume * fx);
export const discountOf = (base: number, rate: number) => ((base - rate) / base) * 100;

/**
 * 충돌이 있는 운임 항목에 대해 민감도를 만든다. 보고서에 걸린 금액 계산식(impactBasis)이 있고
 * 차액형(rateMinus)이 아닐 때만 만든다(그 외에는 '절감액'이라는 해석이 맞지 않음).
 */
export function buildSensitivity(
  report: WorkReportInput,
  evaluated: EvaluatedClaim[],
  byId: Map<string, EvidenceInput>,
): Sensitivity | null {
  const basis = report.impactBasis;
  if (!basis || basis.rateMinus) return null;
  const baseEv = byId.get(basis.rate.evidenceId);
  const volEv = byId.get(basis.volume.evidenceId);
  const baseRate = baseEv ? fieldValue(baseEv, basis.rate.field) : undefined;
  const volume = volEv ? fieldValue(volEv, basis.volume.field) : undefined;
  if (typeof baseRate !== "number" || typeof volume !== "number" || !baseEv || !volEv) return null;

  // 충돌이 걸린 링크 중 기준 운임이 아닌 운임 항목
  for (const ec of evaluated) {
    const conflicted = ec.links.find((l) => l.status === "conflict" && l.field && l.field !== basis.rate.field && /운임/.test(l.field));
    if (!conflicted?.field) continue;
    const field = conflicted.field;
    const values = new Map<number, string>();
    const asserted = ec.claim.asserts.find((a) => a.key === field);
    if (asserted && typeof asserted.value === "number") values.set(asserted.value, "보고서 본문");
    for (const l of ec.links) {
      if (l.field !== field || !l.evidence) continue;
      const v = fieldValue(l.evidence, field);
      if (typeof v === "number" && !values.has(v)) values.set(v, l.evidence.title);
      else if (typeof v === "number") values.set(v, `${values.get(v)} · ${l.evidence.title}`);
    }
    if (values.size < 2) continue;
    const rows = [...values.entries()]
      .map(([rate, label]) => ({
        label,
        rate,
        discountPct: discountOf(baseRate, rate),
        annualSavingKrw: savingOf(baseRate, rate, volume, basis.fxKrwPerUsd),
      }))
      .sort((a, b) => b.annualSavingKrw - a.annualSavingKrw);
    const hi = rows[0]!.annualSavingKrw;
    const lo = rows.at(-1)!.annualSavingKrw;
    // 보고서 본문에 적힌 절감액과 계산값 대조(같은 보고서의 '연간 절감액' 주장)
    const savingClaim = evaluated.flatMap((x) => x.claim.asserts).find((a) => a.key === "연간 절감액");
    return {
      field,
      unit: baseEv.fields.find((f) => f.key === basis.rate.field)?.unit,
      base: { label: baseEv.title, field: basis.rate.field, rate: baseRate },
      volume: { label: volEv.title, value: volume, unit: volEv.fields.find((f) => f.key === basis.volume.field)?.unit },
      fxKrwPerUsd: basis.fxKrwPerUsd,
      rows,
      changePct: hi > 0 ? ((hi - lo) / hi) * 100 : 0,
      asserted:
        savingClaim && typeof savingClaim.value === "number"
          ? { value: savingClaim.value, diffPct: hi ? ((savingClaim.value - hi) / hi) * 100 : 0 }
          : undefined,
    };
  }
  return null;
}
