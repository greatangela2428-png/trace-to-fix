// 보고서 작성 도구의 데이터 모델: 근거 보관함(EvidenceItem) + 작성 중인 보고서(WorkReport).
// zod 스키마가 원본이고 타입은 추론한다. 시드 JSON과 이후 편집 결과 모두 이 스키마로 검증한다.
// 원칙: 저장값(사람·시스템이 넣은 원자료)과 파생값(코드가 계산)을 나눈다.
//  - 저장값: *Input 스키마. 시드 JSON의 모양
//  - 파생값: usedByReportIds, requiredFieldsMissing, decisionImpactKrw, EvidenceLink.status/priorityScore
// 개인명 필드는 어디에도 없다(원칙 6).
import { z } from "zod";

const IsoDate = z.iso.date();
const IsoDateTime = z.iso.datetime({ offset: true });

// ── 근거 보관함 ────────────────────────────────────────

export const EVIDENCE_TYPES = [
  "rate_table", // 운임표·단가표
  "quote_mail", // 견적 회신 메일
  "contract", // 계약 운임표
  "past_report", // 지난 보고서·시스템 실적
  "regulation", // 규제(KOTRA 수입규제 등)
  "booking_record", // 부킹·선적 기록(① 재작업 원인 필드의 저장 시점 점검 대상) — 사양 확장
  "reference", // 외부 참고자료(홍보물 등) — 사양 확장
] as const;
export const EvidenceTypeSchema = z.enum(EVIDENCE_TYPES);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  rate_table: "운임표",
  quote_mail: "견적 메일",
  contract: "계약",
  past_report: "실적·지난 보고서",
  regulation: "규제",
  booking_record: "부킹 기록",
  reference: "참고자료",
};

export const EvidenceFieldSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
});
export type EvidenceField = z.infer<typeof EvidenceFieldSchema>;

/** 시드·저장 화면이 넣는 값 */
export const EvidenceInputSchema = z.object({
  id: z.string(),
  type: EvidenceTypeSchema,
  title: z.string(),
  source: z.string(), // 출처(파일명·시스템·발신 부서). 빈 문자열이면 출처 불명확. 개인명 금지
  capturedAt: IsoDate,
  validFrom: IsoDate.optional(),
  validTo: IsoDate.optional(),
  scope: z.array(z.string()), // 적용 범위(예: ["부산-로테르담"])
  fields: z.array(EvidenceFieldSchema),
  canonicalId: z.string().optional(), // 중복이면 대표 항목 id(③). 사람이 병합을 승인해야 채워진다
  // ③ 분기 추정용 이력(사양 확장). 없으면 원인은 "추정 불가"
  history: z.array(z.object({ at: IsoDateTime, event: z.string(), fromId: z.string().optional() })).optional(),
});
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;

/** 화면이 쓰는 근거: 저장값 + 파생값 */
export interface EvidenceItem extends EvidenceInput {
  usedByReportIds: string[];
  requiredFieldsMissing: string[];
}

// ── 보고서 ─────────────────────────────────────────────

export const REPORT_TYPES = ["contract_decision", "management", "claim", "regular_status"] as const;
export const REPORT_TYPE_LABEL: Record<(typeof REPORT_TYPES)[number], string> = {
  contract_decision: "계약 결정",
  management: "관리 보고",
  claim: "클레임",
  regular_status: "정기 현황",
};

export const LINK_STATUSES = ["fresh", "expiring", "expired_at_apply", "conflict", "scope_gap", "unclear_basis", "missing"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];
export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  fresh: "최신",
  expiring: "곧 만료",
  expired_at_apply: "적용 시점 만료",
  conflict: "충돌",
  scope_gap: "범위 부족",
  unclear_basis: "포함 항목 불명확",
  missing: "연결 없음",
};

export const ImpactTypeSchema = z.enum(["direction", "magnitude"]); // 결론 방향에 영향 / 크기에만 영향
export type ImpactType = z.infer<typeof ImpactTypeSchema>;

/** 주장 → 근거 연결(저장값). 상태·점수는 코드가 계산한다 */
export const EvidenceLinkInputSchema = z.object({
  evidenceId: z.string(),
  field: z.string().optional(), // 근거의 어떤 값에 기대는가(fields[].key)
  impactType: ImpactTypeSchema,
  impactLine: z.string().optional(), // 없으면 코드가 문장을 만든다
});
export type EvidenceLinkInput = z.infer<typeof EvidenceLinkInputSchema>;

