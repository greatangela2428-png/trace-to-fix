import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";
import { AS_OF, seed } from "../seed";
import { procedureById, rTraces, zombieFindings } from "../data";
import { SECTION_IDS, buildReport, periodStart, type ReportInput } from "./report";
import { coverRows, sectionRows } from "./excel";
import { deriveWorkspace } from "../workspace/useWorkspace";
import { workspaceSeed } from "../seed/workspace";
import { DEFAULT_WEIGHTS } from "../domain/priority";

const ws = deriveWorkspace({ evidence: workspaceSeed.evidenceInputs, reports: workspaceSeed.reportInputs, approvedRequired: [], clockOffsetDays: 0, weights: DEFAULT_WEIGHTS });
const input: ReportInput = {
  asOf: AS_OF,
  cases: seed.reportRework,
  traces: rTraces,
  confirmedReasons: {},
  candidates: ws.reportCandidates,
  approvedKeys: [],
  report: seed.report,
  zombies: zombieFindings,
  procedures: procedureById,
  zombieDecisions: {},
};
const build = (months: number, sections = [...SECTION_IDS], over: Partial<ReportInput> = {}) =>
  buildReport({ ...input, ...over }, { months, sections, generatedAt: "2026-11-06T09:00:00.000Z" });

describe("periodStart", () => {
  it("기준일에서 N개월 전", () => {
    expect(periodStart("2026-11-05", 1)).toBe("2026-10-05");
    expect(periodStart("2026-11-05", 12)).toBe("2025-11-05");
  });
});

describe("buildReport", () => {
  it("고른 섹션만 순서대로 담는다", () => {
    expect(build(12).sections.map((s) => s.id)).toEqual(["rework", "patterns", "suggestions", "logic", "zombie"]);
    expect(build(12, ["logic", "rework"]).sections.map((s) => s.id)).toEqual(["rework", "logic"]);
  });

  it("기간 필터: 12개월은 반려 13건 전부, 1개월은 기준일 한 달 전 이후만", () => {
    const all = build(12).sections[0]!;
    const recent = build(1).sections[0]!;
    expect(all.tables[0]!.rows).toHaveLength(13);
    expect(recent.tables[0]!.rows.length).toBeLessThan(13);
    expect(recent.tables[0]!.rows.every((r) => String(r.returnedAt) >= "2026-10-05")).toBe(true);
  });

  it("반려 이력 합계 비용이 요약과 일치하고, 개인명 열이 없다", () => {
    const s = build(12).sections[0]!;
    const sum = s.tables[0]!.rows.reduce((n, r) => n + Number(r.cost), 0);
    expect(s.summary.find((x) => x.label === "재작업 비용")!.value).toBe(`${sum.toLocaleString("ko-KR")}원`);
    expect(s.tables[0]!.columns.map((c) => c.label).join()).not.toMatch(/담당자|작성자|이름/);
  });

  it("사람이 확정한 반려 사유가 기록상 사유보다 우선한다", () => {
    const doc = build(12, ["rework"], { confirmedReasons: { RR04: "MISSING_INFO" } });
    const row = doc.sections[0]!.tables[0]!.rows.find((r) => r.report === "미주 항로 운임 보고")!;
    expect(row.reason).toBe("정보 누락"); // 기록상은 '오타'였음
  });

  it("저장 필수 항목 제안: 방지 건수·부담·승인 상태가 들어간다", () => {
    const s = build(12, ["suggestions"], { approvedKeys: ["report|포함 항목"] }).sections[0]!;
    expect(s.tables[0]!.rows[0]).toMatchObject({ prevented: 4, total: 13, status: "승인" });
    expect(s.tables[0]!.rows[1]).toMatchObject({ prevented: 2, status: "승인 전" });
  });

  it("논리 점검 섹션은 화면과 같은 점검 결과(6개)를 담는다", () => {
    const s = build(12).sections.find((x) => x.id === "logic")!;
    expect(s.summary.find((x) => x.label === "점검 결과")!.value).toBe("점검 항목 6개 발견");
  });

  it("업무 관성: 기간을 줄이면 월별 열과 실행 건수가 줄어든다", () => {
    const z12 = build(12).sections.find((x) => x.id === "zombie")!;
    const z3 = build(3).sections.find((x) => x.id === "zombie")!;
    expect(z3.tables[1]!.columns.length).toBeLessThan(z12.tables[1]!.columns.length);
  });
});

describe("엑셀 파일", () => {
  it("요약 + 섹션별 시트로 유효한 .xlsx(zip)를 만든다", async () => {
    const doc = build(12);
    const sheets = [{ data: coverRows(doc), sheet: "요약" }, ...doc.sections.map((s) => ({ data: sectionRows(s), sheet: s.title.slice(0, 31) }))];
    const buf = await writeExcelFile(sheets as never).toBuffer();
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });

  it("빈 표는 '데이터 없음' 행을 넣는다", () => {
    const doc = build(12, ["rework"], { traces: [] });
    expect(JSON.stringify(sectionRows(doc.sections[0]!))).toContain("해당 기간 데이터가 없습니다");
  });
});
