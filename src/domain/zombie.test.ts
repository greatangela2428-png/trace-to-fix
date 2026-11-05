import { describe, expect, it } from "vitest";
import { AS_OF, seed } from "../seed";
import { findZombies, sortFindings } from "./zombie";
import type { Procedure } from "./schemas";

const reworkFieldCounts = seed.cases.reduce<Record<string, number>>((acc, c) => {
  acc[c.field] = (acc[c.field] ?? 0) + 1;
  return acc;
}, {});
const findings = findZombies(seed.procedures, { asOf: AS_OF, reworkFieldCounts });
const f = (id: string) => findings.find((x) => x.procedureId === id)!;

describe("findZombies (시드 시나리오)", () => {
  it("12개월 반려·수정 0건 승인, 아무도 열지 않은 보고서, 참조 없는 입력 항목 → 폐지 후보", () => {
    expect(f("P1").status).toBe("CANDIDATE");
    expect(f("P4").status).toBe("CANDIDATE");
    expect(f("P6").status).toBe("CANDIDATE");
  });
  it("결과가 쓰이는 절차는 유지", () => {
    expect(f("P2")).toMatchObject({ status: "KEEP", outcomes: 18 });
    expect(f("P5").status).toBe("KEEP");
  });
  it("법정 절차는 실행·결과와 무관하게 제외", () => {
    expect(f("P3").status).toBe("EXCLUDED");
  });
  it("재작업 원인 필드(모듈 1 연계)는 참조 0건이어도 폐지 후보가 되지 않는다", () => {
    expect(f("P7").status).toBe("KEEP");
    expect(f("P7").reasons[0]).toContain("원인 필드");
  });
  it("실행이 적으면 판단 보류(드물지만 중요한 통제일 수 있음)", () => {
    expect(f("P8")).toMatchObject({ status: "HOLD", executed: 5 });
  });
  it("마지막으로 결과가 쓰인 달: 기간 이전 기록까지 반영", () => {
    expect(f("P1")).toMatchObject({ lastOutcomeMonth: "2023-03", monthsSinceLastOutcome: 44 });
    expect(f("P2")).toMatchObject({ lastOutcomeMonth: "2026-10", monthsSinceLastOutcome: 1 });
  });
  it("도입 이유가 기록되지 않은 절차를 표시한다", () => {
    expect(f("P4").originUnknown).toBe(true);
    expect(f("P1").originUnknown).toBe(false);
  });
  it("연간 처리 시간 추정(건수 × 건당 분)", () => {
    expect(f("P4").hoursPerYear).toBe(78); // 52건 × 90분
  });
  it("정렬: 폐지 후보가 먼저", () => {
    expect(sortFindings(findings)[0]!.status).toBe("CANDIDATE");
  });
});

describe("findZombies (경계)", () => {
  const base: Procedure = {
    id: "X",
    kind: "APPROVAL",
    name: "테스트",
    dept: "테스트팀",
    stage: null,
    introducedAt: "2020-01-01",
    minutesPerRun: 10,
    usage: [],
  };
  it("집계 기간(직전 12개월) 밖의 기록은 건수에 넣지 않는다", () => {
    const p = {
      ...base,
      usage: [
        { month: "2025-10", executed: 100, outcome: 5 }, // 기간 직전
        { month: "2026-11", executed: 100, outcome: 5 }, // 기준월(진행 중)
        { month: "2026-10", executed: 12, outcome: 0 },
      ],
    };
    const [r] = findZombies([p], { asOf: "2026-11-05" });
    expect(r).toMatchObject({ executed: 12, outcomes: 0, status: "CANDIDATE", lastOutcomeMonth: "2025-10" });
    expect(r!.monthly).toHaveLength(12);
    expect(r!.monthly[0]!.month).toBe("2025-11");
  });
  it("결과가 쓰인 기록이 전혀 없으면 마지막 활용 시점은 null", () => {
    const [r] = findZombies([{ ...base, usage: [{ month: "2026-05", executed: 20, outcome: 0 }] }], { asOf: "2026-11-05" });
    expect(r).toMatchObject({ lastOutcomeMonth: null, monthsSinceLastOutcome: null });
  });
});
