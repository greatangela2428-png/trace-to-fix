// POST /api/ai/classify-reason  { text }  →  ClassifyResponse
// Vercel 서버 함수. 로컬에서는 vite.config.ts의 개발용 미들웨어가 같은 함수를 부른다.
import OpenAI from "openai";
import { ClassifyRequestSchema } from "../../src/domain/ai.js";
import { AiOutputError, RESPONSE_JSON_SCHEMA, classifyReason } from "../../server/classifyReason.js";
import { MissingKeyError, getModel, makeCallModel } from "../../server/openai.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function POST(request: Request): Promise<Response> {
  // 다른 사이트에서 이 주소를 호출하지 못하게 한다(같은 사이트 화면에서만 허용)
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json(403, { error: "허용되지 않은 출처의 요청입니다." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "요청 본문이 JSON이 아닙니다." });
  }
  const parsed = ClassifyRequestSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다." });

  try {
    const callModel = makeCallModel("rework_reason", RESPONSE_JSON_SCHEMA);
    const result = await classifyReason(parsed.data.text, { callModel, model: getModel() });
    return json(200, result);
  } catch (err) {
    if (err instanceof MissingKeyError) return json(503, { error: err.message });
    if (err instanceof AiOutputError) return json(502, { error: err.message });
    if (err instanceof OpenAI.APIError) {
      // 키나 내부 정보는 내보내지 않고 상태만 알린다
      const msg =
        err.status === 401
          ? "OpenAI API 키가 올바르지 않습니다. 서버의 OPENAI_API_KEY를 확인해 주세요."
          : err.status === 429
            ? "OpenAI 사용 한도에 걸렸습니다. 잠시 후 다시 시도하거나 결제·한도 설정을 확인해 주세요."
            : err.status === 404
              ? `모델(${getModel()})을 사용할 수 없습니다. 계정의 모델 접근 권한을 확인해 주세요.`
              : `OpenAI 호출에 실패했습니다(상태 ${err.status ?? "알 수 없음"}).`;
      console.error("[classify-reason] OpenAI error", err.status, err.message);
      return json(502, { error: msg });
    }
    console.error("[classify-reason] unexpected", err);
    return json(500, { error: "AI 분류 중 서버 오류가 발생했습니다." });
  }
}
