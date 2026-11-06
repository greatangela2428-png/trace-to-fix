// 실제 OpenAI를 부르지 않고 가짜 모델 응답으로 분류 후처리를 검증한다.
import { describe, expect, it, vi } from "vitest";
import { classifyReason, redact, type CallModel } from "./classifyReason";

const TEXT = "B/L 초안에 수하인 주소가 비어 있습니다. 주소 기재 후 재송부 부탁드립니다.";
const reply = (o: unknown): CallModel => async () => JSON.stringify(o);
const run = (callModel: CallModel, text = TEXT) => classifyReason(text, { callModel, model: "test-model" });

describe("classifyReason", () => {
  it("신뢰도 높고 근거가 원문에 있으면 모델이 고른 코드를 그대로 쓴다", async () => {
    const r = await run(reply({ code: "MISSING_INFO", confidence: 0.92, evidence: "B/L 초안에 수하인 주소가 비어 있습니다." }));
    expect(r).toMatchObject({ code: "MISSING_INFO", suggestedCode: "MISSING_INFO", evidenceVerified: true, needsHuman: false, model: "test-model" });
  });

  it("신뢰도가 기준(0.6) 미만이면 OTHER로 두고 사람에게 묻는다", async () => {
    const r = await run(reply({ code: "TYPO", confidence: 0.4, evidence: "B/L 초안에 수하인 주소가 비어 있습니다." }));
    expect(r).toMatchObject({ code: "OTHER", suggestedCode: "TYPO", needsHuman: true });
    expect(r.note).toContain("신뢰도");
  });

  it("근거 인용이 원문에 없으면(지어낸 인용) OTHER", async () => {
    const r = await run(reply({ code: "MISSING_INFO", confidence: 0.95, evidence: "주소를 빠뜨렸다고 함" }));
    expect(r).toMatchObject({ code: "OTHER", evidenceVerified: false, needsHuman: true });
  });

  it("공백 차이는 같은 인용으로 본다", async () => {
    const r = await run(reply({ code: "MISSING_INFO", confidence: 0.9, evidence: "수하인 주소가   비어 있습니다." }));
    expect(r.evidenceVerified).toBe(true);
  });

  it("형식이 틀린 응답은 1회 재시도한다", async () => {
    const callModel = vi
      .fn<CallModel>()
      .mockResolvedValueOnce("설명문입니다")
      .mockResolvedValueOnce(JSON.stringify({ code: "MISSING_INFO", confidence: 0.9, evidence: "수하인 주소가 비어 있습니다." }));
    const r = await run(callModel);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(r.code).toBe("MISSING_INFO");
  });

  it("두 번 모두 형식이 틀리면 오류(없는 코드 포함)", async () => {
    await expect(run(reply({ code: "NOT_A_CODE", confidence: 0.9, evidence: "x" }))).rejects.toThrow("형식");
  });

  it("모델에는 연락처를 가린 본문을 보낸다", async () => {
    const callModel = vi.fn<CallModel>().mockResolvedValue(JSON.stringify({ code: "OTHER", confidence: 0.3, evidence: "" }));
    await run(callModel, "문의는 ops.team@example.com 또는 010-1234-5678 로 주세요. 통지처가 이전 건입니다.");
    const sent = callModel.mock.calls[0]![0].user;
    expect(sent).not.toContain("example.com");
    expect(sent).not.toContain("1234");
    expect(sent).toContain("통지처가 이전 건입니다.");
  });
});

describe("redact", () => {
  it("이메일·전화번호만 가리고 업무 수치는 남긴다", () => {
    expect(redact("총중량 12,040 vs 12,400, 연락 02-123-4567")).toBe("총중량 12,040 vs 12,400, 연락 [전화번호]");
  });
});
