// 실제 OpenAI를 부르지 않고 가짜 모델 응답으로 분해 후처리와 점검 연결을 검증한다.
import { describe, expect, it, vi } from "vitest";
import { decomposeReport } from "./decomposeReport";
import type { CallModel } from "./openai";
import { checkReport } from "../src/domain/logic";

const TEXT = `결론: A 선사로 전환한다.
1. A 선사 운임은 USD 1,850으로 현 선사 대비 저렴하다.
2. 환율이 유지되면 연 1억 원을 절감한다. 문의: kim@example.com`;

const modelOut = {
  title: "",
  conclusion: "A 선사로 전환한다.",
  claims: [
    {
      text: "1. A 선사 운임은 USD 1,850으로 현 선사 대비 저렴하다.",
      evidence: [
        { name: "A 선사 운임표(2026년 3분기)", source: null, validUntil: "2026-09-30", figures: [{ key: "A 선사 운임(USD)", value: 1850 }] },
        { name: "견적 메일", source: "메일 2026-10-14", validUntil: "2026-02-30", figures: [{ key: "A 선사 운임(USD)", value: 1920 }] },
      ],
      assumptions: [{ text: "운임이 유지된다", grounded: false }],
      compareTargets: ["현 선사", "B 선사", " B 선사 "],
    },
    {
      text: "환율 덕분에 큰 절감이 가능하다", // 원문에 없는 문장(바꿔 말함)
      evidence: [],
      assumptions: [],
      compareTargets: [],
    },
  ],
};

const reply = (o: unknown): CallModel => async () => JSON.stringify(o);
const run = (callModel: CallModel) => decomposeReport(TEXT, { callModel, model: "test-model" });

describe("decomposeReport", () => {
  it("모델 출력을 Report로 바꾼다(null → 없음, 수치 배열 → 사전, 중복 비교 대상 제거)", async () => {
    const { report, model } = await run(reply(modelOut));
    expect(model).toBe("test-model");
    expect(report.title).toBe("붙여넣은 보고서");
    expect(report.text).toBe(TEXT);
    expect(report.claims.map((c) => c.id)).toEqual(["CL1", "CL2"]);
    const [e0, e1] = report.claims[0]!.evidence;
    expect(e0).toEqual({ name: "A 선사 운임표(2026년 3분기)", validUntil: "2026-09-30", figures: { "A 선사 운임(USD)": 1850 } });
    expect(e1!.validUntil).toBeUndefined(); // 없는 날짜는 버린다
    expect(report.claims[0]!.compareTargets).toEqual(["현 선사", "B 선사"]);
  });

  it("원문에서 찾을 수 없는 주장 문장을 표시한다(번호는 무시)", async () => {
    const { unverifiedClaimIds } = await run(reply(modelOut));
    expect(unverifiedClaimIds).toEqual(["CL2"]);
  });

  it("모델에는 연락처를 가린 본문을 보낸다", async () => {
    const spy = vi.fn(reply(modelOut));
    await run(spy);
    expect(spy.mock.calls[0]![0].user).toContain("[이메일]");
    expect(spy.mock.calls[0]![0].user).not.toContain("kim@example.com");
  });

  it("형식이 틀리면 1회 재시도하고, 두 번 다 틀리면 오류", async () => {
    const once = vi.fn<CallModel>().mockResolvedValueOnce("{oops").mockResolvedValueOnce(JSON.stringify(modelOut));
    await expect(run(once)).resolves.toBeTruthy();
    expect(once).toHaveBeenCalledTimes(2);
    await expect(run(reply({ title: "x" }))).rejects.toThrow("형식");
  });

  it("분해 결과를 그대로 규칙 점검에 넣을 수 있다", async () => {
    const { report } = await run(reply(modelOut));
    const kinds = checkReport(report, { asOf: "2026-11-05" }).map((f) => f.kind).sort();
    // CL1: 출처 없는 근거, CL2: 근거 자체가 없음 → 출처 불명확 2건
    expect(kinds).toEqual(["EXPIRED", "FIGURE_CONFLICT", "MISSING_COMPARE", "NO_SOURCE", "NO_SOURCE", "UNGROUNDED"]);
  });
});
