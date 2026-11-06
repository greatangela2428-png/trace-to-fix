import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";
import { AS_OF, seed } from "../seed";
import { initialSuggestions, procedureById, traces, zombieFindings } from "../data";
import { SECTION_IDS, buildReport, periodStart, type ReportInput } from "./report";
import { coverRows, sectionRows } from "./excel";

const input: ReportInput = {
  asOf: AS_OF,
  cases: seed.cases,
  traces,
  confirmedReasons: {},
  suggestions: initialSuggestions,
  report: seed.report,
  zombies: zombieFindings,
  procedures: procedureById,
  zombieDecisions: {},
};
const build = (months: number, sections = [...SECTION_IDS]) =>
  buildReport(input, { months, sections, generatedAt: "2026-11-06T09:00:00.000Z" });

describe("periodStart", () => {
  it("기준일에서 N개월 전", () => {
    expect(periodStart("2026-11-05", 1)).toBe("2026-10-05");
    expect(periodStart("2026-11-05", 12)).toBe("2025-11-05");
  });
});

describe("buildReport", () => {
  it("고른 섹션만 순서대로 담고, 사전 점검 데이터가 없으면 그 섹션은 뺀다", () => {
    const doc = build(12);
    expect(doc.sections.map((s) => s.id)).toEqual(["rework", "patterns", "suggestions", "logic", "zombie"]);
    expect(build(12, ["logic", "rework"]).sections.map((s) => s.id)).toEqual(["rework", "logic"]);
  });

  it("기간 필터: 12개월은 전체 사건, 1개월은 기준일 한 달 전 이후만", () => {
    const all = build(12).sections[0]!;
    const recent = build(1).sections[0]!;
    expect(all.tables[0]!.rows).toHaveLength(traces.length);
    expect(recent.tables[0]!.rows.length).toBeLessThan(traces.length);
    expect(recent.tables[0]!.rows.every((r) => String(r.detectedAt) >= "2026-10-05")).toBe(true);
  });

  it("사건 이력 합계 비용이 요약과 일치하고, 개인명 필드가 없다", () => {
    const s = build(12).sections[0]!;
    const sum = s.tables[0]!.rows.reduce((n, r) => n + Number(r.cost), 0);
    expect(s.summary.find((x) => x.label === "누적 수정비용")!.value).toBe(`${sum.toLocaleString("ko-KR")}원`);
    expect(s.tables[0]!.columns.map((c) => c.label).join()).not.toMatch(/담당자|작성자|이름/);
  });

  it("사람이 확정한 반려 사유가 시드 사유보다 우선한다", () => {
    const id = traces[0]!.caseId;
    const doc = buildReport({ ...input, confirmedReasons: { [id]: "TYPO" } }, { months: 12, sections: ["rework"] });
    const row = doc.sections[0]!.tables[0]!.rows.find((r) => r.label === seed.cases.find((c) => c.id === id)!.label)!;
    expect(row.reason).toBe("오타");
  });

  it("논리 점검 섹션은 화면과 같은 점검 결과(6개)를 담는다", () => {
    const s = build(12).sections.find((x) => x.id === "logic")!;
    expect(s.summary.find((x) => x.label === "점검 결과")!.value).toBe("점검 항목 6개 발견");
    expect(s.tables[0]!.rows).toHaveLength(6);
  });

  it("업무 관성: 기간을 줄이면 월별 열과 실행 건수가 줄어든다", () => {
    const z12 = build(12).sections.find((x) => x.id === "zombie")!;
    const z3 = build(3).sections.find((x) => x.id === "zombie")!;
    expect(z3.tables[1]!.columns.length).toBeLessThan(z12.tables[1]!.columns.length);
    const exec = (s: typeof z12) => s.tables[0]!.rows.reduce((n, r) => n + Number(r.executed), 0);
    expect(exec(z3)).toBeLessThan(exec(z12));
  });
});

describe("엑셀 파일", () => {
  it("요약 + 섹션별 시트로 유효한 .xlsx(zip)를 만든다", async () => {
    const doc = build(12);
    const sheets = [
      { data: coverRows(doc), sheet: "요약" },
      ...doc.sections.map((s) => ({ data: sectionRows(s), sheet: s.title.slice(0, 31) })),
    ];
    const buf = await writeExcelFile(sheets as never).toBuffer();
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // xlsx는 zip
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("빈 표는 '데이터 없음' 행을 넣는다", () => {
    const doc = buildReport({ ...input, traces: [] }, { months: 12, sections: ["rework"] });
    const rows = sectionRows(doc.sections[0]!);
    expect(JSON.stringify(rows)).toContain("해당 기간 데이터가 없습니다");
  });
});
