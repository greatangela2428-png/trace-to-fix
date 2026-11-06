// 보고서 작성 도구 시드 검증: 스키마, 끊긴 링크, 인용 위치, 개인정보, 파생값, 이후 단계 시연 재료
import { describe, expect, it } from "vitest";
import { danglingLinks, fieldValue, type EvidenceInput } from "../domain/workspace";
import { AS_OF } from "./index";
import { hydrate, workspaceSeed } from "./workspace";

const { evidenceInputs, reportInputs } = workspaceSeed;
const { evidence, reports } = hydrate(evidenceInputs, reportInputs);
const ev = (id: string): EvidenceInput => {
  const e = evidenceInputs.find((x) => x.id === id);
  if (!e) throw new Error(`근거 없음: ${id}`);
  return e;
};
const rep = (id: string) => reports.find((r) => r.id === id)!;
const n = (v: string | number | undefined) => Number(v);

describe("시드 무결성", () => {
  it("끊긴 근거 링크가 없다", () => {
    expect(danglingLinks(reportInputs, evidenceInputs)).toEqual([]);
  });

  it("id가 겹치지 않는다", () => {
    expect(new Set(evidenceInputs.map((e) => e.id)).size).toBe(evidenceInputs.length);
    expect(new Set(reportInputs.map((r) => r.id)).size).toBe(reportInputs.length);
  });

  it("주장의 인용 구절은 섹션 본문에 그대로 있다(하이라이트 가능)", () => {
    for (const r of reportInputs) for (const s of r.sections) for (const c of s.claims) expect(s.text).toContain(c.quote);
  });

  it("링크가 가리키는 값(field)이 근거에 실제로 있다", () => {
    for (const r of reportInputs)
      for (const s of r.sections)
        for (const c of s.claims)
          for (const l of c.evidenceLinks) if (l.field) expect(fieldValue(ev(l.evidenceId), l.field), `${c.id}→${l.evidenceId}.${l.field}`).toBeDefined();
  });

  it("개인 식별 필드가 없다", () => {
    const json = JSON.stringify([evidenceInputs, reportInputs]);
    expect(json).not.toMatch(/담당자|작성자|assignee|author|"name"/i);
  });
});

describe("우선순위 시연 재료", () => {
  it("보고서 5건: 유형 4종, 마감·영향·준비 상태가 서로 다르다", () => {
    expect(reports).toHaveLength(5);
    expect(new Set(reports.map((r) => r.type)).size).toBe(4);
    expect(new Set(reports.map((r) => r.deadline.slice(0, 10))).size).toBe(5);
    expect(reports.filter((r) => r.decisionImpactKrw !== undefined).length).toBeGreaterThanOrEqual(2);
    expect(reports.some((r) => r.sections.some((s) => s.status === "empty"))).toBe(true);
  });

  it("걸린 금액은 근거 값으로 계산한다(직접 적지 않음)", () => {
    // 356 FEU × USD 2,100 × 1,350원
    expect(rep("R-SWITCH").decisionImpactKrw).toBe(356 * 2100 * 1350);
    // (215 − 198) × 48 FEU × 1,350원
    expect(rep("R-CLAIM").decisionImpactKrw).toBe((215 - 198) * 48 * 1350);
  });

  it("④ 열람 기록과 연결된 보고서: 주간 선복(P4, 열람 0) · 월간 재작업(P5)", () => {
    expect(rep("R-WEEKLY").procedureId).toBe("P4");
    expect(rep("R-REWORK").procedureId).toBe("P5");
  });
});

describe("보고서 반려 기록 근거(코드 계산)", () => {
  it("반려 13건, 재작업 비용 177.5만 원(35.5시간 × 5만 원), 근거 저장 단계 원인 6건", () => {
    const log = ev("E-REWORK-LOG");
    expect(fieldValue(log, "반려 건수")).toBe(13);
    expect(fieldValue(log, "재작업 비용 합계")).toBe(1775000);
    expect(fieldValue(log, "근거 저장 단계 원인 건수")).toBe(6);
  });
});

