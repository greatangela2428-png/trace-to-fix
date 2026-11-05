import { describe, expect, it } from "vitest";
import { seed } from "../seed";
import { traceCase, type CaseTrace } from "./trace";
import { aggregatePatterns, simulate, suggestFor } from "./patterns";
import { josa } from "./labels";

const traces = seed.cases.map((c) => traceCase(c, seed.snapshots)).filter((t): t is CaseTrace => t !== null);
const patterns = aggregatePatterns(traces, seed.cases);
const byKey = (k: string) => patterns.find((p) => p.key === k)!;

describe("aggregatePatterns", () => {
  it("(원인 단계, 필드, 유형)으로 묶고 비용 내림차순", () => {
    expect(patterns[0]).toMatchObject({
      key: "BOOKING|consigneeAddress|MISSING",
      count: 5,
      totalCost: 820000,
    });
    const costs = patterns.map((p) => p.totalCost);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    expect(patterns.reduce((s, p) => s + p.count, 0)).toBe(seed.cases.length);
  });
  it("같은 필드라도 원인 단계·유형이 다르면 다른 패턴", () => {
    expect(byKey("SI|consigneeAddress|MISSING").count).toBe(2);
    expect(byKey("BOOKING|consigneeAddress|WRONG").count).toBe(1);
  });
});

describe("suggestFor", () => {
  it("누락 패턴 → 필수화·사전 점검·체크리스트", () => {
    const s = suggestFor(byKey("BOOKING|consigneeAddress|MISSING"));
    expect(s.map((x) => x.kind)).toEqual(["REQUIRED_FIELD", "PRE_CHECK", "CHECKLIST"]);
    expect(s[0]!.description).toContain("수하인 주소를 필수 항목으로");
    expect(s.every((x) => x.status === "PROPOSED")).toBe(true);
  });
  it("오입력 패턴 → 필수화를 제안하지 않고 자동 대조(첫 단계면 원본 대조 질문)", () => {
    expect(suggestFor(byKey("DOC_PREP|grossWeight|WRONG")).map((x) => x.kind)).toEqual(["CROSS_CHECK", "CHECKLIST"]);
    expect(suggestFor(byKey("BOOKING|portOfDischarge|WRONG")).map((x) => x.kind)).toEqual(["PRE_CHECK", "CHECKLIST"]);
  });
});

describe("simulate (가상 재실행)", () => {
  it("부킹 단계 수하인 주소 필수화: 부킹에서 시작된 누락 5건만 예방, 절감액 합산", () => {
    const req = suggestFor(byKey("BOOKING|consigneeAddress|MISSING"))[0]!;
    const r = simulate(req, traces, seed.cases);
    expect(r.prevented.sort()).toEqual(["C01", "C02", "C03", "C04", "C05"]);
    expect(r.savedCost).toBe(820000);
    // SI 유실 2건, 오입력 1건은 범위 밖으로 이유와 함께 표시
    expect(r.outOfScope.map((o) => o.caseId).sort()).toEqual(["C06", "C07", "C13"]);
    expect(r.outOfScope.find((o) => o.caseId === "C13")!.reason).toContain("오입력");
  });
  it("오입력은 예방으로 세지 않는다: 자동 대조는 조기 발견만, 절감액 0", () => {
    const cross = suggestFor(byKey("DOC_PREP|grossWeight|WRONG"))[0]!;
    const r = simulate(cross, traces, seed.cases);
    expect(r.prevented).toEqual([]);
    expect(r.savedCost).toBe(0);
    expect(r.detectable).toEqual(["C08"]);
  });
  it("사전 점검·체크리스트는 과거 기록으로 추정 불가", () => {
    const pre = suggestFor(byKey("BOOKING|consigneeAddress|MISSING"))[1]!;
    const r = simulate(pre, traces, seed.cases);
    expect(r.estimable).toBe(false);
    expect(r.prevented).toEqual([]);
  });
});

describe("josa", () => {
  it("받침에 따라 조사를 고른다", () => {
    expect(josa("총중량", "을/를")).toBe("총중량을");
    expect(josa("수하인 주소", "을/를")).toBe("수하인 주소를");
    expect(josa("열람", "은/는")).toBe("열람은");
    expect(josa("BAF", "을/를")).toBe("BAF를");
  });
});
