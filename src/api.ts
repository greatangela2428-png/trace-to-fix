// 브라우저 → 우리 서버(/api) 호출. OpenAI 키는 여기에 없다(서버에만 있음).
import { ClassifyResponseSchema, type ClassifyResponse } from "./domain/ai";

export async function classifyReasonApi(text: string): Promise<ClassifyResponse> {
  let res: Response;
  try {
    res = await fetch("/api/ai/classify-reason", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new Error(msg ?? `서버 오류(${res.status})`);
  }
  const parsed = ClassifyResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error("서버 응답 형식이 올바르지 않습니다.");
  return parsed.data;
}