describe("이후 단계 시나리오가 데이터에 들어 있다", () => {
  it("적용 시점 만료: 현 선사 운임표는 기준일엔 유효하지만 2027-01-01 적용 시점엔 만료", () => {
    const c = ev("E-CONTRACT-CUR");
    expect(c.validTo! >= AS_OF).toBe(true);
    expect(c.validTo! < rep("R-SWITCH").appliesFrom!).toBe(true);
  });

  it("충돌: A 선사 운임 1,850(운임표) vs 1,920(견적 메일), BAF 215 vs 198", () => {
    expect(fieldValue(ev("E-RATE-A-Q3"), "A 선사 40ft 운임")).toBe(1850);
    expect(fieldValue(ev("E-MAIL-A"), "A 선사 40ft 운임")).toBe(1920);
    expect([fieldValue(ev("E-D1"), "BAF"), fieldValue(ev("E-D2"), "BAF")]).toEqual([215, 198]);
  });

  it("금액 민감도 기대치: 11.9% vs 8.6% 저렴, 연 절감 1.20억 vs 0.87억, 약 28% 감소", () => {
    const cur = n(fieldValue(ev("E-CONTRACT-CUR"), "현 선사 40ft 운임"));
    const vol = n(fieldValue(ev("E-SHIP-2026"), "연간 물동량"));
    const save = (a: number) => (cur - a) * vol * 1350;
    expect(((cur - 1850) / cur) * 100).toBeCloseTo(11.9, 1);
    expect(((cur - 1920) / cur) * 100).toBeCloseTo(8.6, 1);
    expect(save(1850)).toBe(120_150_000);
    expect(save(1920)).toBe(86_508_000);
    expect((1 - save(1920) / save(1850)) * 100).toBeCloseTo(28, 0);
  });

  it("범위 부족 재료: 절감 주장은 '유럽 항로', 운임 근거는 '부산-로테르담'만", () => {
    const cl2 = rep("R-SWITCH").sections.flatMap((s) => s.claims).find((c) => c.id === "CL2")!;
    expect(cl2.scope).toEqual(["유럽 항로"]);
    expect(ev("E-RATE-A-Q3").scope).toEqual(["부산-로테르담"]);
  });

  it("운임 구성 불명확 재료: 3분기 운임표에는 '포함 항목'이 없다", () => {
    expect(fieldValue(ev("E-RATE-A-Q3"), "포함 항목")).toBeUndefined();
    expect(fieldValue(ev("E-MAIL-A"), "포함 항목")).toBe("해상운임");
  });

  it("연결 없음 재료: 클레임 정산 금액 주장은 근거 링크가 없다", () => {
    const cc3 = rep("R-CLAIM").sections.flatMap((s) => s.claims).find((c) => c.id === "CC3")!;
    expect(cc3.evidenceLinks).toEqual([]);
  });

  it("결함 없는 보고서(R-THC): 근거는 출처·범위·적용 시점이 모두 맞는다", () => {
    const d4 = ev("E-D4");
    expect(d4.source).not.toBe("");
    expect(d4.validFrom! <= rep("R-THC").appliesFrom!).toBe(true);
    expect(d4.scope).toEqual(["부산-호찌민", "부산-방콕"]);
  });

  it("③ 중복 재료: D5는 D1과 값이 같고 어느 보고서도 쓰지 않는다, D2는 D1에서 복사 후 분기", () => {
    const pick = (e: EvidenceInput) => e.fields.filter((f) => f.key !== "포함 항목").map((f) => `${f.key}=${f.value}`).join();
    expect(pick(ev("E-D5"))).toBe(pick(ev("E-D1")));
    expect(evidence.find((e) => e.id === "E-D5")!.usedByReportIds).toEqual([]);
    expect(ev("E-D2").history?.[0]?.fromId).toBe("E-D1");
  });

  it("① 저장 시점 점검 재료: 부킹 기록 2건에 각각 수하인 주소·HS 코드가 비어 있다", () => {
    expect(fieldValue(ev("E-BK-261105"), "consigneeAddress")).toBe("");
    expect(fieldValue(ev("E-BK-261106"), "hsCode")).toBe("");
  });
});
