// 재작업 역추적(보고서): 반려된 보고서에서 재작업이 필요했던 항목이
// 근거 저장 → 근거 끌어오기 → 본문 작성 → 제출본 중 어디서 처음 틀렸는지 거꾸로 찾는다.
// 판정 규칙은 traceOrigin(필드 이력 역추적)을 그대로 쓴다: 마지막 단계부터 거꾸로, 틀린 값이 끊기지 않고 이어진 가장 이른 단계.
import { z } from "zod";
import { traceOrigin, type TraceKind } from "./trace";
import { ReasonCodeSchema } from "./schemas";
import { REPORT_TYPES, type EvidenceItem, type EvidenceType } from "./workspace";

export const R_STAGES = ["SAVE", "PULL", "WRITE", "SUBMIT"] as const;
export type RStage = (typeof R_STAGES)[number];
export const R_STAGE_LABEL: Record<RStage, string> = {
  SAVE: "근거 저장",
  PULL: "근거 끌어오기",
  WRITE: "본문 작성",
  SUBMIT: "제출본",
};

/** 재작업 비용 가정: 재작업 시간 × 시간당 인건비(초기 가정, 화면에 표시) */
export const HOURLY_COST_KRW = 50_000;

export const ReportReworkCaseSchema = z.object({
  id: z.string(),
  report: z.string(), // 반려된 지난 보고서 제목
  reportType: z.enum(REPORT_TYPES),
  returnedAt: z.iso.date(),
  reviewer: z.string(), // 반려한 독자의 직책(개인명 아님)
  item: z.string(), // 재작업이 필요했던 항목
  correct: z.string(),
  values: z.object({ SAVE: z.string(), PULL: z.string(), WRITE: z.string(), SUBMIT: z.string() }),
  recordedReason: ReasonCodeSchema.optional(), // 반려 당시 기록된 사유(없을 수 있음)
  hours: z.number().positive(),
  comment: z.string(), // 반려 의견(AI 사유 분류 입력)
});
export type ReportReworkCase = z.infer<typeof ReportReworkCaseSchema>;

export interface RTrace {
  caseId: string;
  item: string;
  origin: RStage;
  kind: TraceKind; // MISSING: 비어 있음 / WRONG: 값이 틀림
  steps: { stage: RStage; value: string; status: "OK" | "ERROR" | "ORIGIN" }[];
  cost: number;
}

export const costOf = (c: ReportReworkCase) => Math.round(c.hours * HOURLY_COST_KRW);

export function traceReportCase(c: ReportReworkCase): RTrace | null {
  const values = R_STAGES.map((s) => c.values[s]);
  const t = traceOrigin(values, c.correct);
  if (!t) return null;
  return {
    caseId: c.id,
    item: c.item,
    origin: R_STAGES[t.origin]!,
    kind: t.kind,
    steps: R_STAGES.map((stage, i) => ({
      stage,
      value: c.values[stage],
      status: i === t.origin ? "ORIGIN" : i > t.origin && values[i] !== c.correct ? "ERROR" : "OK",
    })),
    cost: costOf(c),
  };
}

// ── 패턴과 개선 연결 ───────────────────────────────────
/** 저장 단계에서 비어 있던 항목 → 보관함 근거의 어떤 필드를 저장 필수로 할지 */
export const ITEM_FIELD: Record<string, { types: EvidenceType[]; field: string; label: string }> = {
  "운임 포함 항목": { types: ["rate_table", "quote_mail", "contract"], field: "포함 항목", label: "포함 항목" },
  "근거 유효기간": { types: ["rate_table", "quote_mail", "contract"], field: "@validTo", label: "유효기간" },
};

/** 끌어오기·작성 단계에서 시작된 항목 → 이미 동작 중인 작성 중 점검 규칙(없으면 규칙 후보) */
export const ITEM_RULE: Record<string, { ruleId?: string; name: string }> = {
  "적용 운임표 분기": { ruleId: "expired-at-apply", name: "적용 시점 만료(끌어올 때 미리 보기)" },
  "BAF 값": { ruleId: "conflict", name: "충돌 + 보관함 중복·분기 정리" },
  "적용 구간": { ruleId: "scope-gap", name: "범위 부족" },
  "금액 단위": { name: "단위 일치 점검(규칙 후보, 아직 없음)" },
  "비교 대상": { name: "비교 대상 누락 점검(기존 논리 역추적 규칙, 작성 화면 미연결)" },
};

export interface RPattern {
  key: string; // `${origin}|${item}|${kind}`
  origin: RStage;
  item: string;
  kind: TraceKind;
  caseIds: string[];
  hours: number;
  cost: number;
}

export function aggregateRPatterns(traces: RTrace[], cases: ReportReworkCase[]): RPattern[] {
  const hours = new Map(cases.map((c) => [c.id, c.hours]));
  const map = new Map<string, RPattern>();
  for (const t of traces) {
    const key = `${t.origin}|${t.item}|${t.kind}`;
    const p = map.get(key) ?? { key, origin: t.origin, item: t.item, kind: t.kind, caseIds: [], hours: 0, cost: 0 };
    p.caseIds.push(t.caseId);
    p.hours += hours.get(t.caseId) ?? 0;
    p.cost += t.cost;
    map.set(key, p);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost || b.caseIds.length - a.caseIds.length);
}

/** 저장 필수 후보(보관함): 저장 단계에서 비어 있던 항목만. 승인 키 = `${type}|${field}` 묶음 */
export interface RequiredFromReports {
  key: string; // 승인 키(대표): "report|포함 항목"
  item: string;
  types: EvidenceType[];
  field: string;
  label: string;
  preventable: string[]; // 저장 시 필수였다면 막을 수 있었던 반려
  preventableCost: number;
  burden: { extraFieldsPerSave: number; backfill: string[] }; // 저장할 때 더 입력할 항목 수, 지금 보관함에서 채워야 할 근거
}

export function requiredFromReports(patterns: RPattern[], evidence: EvidenceItem[]): RequiredFromReports[] {
  return patterns
    .filter((p) => p.origin === "SAVE" && p.kind === "MISSING" && ITEM_FIELD[p.item])
    .map((p) => {
      const m = ITEM_FIELD[p.item]!;
      const backfill = evidence
        .filter((e) => m.types.includes(e.type) && !e.canonicalId)
        .filter((e) => (m.field === "@validTo" ? !e.validTo : !e.fields.some((f) => f.key === m.field && f.value !== "")))
        .map((e) => e.id);
      return {
        key: `report|${m.field}`,
        item: p.item,
        types: m.types,
        field: m.field,
        label: m.label,
        preventable: p.caseIds,
        preventableCost: p.cost,
        burden: { extraFieldsPerSave: 1, backfill },
      };
    });
}

/** 가상 재실행: 이 필드를 저장 필수로 했다면 전체 반려 중 몇 건을 막았나(저장 단계 누락만 예방으로 센다) */
export function simulateRequired(candidate: RequiredFromReports, traces: RTrace[]) {
  const prevented = traces.filter((t) => candidate.preventable.includes(t.caseId));
  const notPrevented = traces.filter((t) => !candidate.preventable.includes(t.caseId));
  return {
    total: traces.length,
    prevented: prevented.length,
    savedCost: prevented.reduce((s, t) => s + t.cost, 0),
    sameItemNotPrevented: notPrevented.filter((t) => t.item === candidate.item).length,
  };
}
