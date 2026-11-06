import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RegulationFileSchema,
  detectRegions,
  findRegulations,
  normalizeHs,
  summarizeHits,
  suspiciousYears,
  topicsOf,
  type Regulation,
} from "./kotra";
import { econ } from "../data/kotra";
// @ts-expect-error: 빌드 스크립트(.mjs)라 타입 선언이 없다
import { parseCsv } from "../../scripts/import-kotra.mjs";

const reg = (over: Partial<Regulation>): Regulation => ({
  id: "1",
  country: "US",
  hs: ["7208100000"],
  product: "열연강판",
  measure: "반덤핑",
  status: "규제중",
  targets: ["한국"],
  period: "",
  duty: "",
  korea: true,
  ...over,
});

describe("findRegulations", () => {
  const rows = [
    reg({ id: "a", hs: ["7208101500"] }), // 10단위, 앞 6자리 720810
    reg({ id: "b", hs: ["7208"], korea: false }), // 4단위(넓은 분류)
    reg({ id: "c", hs: ["7209150000"] }), // 다른 6단위
    reg({ id: "d", hs: ["720810"], country: "IN" }),
    reg({ id: "e", hs: ["72081000"], status: "조사중" }),
  ];

  it("점·공백이 섞여도 숫자만 본다", () => expect(normalizeHs("7208.10-00")).toBe("72081000"));

  it("앞 6자리가 같으면 자릿수가 달라도 일치, 4단위 규제는 '넓은 분류'로 잡는다", () => {
    const hits = findRegulations(rows, { hs: "7208.10", country: "US" });
    expect(hits.map((h) => [h.reg.id, h.level])).toEqual([
      ["a", "SAME_6"],
      ["b", "BROADER"],
      ["e", "SAME_6"], // 조사중은 규제중 뒤
    ]);
  });

  it("목적국을 비우면 전 세계에서 찾는다", () => {
    expect(findRegulations(rows, { hs: "720810" }).map((h) => h.reg.id)).toContain("d");
  });

  it("4자리 미만 입력은 찾지 않는다(오탐 방지)", () => {
    expect(findRegulations(rows, { hs: "72" })).toEqual([]);
  });

  it("4자리만 입력하면 그 아래 세분류를 넓게 찾는다", () => {
    const hits = findRegulations(rows, { hs: "7209", country: "US" });
    expect(hits.map((h) => [h.reg.id, h.level])).toEqual([["c", "NARROWER"]]);
  });

  it("요약: 규제중·한국 대상·조사중 건수", () => {
    expect(summarizeHits(findRegulations(rows, { hs: "720810", country: "US" }))).toEqual({
      total: 3,
      active: 2,
      activeKorea: 1,
      investigating: 1,
    });
  });
});

describe("실제 KOTRA 수입규제 데이터", () => {
  const file = RegulationFileSchema.parse(JSON.parse(readFileSync("public/kotra/import-regulations.json", "utf8")));

  it("스키마에 맞고 출처·이용조건이 붙어 있다", () => {
    expect(file.rows.length).toBeGreaterThan(1000);
    expect(file.source.license).toContain("공공누리");
    expect(file.source.url).toContain("data.go.kr");
  });

  it("독일행 전기강판(7225.11)은 한국 대상 반덤핑 규제중으로 잡힌다", () => {
    const hits = findRegulations(file.rows, { hs: "7225.11", country: "DE" });
    expect(hits.some((h) => h.reg.korea && h.reg.measure === "반덤핑" && h.reg.status === "규제중")).toBe(true);
  });

  it("진행 상황은 마지막 괄호에서 뗀다: 우회수출(반덤핑)(규제중)", () => {
    expect(file.rows.some((r) => r.measure === "우회수출(반덤핑)" && r.status === "규제중")).toBe(true);
    expect(file.rows.some((r) => r.status.includes(")("))).toBe(false);
  });
});

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
