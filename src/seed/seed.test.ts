// 시드 데이터가 사양서 10장 시연 시나리오를 실제로 재현하는지 검증한다.
import { describe, expect, it } from "vitest";
import { seed } from "./index";
import { traceCase } from "../domain/trace";
import { STAGES } from "../domain/schemas";

describe("시드 무결성", () => {
  it("모든 사건은 4단계 기록을 갖고, 역추적 결과가 존재한다(재작업 건이므로)", () => {
    for (const c of seed.cases) {
      const stages = seed.snapshots.filter((s) => s.caseId === c.id && s.field === c.field).map((s) => s.stage);
      expect(new Set(stages)).toEqual(new Set(STAGES));
      expect(traceCase(c, seed.snapshots), c.id).not.toBeNull();
    }
  });

  it("개인 식별 필드(담당자·작성자 등)가 어떤 시드에도 없다", () => {
    const json = JSON.stringify(seed);
    expect(json).not.toMatch(/"(assignee|owner|author|user|userName|staff|createdBy|담당자|작성자)"\s*:/i);
  });
});

describe("시나리오 1: B/L 수하인 주소 누락", () => {
  const traces = seed.cases.map((c) => traceCase(c, seed.snapshots)!);
  const missingAddr = traces.filter((t) => t.field === "consigneeAddress" && t.kind === "MISSING");

  it("누락 7건 중 5건은 부킹 접수, 2건은 SI 단계에서 시작", () => {
    expect(missingAddr).toHaveLength(7);
    expect(missingAddr.filter((t) => t.originStage === "BOOKING")).toHaveLength(5);
    expect(missingAddr.filter((t) => t.originStage === "SI")).toHaveLength(2);
  });

  it("같은 필드의 오입력(우편번호 오타)은 누락과 별도로 분류된다", () => {
    const wrongAddr = traces.filter((t) => t.field === "consigneeAddress" && t.kind === "WRONG");
    expect(wrongAddr.map((t) => t.caseId)).toEqual(["C13"]);
  });
});

describe("시나리오 2: A 선사 전환 보고서 재료", () => {
  const claims = seed.report.claims;
  const evidence = claims.flatMap((c) => c.evidence);

  it("만료된 운임표 근거가 있다(오늘 2026-11-05 기준)", () => {
    expect(evidence.some((e) => e.validUntil && e.validUntil < "2026-11-05")).toBe(true);
  });
  it("근거 없는 환율 가정이 있다", () => {
    expect(claims.some((c) => c.assumptions.some((a) => !a.grounded && a.text.includes("환율")))).toBe(true);
  });
  it("같은 항목의 수치가 근거마다 다르다", () => {
    const values = evidence.flatMap((e) => (e.figures?.["A 선사 40ft 운임(USD)"] !== undefined ? [e.figures["A 선사 40ft 운임(USD)"]] : []));
    expect(new Set(values).size).toBeGreaterThan(1);
  });
  it("출처 없는 근거, 주장에서 비교하지 않은 대상이 있다", () => {
    expect(evidence.some((e) => !e.source)).toBe(true);
    expect(claims.some((c) => c.compareTargets.some((t) => !c.text.includes(t)))).toBe(true);
  });
  it("미리 분해된 주장 문장은 본문에 그대로 있다(AI 분해 결과와 비교 가능)", () => {
    for (const c of claims) expect(seed.report.text).toContain(c.text);
  });
});

describe("시나리오 3: 동일 내용·다른 제목 문서 재료", () => {
  const byId = Object.fromEntries(seed.docs.map((d) => [d.id, d]));
  const cos = (a: number[], b: number[]) => {
    const dot = a.reduce((s, x, i) => s + x * b[i]!, 0);
    const n = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return dot / (n(a) * n(b));
  };
  const sim = (x: string, y: string) => cos(byId[x]!.embedding!, byId[y]!.embedding!);

  it("견적서·단가표·경쟁 견적서는 서로 유사도가 높고, 동남아 안내문은 낮다", () => {
    expect(sim("D1", "D2")).toBeGreaterThan(0.95);
    expect(sim("D1", "D3")).toBeGreaterThan(0.95);
    expect(sim("D1", "D4")).toBeLessThan(0.5);
  });
  it("D1↔D2는 기준자료·거래처·항로가 같고 BAF만 다르다(215 vs 198)", () => {
    const [a, b] = [byId.D1!.keyValues, byId.D2!.keyValues];
    for (const k of ["기준자료", "거래처", "항로"]) expect(a[k]).toBe(b[k]);
    expect([a.BAF, b.BAF]).toEqual(["215", "198"]);
  });
  it("D3(경쟁 B 선사)는 기준자료가 달라 병합 대상이 아니다", () => {
    expect(byId.D3!.keyValues["기준자료"]).not.toBe(byId.D1!.keyValues["기준자료"]);
  });
  it("D2 이력에 D1에서 복사된 분기 지점이 있고, D5는 이력이 없다(원인 추정 불가 사례)", () => {
    expect(byId.D2!.history.some((h) => h.fromDocId === "D1")).toBe(true);
    expect(byId.D5!.history).toHaveLength(0);
  });
});
