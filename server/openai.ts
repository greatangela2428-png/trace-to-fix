// OpenAI 호출. 이 파일은 서버에서만 실행된다(브라우저 번들에 포함되지 않음).
import OpenAI from "openai";
import type { z } from "zod";

export const DEFAULT_MODEL = "gpt-5-mini";

export class MissingKeyError extends Error {}
/** 모델 응답이 두 번 모두 스키마에 맞지 않을 때. */
export class AiOutputError extends Error {}

/** 모델 호출부. 테스트에서는 가짜 함수로 바꿔 끼운다. */
export type CallModel = (args: { system: string; user: string }) => Promise<string>;

export function getModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

/** JSON Schema를 강제한 구조화 출력으로 모델을 호출하는 함수를 만든다. */
export function makeCallModel(
  name: string,
  schema: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): CallModel {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new MissingKeyError("서버에 OPENAI_API_KEY가 설정되지 않았습니다.");
  const client = new OpenAI({ apiKey, timeout: opts.timeoutMs ?? 30_000, maxRetries: 1 });
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

/** 모델을 부르고 JSON 파싱 + zod 검증. 실패하면 1회 재시도한다(사양 5-1, 9장). */
export async function callJsonWithRetry<T>(
  callModel: CallModel,
  args: { system: string; user: string },
  schema: z.ZodType<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callModel(args);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
  }
  throw new AiOutputError("AI 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.");
}
