// 반려 사유 자동 분류(사양 4.2-5, 9장). 모델 호출부는 주입받아 테스트에서 가짜로 바꿀 수 있다.
import { callJsonWithRetry, type CallModel } from "./openai.js";
import {
  ModelClassificationSchema,
  REASON_CODES,
  REASON_LABEL,
  type ClassifyResponse,
} from "../src/domain/ai.js";

export const CONFIDENCE_THRESHOLD = 0.6;

/** 모델에 보내기 전 연락처를 가린다(원칙 5: 업무 내용만 사용). */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[이메일]")
    .replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[전화번호]");
}

export const SYSTEM_PROMPT = `당신은 포워딩·물류 서류(부킹, SI, 인보이스, 패킹리스트, B/L)의 반려·수정 요청 메일을 읽고 반려 사유를 분류합니다.

사유 코드(하나만 고르세요):
${REASON_CODES.map((c) => `- ${c}: ${REASON_LABEL[c]}`).join("\n")}

규칙:
- evidence에는 판단 근거가 된 문장을 원문에서 그대로(한 글자도 바꾸지 말고) 인용합니다.
- 원문만으로 사유를 확신할 수 없으면 code는 OTHER, confidence는 0.5 이하로 둡니다.
- 사람(담당자)의 잘잘못을 평가하지 말고 서류에 무엇이 잘못됐는지만 봅니다.
- confidence는 0~1 사이 숫자입니다.`;

/** OpenAI Structured Outputs용 JSON Schema(strict). */
export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string", enum: [...REASON_CODES] },
    confidence: { type: "number" },
    evidence: { type: "string" },
  },
  required: ["code", "confidence", "evidence"],
  additionalProperties: false,
} as const;

export type { CallModel };

export const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

export async function classifyReason(
  text: string,
  deps: { callModel: CallModel; model: string },
): Promise<ClassifyResponse> {
  const user = redact(text);
  const out = await callJsonWithRetry(deps.callModel, { system: SYSTEM_PROMPT, user }, ModelClassificationSchema);
  const evidenceVerified = out.evidence.length > 0 && normalize(user).includes(normalize(out.evidence));
  const lowConfidence = out.confidence < CONFIDENCE_THRESHOLD;
  const needsHuman = lowConfidence || !evidenceVerified || out.code === "OTHER";

  let note: string | undefined;
  if (!evidenceVerified) note = "AI가 인용한 근거 문장이 원문에서 확인되지 않아 '기타'로 두었습니다.";
  else if (lowConfidence) note = `신뢰도가 낮아(${Math.round(out.confidence * 100)}%) '기타'로 두었습니다.`;

  return {
    code: needsHuman ? "OTHER" : out.code,
    suggestedCode: out.code,
    confidence: out.confidence,
    evidence: out.evidence,
    evidenceVerified,
    needsHuman,
    note,
    model: deps.model,
  };
}
