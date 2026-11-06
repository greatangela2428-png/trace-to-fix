import { describe, expect, it } from "vitest";
import { checkReport, compareStatus, weakLinks } from "./logic";
import type { Report } from "./schemas";
import { AS_OF, seed } from "../seed";

const base = (claims: Report["claims"]): Report => ({ id: "T", title: "t", conclusion: "c", text: "", claims });
const claim = (over: Partial<Report["claims"][number]> = {}): Report["claims"][number] => ({
  id: "C1",
  text: "A 선사가 현 선사보다 저렴하다",
  evidence: [{ name: "운임표", source: "공유폴더/운임표.xlsx", validUntil: "2026-12-31" }],
  assumptions: [],
  compareTargets: [],
  ...over,
});

describe("checkReport", () => {
  it("문제가 없으면 점검 항목이 없다", () => {
    expect(checkReport(base([claim()]), { asOf: "2026-11-05" })).toEqual([]);
  });

  it("유효기간이 기준일보다 앞서면 만료(기준일 당일은 유효)", () => {
    const r = (validUntil: string) => checkReport(base([claim({ evidence: [{ name: "운임표", source: "x", validUntil }] })]), { asOf: "2026-11-05" });
    expect(r("2026-11-04").map((f) => f.kind)).toEqual(["EXPIRED"]);
    expect(r("2026-11-05")).toEqual([]);
  });

  it("출처가 없거나 빈 문자열이면 출처 불명확", () => {
    const f = checkReport(base([claim({ evidence: [{ name: "홍보 자료" }, { name: "메모", source: "  " }] })]), { asOf: "2026-11-05" });
    expect(f.map((x) => x.kind)).toEqual(["NO_SOURCE", "NO_SOURCE"]);
    expect(f[1]!.refs).toEqual([{ claimId: "C1", node: "evidence", index: 1 }]);
  });

  it("근거 자료가 하나도 없는 주장은 출처 불명확(주장 자체에 표시)", () => {
    const f = checkReport(base([claim({ evidence: [] })]), { asOf: "2026-11-05" });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "NO_SOURCE", refs: [{ claimId: "C1", node: "claim" }] });
  });

  it("근거 없는 가정만 걸린다", () => {
    const f = checkReport(
      base([claim({ assumptions: [{ text: "환율 유지", grounded: false }, { text: "물동량 유지", grounded: true }] })]),
      { asOf: "2026-11-05" },
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "UNGROUNDED", refs: [{ node: "assumption", index: 0 }] });
  });

  it("비교 대상이 주장에 없으면 누락(공백 차이는 무시)", () => {
    const f = checkReport(base([claim({ compareTargets: ["현선사", "B 선사"] })]), { asOf: "2026-11-05" });
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("B 선사");
    expect(f[0]!.message).not.toContain("현선사");
  });

  it("다른 주장에 흩어진 같은 항목의 수치가 다르면 충돌 1건으로 묶는다", () => {
    const f = checkReport(
      base([
        claim({ id: "C1", evidence: [{ name: "표", source: "x", figures: { "운임": 1850 } }] }),
        claim({ id: "C2", evidence: [{ name: "메일", source: "y", figures: { "운임": 1920 } }] }),
      ]),
      { asOf: "2026-11-05" },
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.kind).toBe("FIGURE_CONFLICT");
    expect(f[0]!.refs.map((r) => r.claimId)).toEqual(["C1", "C2"]);
  });

  it("같은 값이면 충돌이 아니다", () => {
    const f = checkReport(
      base([claim({ evidence: [{ name: "a", source: "x", figures: { k: 1 } }, { name: "b", source: "y", figures: { k: 1 } }] })]),
      { asOf: "2026-11-05" },
    );
    expect(f).toEqual([]);
  });
});

describe("시연 시나리오 2: A 선사 전환 보고서", () => {
  const findings = checkReport(seed.report, { asOf: AS_OF });

  it("만료된 운임표, 근거 없는 환율 가정, 수치 충돌, 출처 불명확, 비교 누락을 찾는다", () => {
    expect(findings.map((f) => `${f.claimId}:${f.kind}`)).toEqual([
      "CL1:EXPIRED",
      "CL1:UNGROUNDED",
      "CL1:MISSING_COMPARE",
      "CL1:FIGURE_CONFLICT",
      "CL2:UNGROUNDED",
      "CL3:NO_SOURCE",
    ]);
    expect(findings.find((f) => f.kind === "FIGURE_CONFLICT")!.message).toContain("1,850");
  });

  it("약한 고리 지도: 수치 충돌과 만료가 같은 근거에 겹친다", () => {
    const weak = weakLinks(findings);
    expect(weak.get("CL1:evidence:0")).toEqual(["EXPIRED", "FIGURE_CONFLICT"]);
    expect(weak.get("CL1:evidence:2")).toBeUndefined(); // 현 선사 운임표는 정상
  });
});

describe("compareStatus", () => {
  it("대상별 비교 여부", () => {
    expect(compareStatus("현 선사 대비 12% 저렴", ["현 선사", "B 선사"])).toEqual([
      { target: "현 선사", compared: true },
      { target: "B 선사", compared: false },
    ]);
  });
});

describe("점검 문구의 조사", () => {
  const msg = (over: Partial<Report["claims"][number]>) => checkReport(base([claim(over)]), { asOf: "2026-11-05" })[0]!.message;
  it("받침에 맞춰 와/과, 을/를을 붙인다", () => {
    expect(msg({ compareTargets: ["B 선사"] })).toContain("'B 선사'와의 비교가");
    expect(msg({ compareTargets: ["B 선사", "C 항공"] })).toContain("'B 선사', 'C 항공'과의 비교가");
    expect(msg({ assumptions: [{ text: "환율이 유지된다.", grounded: false }] })).toContain("'환율이 유지된다'를 뒷받침");
    expect(msg({ assumptions: [{ text: "물동량 증가", grounded: false }] })).toContain("'물동량 증가'를 뒷받침");
    expect(msg({ assumptions: [{ text: "운임 동결", grounded: false }] })).toContain("'운임 동결'을 뒷받침");
  });
});
