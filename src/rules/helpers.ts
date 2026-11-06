// 규칙들이 함께 쓰는 작은 함수: 적용 시점, 범위 포함 관계, 값 비교
import type { EvidenceInput, WorkReportInput } from "../domain/workspace";

/** 결정이 실제로 적용되는 날. 없으면 마감일(보고서가 쓰이는 날) */
export const applyDate = (r: WorkReportInput) => r.appliesFrom ?? r.deadline.slice(0, 10);

/** 날짜에 일수를 더한다(YYYY-MM-DD) */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 범위 계층: 상위 범위 → 하위 구간. 샘플 항로만 담았다(실데이터는 항로 마스터로 대체).
 * 결론이 상위 범위인데 근거가 하위 구간 하나뿐이면 '범위 부족'.
 */
export const SCOPE_TREE: Record<string, string[]> = {
  "유럽 항로": ["부산-로테르담", "부산-함부르크", "부산-앤트워프", "부산-르아브르", "부산-제노바", "부산-예테보리"],
  "동남아 항로": ["부산-호찌민", "부산-방콕"],
};

/** 근거 범위가 주장 범위 하나를 덮는가(같거나, 근거가 상위 범위) */
export function covers(evidenceScope: string[], target: string): boolean {
  if (evidenceScope.includes(target)) return true;
  return evidenceScope.some((s) => SCOPE_TREE[s]?.includes(target));
}

/** 근거가 덮지 못하는 주장 범위들 */
export const uncovered = (evidenceScope: string[], claimScope: string[]) => claimScope.filter((t) => !covers(evidenceScope, t));

export const valueOf = (e: EvidenceInput, key: string) => e.fields.find((f) => f.key === key)?.value;

export const fmtValue = (v: string | number, unit?: string) =>
  `${typeof v === "number" ? v.toLocaleString("ko-KR") : v}${unit ? ` ${unit}` : ""}`;

/** 운임 성격의 값인가(포함 항목을 따져야 하는 값) */
// BAF·THC는 그 자체가 부대비용 한 항목이라 "부대비용 포함 여부"를 묻지 않는다(오탐 방지)
export const isFreightField = (key: string) => /운임/.test(key);
