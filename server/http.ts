// AI 서버 라우트 공통: JSON 응답, 출처 검사, 오류 → 사용자 안내 문구 변환.
// 키나 내부 오류 내용은 응답에 담지 않는다.
import OpenAI from "openai";
import type { z } from "zod";
import { AiOutputError, MissingKeyError, getModel } from "./openai.js";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 같은 사이트 화면에서 온 요청이면 null, 아니면 거절 응답. */
export function rejectForeignOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json(403, { error: "허용되지 않은 출처의 요청입니다." });
  }
  return null;
}

/** 본문을 JSON으로 읽고 스키마로 검증한다. 실패하면 400 응답을 돌려준다. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: json(400, { error: "요청 본문이 JSON이 아닙니다." }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: json(400, { error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." }) };
  return { data: parsed.data };
}

export function errorResponse(err: unknown, tag: string): Response {
  if (err instanceof MissingKeyError) return json(503, { error: err.message });
  if (err instanceof AiOutputError) return json(502, { error: err.message });
  if (err instanceof OpenAI.APIError) {
    const msg =
      err.status === 401
        ? "OpenAI API 키가 올바르지 않습니다. 서버의 OPENAI_API_KEY를 확인해 주세요."
        : err.status === 429
          ? "OpenAI 사용 한도에 걸렸습니다. 잠시 후 다시 시도하거나 결제·한도 설정을 확인해 주세요."
          : err.status === 403 || err.status === 404
            ? `모델(${getModel()})을 사용할 수 없습니다. 키의 모델 접근 권한을 확인해 주세요.`
            : `OpenAI 호출에 실패했습니다(상태 ${err.status ?? "알 수 없음"}).`;
    console.error(`[${tag}] OpenAI error`, err.status, err.message);
    return json(502, { error: msg });
  }
  console.error(`[${tag}] unexpected`, err);
  return json(500, { error: "AI 처리 중 서버 오류가 발생했습니다." });
}
