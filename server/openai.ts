// OpenAI 호출. 이 파일은 서버에서만 실행된다(브라우저 번들에 포함되지 않음).
import OpenAI from "openai";
import type { CallModel } from "./classifyReason.js";

export const DEFAULT_MODEL = "gpt-5-mini";

export class MissingKeyError extends Error {}

export function getModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

/** JSON Schema를 강제한 구조화 출력으로 모델을 호출하는 함수를 만든다. */
export function makeCallModel(name: string, schema: Record<string, unknown>): CallModel {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new MissingKeyError("서버에 OPENAI_API_KEY가 설정되지 않았습니다.");
  const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
  const model = getModel();

  return async ({ system, user }) => {
    const res = await client.responses.create({
      model,
      instructions: system,
      input: user,
      reasoning: { effort: "low" },
      store: false,
      text: { format: { type: "json_schema", name, schema, strict: true } },
    });
    return res.output_text;
  };
}
