// POST /api/ai/decompose-report  { text }  →  DecomposeResponse
// 보고서를 결론·주장·근거·가정으로 분해한다. 약한 고리 점검은 화면 쪽 코드(checkReport)가 한다.
import { DecomposeRequestSchema } from "../../src/domain/ai.js";
import { RESPONSE_JSON_SCHEMA, decomposeReport } from "../../server/decomposeReport.js";
import { getModel, makeCallModel } from "../../server/openai.js";
import { errorResponse, json, readBody, rejectForeignOrigin } from "../../server/http.js";

export async function POST(request: Request): Promise<Response> {
  const denied = rejectForeignOrigin(request);
  if (denied) return denied;
  const body = await readBody(request, DecomposeRequestSchema);
  if ("error" in body) return body.error;

  try {
    // 긴 보고서는 응답이 길어 분류보다 넉넉히 기다린다
    const callModel = makeCallModel("report_structure", RESPONSE_JSON_SCHEMA, { timeoutMs: 90_000 });
    return json(200, await decomposeReport(body.data.text, { callModel, model: getModel() }));
  } catch (err) {
    return errorResponse(err, "decompose-report");
  }
}
