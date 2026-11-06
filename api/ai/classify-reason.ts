// POST /api/ai/classify-reason  { text }  →  ClassifyResponse
// Vercel 서버 함수. 로컬에서는 vite.config.ts의 개발용 미들웨어가 같은 함수를 부른다.
import { ClassifyRequestSchema } from "../../src/domain/ai.js";
import { RESPONSE_JSON_SCHEMA, classifyReason } from "../../server/classifyReason.js";
import { getModel, makeCallModel } from "../../server/openai.js";
import { errorResponse, json, readBody, rejectForeignOrigin } from "../../server/http.js";

export async function POST(request: Request): Promise<Response> {
  const denied = rejectForeignOrigin(request);
  if (denied) return denied;
  const body = await readBody(request, ClassifyRequestSchema);
  if ("error" in body) return body.error;

  try {
    const callModel = makeCallModel("rework_reason", RESPONSE_JSON_SCHEMA);
    return json(200, await classifyReason(body.data.text, { callModel, model: getModel() }));
  } catch (err) {
    return errorResponse(err, "classify-reason");
  }
}
