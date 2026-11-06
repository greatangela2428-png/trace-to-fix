// 서버(AI 호출)와 브라우저(화면)가 함께 쓰는 AI 응답 스키마. API 키와는 무관하다.
import { z } from "zod";
// 서버 함수(Node ESM)에서도 불리므로 확장자를 붙여 import한다.
import { REASON_CODES, ReasonCodeSchema, ReportSchema, type ReasonCode } from "./schemas.js";

export const REASON_LABEL: Record<ReasonCode, string> = {
  MISSING_INFO: "정보 누락",
  TYPO: "오타",
  UNIT_MISMATCH: "단위 불일치",
  LATE_CHANGE: "늦은 변경 미반영",
  WRONG_ASSIGNEE: "담당 배정 오류",
  COPY_DIVERGED: "복사 후 불일치",
  STALE_DATA: "오래된 자료 사용",
  OTHER: "기타(사람 확인 필요)",
};

export const ClassifyRequestSchema = z.object({
  text: z.string().trim().min(1, "반려 메일 내용이 비어 있습니다.").max(2000, "반려 메일은 2,000자까지 보낼 수 있습니다."),
});
export type ClassifyRequest = z.infer<typeof ClassifyRequestSchema>;

/** 모델이 내야 하는 JSON(사양 9장). */
export const ModelClassificationSchema = z.object({
  code: ReasonCodeSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});
export type ModelClassification = z.infer<typeof ModelClassificationSchema>;

/** 서버가 화면에 돌려주는 결과. 검증·보정 결과를 함께 담는다. */
export const ClassifyResponseSchema = z.object({
  code: ReasonCodeSchema, // 보정 후 코드(신뢰도 낮거나 근거 불일치면 OTHER)
  suggestedCode: ReasonCodeSchema, // 모델이 처음 고른 코드
  confidence: z.number(),
  evidence: z.string(),
  evidenceVerified: z.boolean(), // 근거 인용이 원문에 실제로 있는가
  needsHuman: z.boolean(),
  note: z.string().optional(),
  model: z.string(),
});
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;

export { REASON_CODES };

// ── 모듈 2: 보고서 분해(결론 → 주장 → 근거 → 가정) ─────────
export const REPORT_MAX_CHARS = 6000;

export const DecomposeRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(20, "보고서 내용이 너무 짧습니다. 결론과 근거가 들어간 본문을 붙여넣어 주세요.")
    .max(REPORT_MAX_CHARS, `보고서는 ${REPORT_MAX_CHARS.toLocaleString("ko-KR")}자까지 보낼 수 있습니다.`),
});

/** 서버가 화면에 돌려주는 분해 결과. report는 규칙 점검에 그대로 넣을 수 있는 형태다. */
export const DecomposeResponseSchema = z.object({
  report: ReportSchema,
  /** 주장 문장이 원문에서 확인되지 않은 주장 id(AI가 바꿔 말했거나 지어냈을 수 있음) */
  unverifiedClaimIds: z.array(z.string()),
  model: z.string(),
});
export type DecomposeResponse = z.infer<typeof DecomposeResponseSchema>;
