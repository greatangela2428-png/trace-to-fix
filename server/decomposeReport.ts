// 모듈 2: 보고서 텍스트 → 결론·주장·근거·가정(사양 5-1, 9장). 점검(판정)은 하지 않는다.
// 모델은 구조만 뽑고, 약한 고리 판정은 브라우저의 checkReport(코드)가 한다.
import { z } from "zod";
import { ReportSchema, type Report } from "../src/domain/schemas.js";
import type { DecomposeResponse } from "../src/domain/ai.js";
import { callJsonWithRetry, type CallModel } from "./openai.js";
import { normalize, redact } from "./classifyReason.js";

export const SYSTEM_PROMPT = `당신은 포워딩·물류 회사의 업무 보고서를 읽고 논리 구조를 "결론 → 주장 → 근거 → 가정"으로 분해합니다.
판정이나 평가는 하지 말고 구조만 뽑습니다.

규칙:
- title: 보고서 제목. 원문에 없으면 내용을 요약한 짧은 제목.
- conclusion: 보고서의 최종 결론(원문 표현 그대로).
- claims: 결론을 뒷받침하는 주장. text는 원문 문장을 한 글자도 바꾸지 말고 인용합니다(앞의 번호 "1." 등은 빼도 됨).
- evidence: 그 주장에 대해 보고서가 언급한 근거 자료만 적습니다. 원문에 없는 근거를 만들어내지 마세요. 없으면 빈 배열.
  같은 항목을 다룬 자료가 여러 개면, 주장과 값이 달라도 빠짐없이 모두 적습니다(값이 다른 자료가 가장 중요합니다).
  - name: 자료 이름(예: "A 선사 운임표(2026년 3분기)").
  - source: 원문에 적힌 파일 경로·메일·시스템명. 원문에 없으면 null.
  - validUntil: 자료의 유효기간 끝 날짜(YYYY-MM-DD). 적용 기간이 적혀 있으면 그 기간의 마지막 날(예: 2026년 3분기 → 2026-09-30). 없으면 null.
  - figures: 그 자료가 제시하는 수치. key는 "대상 항목(단위)" 형식(예: "A 선사 40ft 운임(USD)"). 같은 대상·항목은 모든 근거에서 똑같은 key를 씁니다.
- assumptions: 주장이 성립하려면 참이어야 하는 전제. 원문에 적힌 가정과, 적혀 있지 않지만 주장에 꼭 필요한 숨은 가정을 모두 적습니다.
  - grounded: 보고서가 그 가정을 뒷받침하는 자료(출처가 있는 수치·문서)를 따로 제시했을 때만 true입니다.
    보고서가 가정을 문장으로 말하기만 했다면(예: "환율이 1,350원 수준을 유지하므로") 근거가 아니므로 false입니다. 애매하면 false.
- compareTargets: 이 주장을 판단하려면 비교해야 할 대안. 보고서 어디에든 언급된 다른 선택지(견적을 받은 업체, 경쟁 업체 등)를 주장에 등장하지 않더라도 모두 포함합니다. 주장의 주어 자신은 빼고, 없으면 빈 배열.
- 사람 이름은 어디에도 쓰지 않습니다.`;

const NullableString = { type: ["string", "null"] } as const;

/** OpenAI Structured Outputs용 JSON Schema(strict: 모든 필드 required, 선택 값은 null). */
export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    conclusion: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                source: NullableString,
                validUntil: NullableString,
                figures: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { key: { type: "string" }, value: { type: "number" } },
                    required: ["key", "value"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["name", "source", "validUntil", "figures"],
              additionalProperties: false,
            },
          },
          assumptions: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" }, grounded: { type: "boolean" } },
              required: ["text", "grounded"],
              additionalProperties: false,
            },
          },
          compareTargets: { type: "array", items: { type: "string" } },
        },
        required: ["text", "evidence", "assumptions", "compareTargets"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "conclusion", "claims"],
  additionalProperties: false,
} as const;

const ModelOutputSchema = z.object({
  title: z.string(),
  conclusion: z.string(),
  claims: z.array(
    z.object({
      text: z.string().min(1),
      evidence: z.array(
        z.object({
          name: z.string().min(1),
          source: z.string().nullable(),
          validUntil: z.string().nullable(),
          figures: z.array(z.object({ key: z.string(), value: z.number() })),
        }),
      ),
      assumptions: z.array(z.object({ text: z.string(), grounded: z.boolean() })),
      compareTargets: z.array(z.string()),
    }),
  ),
});
type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** 실제 달력 날짜(YYYY-MM-DD)만 통과시킨다. "2026-02-30" 같은 값은 버린다. */
function validDate(s: string | null): string | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : undefined;
}

/** 모델 출력 → 앱의 Report 모델. null은 '없음'으로, 수치 배열은 항목명 사전으로 바꾼다. */
export function toReport(out: ModelOutput, text: string): Report {
  return ReportSchema.parse({
    id: "AI",
    title: out.title.trim() || "붙여넣은 보고서",
    conclusion: out.conclusion,
    text,
    claims: out.claims.map((c, i) => ({
      id: `CL${i + 1}`,
      text: c.text,
      evidence: c.evidence.map((e) => {
        const figures = Object.fromEntries(e.figures.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value]));
        return {
          name: e.name,
          source: e.source?.trim() || undefined,
          validUntil: validDate(e.validUntil),
          figures: Object.keys(figures).length ? figures : undefined,
        };
      }),
      assumptions: c.assumptions.filter((a) => a.text.trim()),
      compareTargets: [...new Set(c.compareTargets.map((t) => t.trim()).filter(Boolean))],
    })),
  });
}

/** 번호·따옴표를 떼고 공백을 정리해 원문 포함 여부를 본다. */
const claimFound = (original: string, claim: string) => {
  const core = normalize(claim.replace(/^\s*\d+[.)]\s*/, "").replace(/^["“]|["”]$/g, ""));
  return core.length > 0 && normalize(original).includes(core);
};

export async function decomposeReport(
  text: string,
  deps: { callModel: CallModel; model: string },
): Promise<DecomposeResponse> {
  const user = redact(text);
  const out = await callJsonWithRetry(deps.callModel, { system: SYSTEM_PROMPT, user }, ModelOutputSchema);
  const report = toReport(out, text);
  return {
    report,
    unverifiedClaimIds: report.claims.filter((c) => !claimFound(user, c.text)).map((c) => c.id),
    model: deps.model,
  };
}