/** 연결 + 계산 결과 */
export interface EvidenceLink extends EvidenceLinkInput {
  status: LinkStatus;
  impactLine: string;
  priorityScore: number; // 결론 의존도 × 근거 약함 × 되돌리기 비용 × 영향유형 가중
}

export const ClaimInputSchema = z.object({
  id: z.string(),
  text: z.string(),
  quote: z.string(), // 본문에서 이 주장에 해당하는 원문 구절(하이라이트용)
  // 주장이 내세우는 수치(사양 확장): 근거 값과의 충돌 점검에 쓴다
  asserts: z.array(EvidenceFieldSchema).default([]),
  // 주장이 다루는 범위(사양 확장): 근거 범위보다 넓으면 범위 부족
  scope: z.array(z.string()).default([]),
  evidenceLinks: z.array(EvidenceLinkInputSchema),
});
export type ClaimInput = z.infer<typeof ClaimInputSchema>;

export const SectionInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  claims: z.array(ClaimInputSchema),
  status: z.enum(["empty", "draft", "done"]),
});
export type SectionInput = z.infer<typeof SectionInputSchema>;

/** 걸린 금액을 근거 값으로 계산하기 위한 식(사양 확장). 금액을 직접 적지 않는다(원칙 2) */
export const ImpactBasisSchema = z.object({
  label: z.string(), // 예: "현 선사 기준 연간 운임"
  volume: z.object({ evidenceId: z.string(), field: z.string() }),
  rate: z.object({ evidenceId: z.string(), field: z.string() }),
  rateMinus: z.object({ evidenceId: z.string(), field: z.string() }).optional(), // 차액 기준(클레임 등)
  fxKrwPerUsd: z.number().positive(), // 환율 가정(보고서에 적힌 값)
});
export type ImpactBasis = z.infer<typeof ImpactBasisSchema>;

export const WorkReportInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(REPORT_TYPES),
  audience: z.string(), // 팀장·임원·고객 등(직책, 개인명 아님)
  deadline: IsoDateTime,
  appliesFrom: IsoDate.optional(), // 결정 적용 시점: 만료 판단 기준
  impactBasis: ImpactBasisSchema.optional(),
  procedureId: z.string().optional(), // ④ 열람 기록과 연결(사양 확장)
  sections: z.array(SectionInputSchema),
});
export type WorkReportInput = z.infer<typeof WorkReportInputSchema>;

export interface WorkReport extends WorkReportInput {
  decisionImpactKrw?: number; // impactBasis로 계산
}

// ── 우선순위 ───────────────────────────────────────────
export interface PriorityItem {
  reportId: string;
  score: number;
  breakdown: { impact: number; urgency: number; unreadiness: number; audience: number };
  reasonLines: string[];
}

// ── 파생값 계산(순수 함수) ─────────────────────────────

export const fieldValue = (e: Pick<EvidenceInput, "fields">, key: string) => e.fields.find((f) => f.key === key)?.value;

const num = (v: string | number | undefined) => (typeof v === "number" ? v : undefined);

/** impactBasis → 걸린 금액(원). 값이 하나라도 없으면 계산하지 않는다(추측 금지). */
export function computeImpactKrw(basis: ImpactBasis, byId: Map<string, EvidenceInput>): number | undefined {
  const get = (r: { evidenceId: string; field: string }) => {
    const e = byId.get(r.evidenceId);
    return e ? num(fieldValue(e, r.field)) : undefined;
  };
  const volume = get(basis.volume);
  const rate = get(basis.rate);
  const minus = basis.rateMinus ? get(basis.rateMinus) : 0;
  if (volume === undefined || rate === undefined || minus === undefined) return undefined;
  return Math.round(volume * (rate - minus) * basis.fxKrwPerUsd);
}

/** 보고서들이 실제로 연결한 근거 id → 보고서 id 목록 */
export function usageIndex(reports: WorkReportInput[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const r of reports)
    for (const s of r.sections)
      for (const c of s.claims)
        for (const l of c.evidenceLinks) {
          const list = idx.get(l.evidenceId) ?? [];
          if (!list.includes(r.id)) list.push(r.id);
          idx.set(l.evidenceId, list);
        }
  return idx;
}

/** 연결된 근거가 보관함에 실제로 있는지(끊긴 링크는 시드 오류) */
export function danglingLinks(reports: WorkReportInput[], evidence: EvidenceInput[]): string[] {
  const ids = new Set(evidence.map((e) => e.id));
  return [...usageIndex(reports).keys()].filter((id) => !ids.has(id));
}
