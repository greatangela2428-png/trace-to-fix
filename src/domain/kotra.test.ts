import { describe, expect, it } from "vitest";
import { detectRegions, suspiciousYears, topicsOf } from "./kotra";
import { econ } from "../data/kotra";
// @ts-expect-error: 빌드 스크립트(.mjs)라 타입 선언이 없다
import { parseCsv } from "../../scripts/import-kotra.mjs";

describe("권역·가정 주제", () => {
  it("항구명으로 권역을 찾는다", () => {
    expect(detectRegions("부산-로테르담 40ft 운임")).toEqual(["유럽(EU)"]);
    expect(detectRegions("국내 물류")).toEqual([]);
  });

  it("가정 문장에서 주제를 찾는다(환율은 KOTRA 자료 없음 안내)", () => {
    const ids = (s: string) => topicsOf(s).map((t) => t.id);
    expect(ids("2027년 물동량이 2026년과 같다")).toEqual(["volume"]);
    const fx = topicsOf("원/달러 환율이 1,350원 수준을 유지한다");
    expect(fx.map((t) => t.id)).toEqual(["fx"]);
    expect(fx[0]!.note).toContain("환율이 없습니다");
  });

  it("원자료 급변(5배 이상)은 확인 필요로 표시하고 % 지표는 건너뛴다", () => {
    const pop = econ.regions["북미"]!.find((i) => i.indicator === "인구")!;
    expect(suspiciousYears(pop, econ.years)).toEqual(["2025"]); // 38.5 → 387 (원자료 그대로)
    const cpi = econ.regions["북미"]!.find((i) => i.indicator === "소비자물가상승률")!;
    expect(suspiciousYears(cpi, econ.years)).toEqual([]);
  });

  it("출처·이용조건이 붙어 있다", () => {
    expect(econ.source.url).toContain("data.go.kr");
  });
});

describe("CSV 파서(import-kotra)", () => {
  it("따옴표 안의 쉼표·줄바꿈·이스케이프를 처리한다", () => {
    expect(parseCsv('a,b\r\n1,"x, y"\n2,"line1\nline2 ""q"""\n')).toEqual([
      ["a", "b"],
      ["1", "x, y"],
      ["2", 'line1\nline2 "q"'],
    ]);
  });
});
