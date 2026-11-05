// 도메인 모델: zod 스키마가 원본이고 TypeScript 타입은 여기서 추론한다.
// 시드 JSON과 이후 LLM 출력 모두 이 스키마로 검증한 뒤 사용한다.
// 원칙: 어떤 모델에도 개인(담당자) 식별 필드를 두지 않는다. 집계 단위는 단계·양식·부서.
import { z } from "zod";

// ── 단계 ──────────────────────────────────────────────
export const STAGES = ["BOOKING", "DOC_PREP", "SI", "BL_DRAFT"] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const STAGE_LABEL: Record<Stage, string> = {
  BOOKING: "부킹 접수",
  DOC_PREP: "서류 작성(인보이스·패킹리스트)",
  SI: "SI 제출",
  BL_DRAFT: "B/L 초안",
};

const IsoDateTime = z.iso.datetime({ offset: true });
const IsoDate = z.iso.date();

// ── 모듈 1: 재작업·반려 ────────────────────────────────
export const FieldSnapshotSchema = z.object({
  caseId: z.string(),
  stage: StageSchema,
  field: z.string(), // 예: "consigneeAddress"
  value: z.string(), // 빈 문자열이면 누락
  at: IsoDateTime,
});
export type FieldSnapshot = z.infer<typeof FieldSnapshotSchema>;

export const REASON_CODES = [
  "MISSING_INFO",
  "TYPO",
  "UNIT_MISMATCH",
  "LATE_CHANGE",
  "WRONG_ASSIGNEE",
  "COPY_DIVERGED",
  "STALE_DATA",
  "OTHER",
] as const;
export const ReasonCodeSchema = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const ReworkCaseSchema = z.object({
  id: z.string(),
  label: z.string(), // 목록 표시용(부킹번호·항로). 개인명 금지
  field: z.string(),
  correctValue: z.string(),
  cost: z.number().int().nonnegative(), // 수정비용(원)
  detectedAt: IsoDateTime,
  reasonCode: ReasonCodeSchema.optional(), // 사람이 고른 사유 또는 AI 분류
  reworkText: z.string().optional(), // 반려 메일 원문(5단계 자동 분류 입력)
});
export type ReworkCase = z.infer<typeof ReworkCaseSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  // CROSS_CHECK(서류 간 자동 대조), PAUSE_PROCEDURE(업무 관성: 시범 중단)는 사양 확장
  kind: z.enum([
    "REQUIRED_FIELD",
    "PRE_CHECK",
    "CHECKLIST",
    "CROSS_CHECK",
    "NAMING_RULE",
    "SINGLE_SOURCE",
    "PAUSE_PROCEDURE",
  ]),
  stage: StageSchema.nullable(),
  field: z.string().optional(), // 가상 재실행 대상 필드
  patternKey: z.string().optional(), // 근거가 된 패턴
  description: z.string(),
  status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "RETIRED"]),
  expectedPrevented: z.number().int().nonnegative().optional(),
  appliedAt: IsoDateTime.optional(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

// ── 모듈 2: 논리 역추적 ────────────────────────────────
export const EvidenceSchema = z.object({
  name: z.string(),
  source: z.string().optional(),
  validUntil: IsoDate.optional(),
  fileId: z.string().optional(),
  // 수치 충돌 점검용: 같은 항목명을 가진 근거끼리 값을 비교한다(사양 확장).
  figures: z.record(z.string(), z.number()).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  evidence: z.array(EvidenceSchema),
  assumptions: z.array(z.object({ text: z.string(), grounded: z.boolean() })),
  compareTargets: z.array(z.string()),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  title: z.string(),
  conclusion: z.string(),
  text: z.string(),
  claims: z.array(ClaimSchema),
});
export type Report = z.infer<typeof ReportSchema>;

// ── 모듈 3: 동일 내용·다른 제목 문서 ───────────────────
export const DocSchema = z.object({
  id: z.string(),
  title: z.string(),
  dept: z.string(),
  text: z.string(),
  embedding: z.array(z.number()).optional(),
  keyValues: z.record(z.string(), z.string()), // 기준자료, 거래처, 항로, 금액 등
  history: z.array(
    z.object({ at: IsoDateTime, event: z.string(), fromDocId: z.string().optional() }),
  ),
});
export type Doc = z.infer<typeof DocSchema>;

// ── 모듈 4: 업무 관성 탐지(Zombie Task Finder) ─────────
// 승인·보고·입력 항목마다 "왜 생겼는지, 결과가 마지막으로 쓰인 때"를 추적한다.
// 실행 기록은 월별 건수로만 보관한다(누가 했는지는 저장하지 않음).
const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const PROCEDURE_KINDS = ["APPROVAL", "REPORT", "INPUT_FIELD"] as const;
export const ProcedureSchema = z.object({
  id: z.string(),
  kind: z.enum(PROCEDURE_KINDS),
  name: z.string(),
  dept: z.string(), // 운영 부서(집계 단위). 개인명 금지
  stage: StageSchema.nullable(),
  fieldKey: z.string().optional(), // INPUT_FIELD: 모듈 1의 필드명과 연결
  introducedAt: IsoDate,
  originReason: z.string().optional(), // 도입 이유. 없으면 '확인 필요'
  originRef: z.string().optional(), // 도입 근거 문서
  legalBasis: z.string().optional(), // 법정 절차면 폐지 후보에서 제외
  minutesPerRun: z.number().nonnegative(), // 건당 처리 시간(분)
  avgWaitHours: z.number().nonnegative().optional(), // 승인 평균 대기
  lastOutcomeBefore: YearMonth.optional(), // 집계 기간 이전에 결과가 마지막으로 쓰인 달
  // executed: 승인 요청·보고서 작성·항목 입력 건수
  // outcome: 결과가 쓰인 건수(승인=반려·수정, 보고서=열람, 입력 항목=후속 단계 참조)
  usage: z.array(
    z.object({ month: YearMonth, executed: z.number().int().nonnegative(), outcome: z.number().int().nonnegative() }),
  ),
});
export type Procedure = z.infer<typeof ProcedureSchema>;
