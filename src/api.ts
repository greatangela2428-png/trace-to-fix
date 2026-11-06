// 브라우저 → 우리 서버(/api) 호출. OpenAI 키는 여기에 없다(서버에만 있음).
import type { z } from "zod";
import {
  ClassifyResponseSchema,
  DecomposeResponseSchema,
  type ClassifyResponse,
  type DecomposeResponse,
} from "./domain/ai";

async function postJson<T>(path: string, payload: unknown, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new Error(msg ?? `서버 오류(${res.status})`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("서버 응답 형식이 올바르지 않습니다.");
  return parsed.data;
}

export const classifyReasonApi = (text: string): Promise<ClassifyResponse> =>
  postJson("/api/ai/classify-reason", { text }, ClassifyResponseSchema);

export const decomposeReportApi = (text: string): Promise<DecomposeResponse> =>
  postJson("/api/ai/decompose-report", { text }, DecomposeResponseSchema);
