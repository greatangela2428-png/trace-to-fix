// 재작업 역추적(보고서 단위): 처음 틀린 단계, 패턴, 저장 필수 후보, 가상 재실행, 승인 → 보관함 반영
import { describe, expect, it } from "vitest";
import { HOURLY_COST_KRW, requiredFromReports, simulateRequired, traceReportCase } from "./reportRework";
import { approvedSpecs } from "./requiredFields";
import { requiredFields } from "../rules/save/requiredFields";
import { rPatterns, rTraces } from "../data";
import { seed } from "../seed";
import { deriveWorkspace } from "../workspace/useWorkspace";
import { workspaceSeed } from "../seed/workspace";
import { DEFAULT_WEIGHTS } from "./priority";

const ws = deriveWorkspace({ evidence: workspaceSeed.evidenceInputs, reports: workspaceSeed.reportInputs, approvedRequired: [], clockOffsetDays: 0, weights: DEFAULT_WEIGHTS });

describe("처음 틀린 단계", () => {
  it("반려 13건 모두 역추적된다", () => {
    expect(rTraces).toHaveLength(13);
  });

  it("저장 단계에서 비어 있던 포함 항목: 저장부터 제출까지 계속 비어 있음 → 원인 '근거 저장'(누락)", () => {
    const t = traceReportCase(seed.reportRework.find((c) => c.id === "RR01")!)!;
    expect([t.origin, t.kind]).toEqual(["SAVE", "MISSING"]);
  });

  it("보관함엔 2027 Q1이 있었는데 2026 Q3을 끌어옴 → 원인 '근거 끌어오기'(오입력)", () => {
    const t = traceReportCase(seed.reportRework.find((c) => c.id === "RR07")!)!;
    expect([t.origin, t.kind]).toEqual(["PULL", "WRONG"]);
    expect(t.steps.map((s) => s.status)).toEqual(["OK", "ORIGIN", "ERROR", "ERROR"]);
  });

  it("근거는 로테르담인데 본문에서 유럽 전체로 넓힘 → 원인 '본문 작성'", () => {
    expect(traceReportCase(seed.reportRework.find((c) => c.id === "RR09")!)!.origin).toBe("WRITE");
  });

  it("단계별: 저장 6건, 끌어오기 3건, 작성 4건 · 비용 = 시간 × 5만 원", () => {
    const by = (s: string) => rTraces.filter((t) => t.origin === s).length;
    expect([by("SAVE"), by("PULL"), by("WRITE")]).toEqual([6, 3, 4]);
    const hours = seed.reportRework.reduce((s, c) => s + c.hours, 0);
    expect(rTraces.reduce((s, t) => s + t.cost, 0)).toBe(hours * HOURLY_COST_KRW);
  });
});

describe("패턴과 저장 필수 후보", () => {
  it("가장 비용이 큰 패턴은 '근거 저장 · 운임 포함 항목 누락' 4건", () => {
    expect(rPatterns[0]).toMatchObject({ origin: "SAVE", item: "운임 포함 항목", kind: "MISSING" });
    expect(rPatterns[0]!.caseIds).toHaveLength(4);
  });

  it("저장 필수 후보는 저장 단계 누락에서만: 포함 항목(4건 방지)·유효기간(2건 방지)", () => {
    const c = requiredFromReports(rPatterns, ws.evidence);
    expect(c.map((x) => [x.field, x.preventable.length])).toEqual([
      ["포함 항목", 4],
      ["@validTo", 2],
    ]);
  });

  it("부담도 함께: 저장마다 1항목 추가, 지금 보관함에서 채워야 할 근거(3분기 운임표·견적 메일)", () => {
    const c = requiredFromReports(rPatterns, ws.evidence);
    expect(c[0]!.burden).toEqual({ extraFieldsPerSave: 1, backfill: ["E-RATE-A-Q3"] });
    expect(c[1]!.burden.backfill).toEqual(["E-MAIL-A"]);
  });

  it("가상 재실행: 포함 항목을 저장 필수로 했다면 13건 중 4건 방지", () => {
    const sim = simulateRequired(requiredFromReports(rPatterns, ws.evidence)[0]!, rTraces);
    expect([sim.total, sim.prevented]).toEqual([13, 4]);
  });

  it("승인 전엔 보관함 저장 점검이 '기본 권장'만, 승인하면 운임표·견적 메일·계약 모두 '승인된 필수'로 바뀐다", () => {
    const specs = approvedSpecs(["report|포함 항목"]);
    expect(specs.map((s) => s.type)).toEqual(["rate_table", "quote_mail", "contract"]);
    expect(specs.every((s) => s.origin === "approved")).toBe(true);
    const q3 = workspaceSeed.evidenceInputs.find((e) => e.id === "E-RATE-A-Q3")!;
    expect(requiredFields.check(q3, specs)).toEqual(["포함 항목"]);
  });
});
