import { describe, expect, it } from "vitest";
import { buildSensitivity, discountOf, savingOf } from "./sensitivity";
import { checkItems, evaluateReport } from "../rules";
import { workspaceSeed } from "../seed/workspace";
import { AS_OF } from "../seed";

const { evidenceInputs, reportInputs } = workspaceSeed;
const byId = new Map(evidenceInputs.map((e) => [e.id, e]));
const report = (id: string) => reportInputs.find((r) => r.id === id)!;
const sens = (id: string, map = byId) => buildSensitivity(report(id), evaluateReport(report(id), map, AS_OF), map);

describe("금액 민감도(코드 계산)", () => {
  const s = sens("R-SWITCH")!;

  it("기준: 현 선사 2,100 USD/FEU, 물동량 356 FEU, 환율 1,350원", () => {
    expect(s.base.rate).toBe(2100);
    expect(s.volume.value).toBe(356);
    expect(s.fxKrwPerUsd).toBe(1350);
    expect(s.field).toBe("A 선사 40ft 운임");
  });

  it("1,850 → 11.9% 저렴·연 1억 2,015만 원, 1,920 → 8.6%·8,651만 원, 약 28% 감소", () => {
    expect(s.rows.map((r) => r.rate)).toEqual([1850, 1920]);
    expect(s.rows[0]!.discountPct).toBeCloseTo(11.9, 1);
    expect(s.rows[1]!.discountPct).toBeCloseTo(8.57, 1);
    expect(s.rows.map((r) => r.annualSavingKrw)).toEqual([120_150_000, 86_508_000]);
    expect(s.changePct).toBeCloseTo(28, 0);
  });

  it("보고서 본문의 '연 1억 2천만 원'은 1,850 기준 계산값과 0.1% 차이", () => {
    expect(s.asserted!.value).toBe(120_000_000);
    expect(Math.abs(s.asserted!.diffPct)).toBeLessThan(0.2);
  });

  it("값 출처를 함께 표시한다(본문 + 3분기 운임표 / 견적 메일)", () => {
    expect(s.rows[0]!.label).toContain("보고서 본문");
    expect(s.rows[0]!.label).toContain("A 선사 운임표(2026년 3분기)");
    expect(s.rows[1]!.label).toBe("A 선사 견적 회신 메일");
  });

  it("충돌이 풀리면(견적 메일도 1,850) 민감도 박스는 사라진다", () => {
    const fixed = new Map(byId).set("E-MAIL-A", {
      ...byId.get("E-MAIL-A")!,
      fields: [{ key: "A 선사 40ft 운임", value: 1850, unit: "USD/FEU" }, { key: "포함 항목", value: "해상운임" }],
    });
    expect(sens("R-SWITCH", fixed)).toBeNull();
  });

  it("차액형 계산식(클레임)·계산식 없는 보고서에는 만들지 않는다", () => {
    expect(sens("R-CLAIM")).toBeNull();
    expect(sens("R-THC")).toBeNull();
  });

  it("슬라이더용 함수", () => {
    expect(savingOf(2100, 2000, 100, 1000)).toBe(10_000_000);
    expect(discountOf(2000, 1500)).toBe(25);
  });
});

describe("확인 요청 묶음(주장 × 근거 1건)", () => {
  const items = checkItems(report("R-SWITCH"), evaluateReport(report("R-SWITCH"), byId, AS_OF));

  it("A 선사 보고서 6건, 상위 3개는 적용 시점 만료(현 선사) → 3분기 운임표 → 견적 메일 충돌", () => {
    expect(items).toHaveLength(6);
    expect(items.slice(0, 3).map((i) => `${i.evidenceId}:${i.finding.ruleId}`)).toEqual([
      "E-CONTRACT-CUR:expired-at-apply",
      "E-RATE-A-Q3:expired-at-apply",
      "E-MAIL-A:conflict",
    ]);
  });

  it("같은 근거의 나머지 점검은 묶음 안에 들어간다(적용 시점 만료가 대표, 기준일 만료는 뒤)", () => {
    const q3 = items.find((i) => i.evidenceId === "E-RATE-A-Q3" && i.claimId === "CL1")!;
    expect(q3.others.map((f) => f.ruleId)).toEqual(["expired-as-of", "conflict", "unclear-basis"]);
  });
});
