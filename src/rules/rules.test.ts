// 규칙이 시드 시나리오에서 기대한 점검 항목을 내는지(그리고 결함 없는 보고서에선 조용한지) 검증
import { describe, expect, it } from "vitest";
import { ALL_RULES, CODE_RULE_COUNT, checkItems, evaluateReport, type EvaluatedClaim } from "./index";
import { requiredFields, BASELINE_SPECS } from "./save/requiredFields";
import { covers, uncovered } from "./helpers";
import { workspaceSeed } from "../seed/workspace";
import { AS_OF, seed } from "../seed";
import { traces } from "../data";
import { bookingRequiredCandidates, approvedSpecs } from "../domain/requiredFields";
import { findDuplicates, mergeGroup, resolveCanonical } from "../domain/dedupe";
import { recommendEvidence } from "../domain/recommend";
import type { EvidenceInput, WorkReportInput } from "../domain/workspace";

const { evidenceInputs, reportInputs } = workspaceSeed;
const byId = new Map(evidenceInputs.map((e) => [e.id, e]));
const report = (id: string) => reportInputs.find((r) => r.id === id)!;
const evalR = (id: string) => evaluateReport(report(id), byId, AS_OF);
const link = (ev: EvaluatedClaim[], claimId: string, evidenceId: string) =>
  ev.find((c) => c.claim.id === claimId)!.links.find((l) => l.evidenceId === evidenceId)!;
const rules = (ev: EvaluatedClaim[], claimId: string, evidenceId: string) => link(ev, claimId, evidenceId).findings.map((f) => f.ruleId);

describe("규칙 메타데이터", () => {
  it("모든 규칙에 이름·설명·입력·담당 구분이 있고 id가 겹치지 않는다", () => {
    for (const r of ALL_RULES) {
      expect(r.name && r.description && r.inputs.length && ["code", "llm"].includes(r.owner)).toBeTruthy();
    }
    expect(new Set(ALL_RULES.map((r) => r.id)).size).toBe(ALL_RULES.length);
    expect(CODE_RULE_COUNT).toBe(ALL_RULES.filter((r) => r.owner === "code").length);
  });
});

describe("A 선사 전환 보고서(기본 데모)", () => {
  const ev = evalR("R-SWITCH");

  it("현 선사 운임표: 기준일엔 유효하지만 적용 시점(2027-01-01)엔 만료 → 적용 시점 만료만", () => {
    expect(rules(ev, "CL1", "E-CONTRACT-CUR")).toEqual(["expired-at-apply"]);
    expect(link(ev, "CL1", "E-CONTRACT-CUR").status).toBe("expired_at_apply");
  });

  it("3분기 운임표: 적용 시점 만료가 기준일 만료보다 먼저, 충돌·포함 항목 불명확도 함께", () => {
    expect(rules(ev, "CL1", "E-RATE-A-Q3")).toEqual(["expired-at-apply", "expired-as-of", "conflict", "unclear-basis"]);
  });

  it("견적 메일 1,920 vs 보고서 1,850 → 충돌", () => {
    const l = link(ev, "CL1", "E-MAIL-A");
    expect(l.status).toBe("conflict");
    expect(l.findings[0]!.message).toContain("1,850");
    expect(l.findings[0]!.message).toContain("1,920");
  });

  it("절감 주장(유럽 항로 전체) ← 부산-로테르담 운임 근거 → 범위 부족, 물동량 근거(유럽 항로)는 통과", () => {
    expect(rules(ev, "CL2", "E-CONTRACT-CUR")).toContain("scope-gap");
    expect(link(ev, "CL2", "E-SHIP-2026").status).toBe("fresh");
  });

  it("홍보 자료 → 출처 불명확", () => {
    expect(rules(ev, "CL3", "E-PROMO-A")).toEqual(["no-source"]);
  });

  it("점수: 방향 영향 + 계약 결정 + 적용 시점 만료가 크기 영향보다 높다", () => {
    const top = link(ev, "CL1", "E-CONTRACT-CUR").priorityScore; // 1 × 0.9 × 1 × 1
    const mag = link(ev, "CL2", "E-CONTRACT-CUR").priorityScore; // 1 × 0.9 × 1 × 0.6
    expect(top).toBe(90);
    expect(mag).toBe(54);
  });

  it("확인 요청은 점수 순으로 정렬된다", () => {
    const items = checkItems(report("R-SWITCH"), ev);
    expect(items.length).toBeGreaterThan(3); // 상위 3개 + '기타 N건' 시연 가능
    expect(items.map((i) => i.score)).toEqual([...items.map((i) => i.score)].sort((a, b) => b - a));
  });
});

describe("다른 보고서", () => {
  it("클레임: BAF 215 vs 198 충돌, 정산 금액 주장은 연결 없음", () => {
    const ev = evalR("R-CLAIM");
    expect(link(ev, "CC1", "E-D2").status).toBe("conflict");
    expect(ev.find((c) => c.claim.id === "CC3")!.claimFindings.map((f) => f.ruleId)).toEqual(["missing-link"]);
  });

  it("주간 선복: 유효기간 11-09 → 곧 만료(적용 시점=마감 11-06엔 유효)", () => {
    expect(rules(evalR("R-WEEKLY"), "CW1", "E-SPACE-W45")).toEqual(["expiring"]);
  });

  it("월간 재작업: 본문 숫자가 재작업 기록과 같아 전부 자동 통과", () => {
    expect(checkItems(report("R-REWORK"), evalR("R-REWORK"))).toEqual([]);
  });

  it("결함 없는 보고서(R-THC): 확인 요청 0~1건", () => {
    expect(checkItems(report("R-THC"), evalR("R-THC"))).toEqual([]); // THC는 단일 부대비용이라 포함 항목을 묻지 않는다
  });

  it("근거를 고치면 즉시 다시 계산된다: 견적 메일 값을 1,850으로 바꾸면 충돌이 사라진다", () => {
    const fixed: EvidenceInput = { ...byId.get("E-MAIL-A")!, fields: [{ key: "A 선사 40ft 운임", value: 1850, unit: "USD/FEU" }, { key: "포함 항목", value: "해상운임" }] };
    const map = new Map(byId).set("E-MAIL-A", fixed);
    const ev = evaluateReport(report("R-SWITCH"), map, AS_OF);
    expect(link(ev, "CL1", "E-MAIL-A").status).toBe("fresh");
  });

  it("근거를 연결하면 '연결 없음'이 사라진다", () => {
    const r = report("R-CLAIM");
    const linked: WorkReportInput = {
      ...r,
      sections: r.sections.map((s) => ({
        ...s,
        claims: s.claims.map((c) => (c.id === "CC3" ? { ...c, evidenceLinks: [{ evidenceId: "E-D1", field: "BAF", impactType: "magnitude" as const }] } : c)),
      })),
    };
    expect(evaluateReport(linked, byId, AS_OF).find((c) => c.claim.id === "CC3")!.claimFindings).toEqual([]);
  });
});

describe("범위 계층", () => {
  it("상위 범위 근거는 하위 구간을 덮고, 반대는 못 덮는다", () => {
    expect(covers(["유럽 항로"], "부산-로테르담")).toBe(true);
    expect(covers(["부산-로테르담"], "유럽 항로")).toBe(false);
    expect(uncovered(["부산-호찌민", "부산-방콕"], ["부산-호찌민", "부산-방콕"])).toEqual([]);
  });
});

describe("① 저장 시점 점검", () => {
  const candidates = bookingRequiredCandidates(traces, seed.cases);

  it("수하인 주소: 8건 중 5건(82만 원)은 부킹 저장 시 필수였다면 막을 수 있었다", () => {
    const c = candidates[0]!;
    expect(c.field).toBe("consigneeAddress");
    expect([c.totalCases, c.preventable.length, c.preventableCost]).toEqual([8, 5, 820000]);
    expect(c.notPreventable).toHaveLength(3);
  });

  it("HS 코드는 후보지만 부킹 이후 유실이라 부킹 필수화로 막는 건은 0건(정직하게 표시)", () => {
    const hs = candidates.find((c) => c.field === "hsCode")!;
    expect(hs.preventable).toEqual([]);
  });

  it("승인 전에는 후보가 저장 점검에 반영되지 않고, 승인하면 반영된다", () => {
    const bk = byId.get("E-BK-261105")!;
    expect(requiredFields.check(bk, BASELINE_SPECS)).toEqual([]);
    expect(requiredFields.check(bk, [...BASELINE_SPECS, ...approvedSpecs(["booking|consigneeAddress"])])).toEqual(["consigneeAddress"]);
  });

  it("기본 권장: 3분기 운임표는 포함 항목이, 견적 메일은 유효기간이 비어 있다", () => {
    expect(requiredFields.check(byId.get("E-RATE-A-Q3")!, BASELINE_SPECS)).toEqual(["포함 항목"]);
    expect(requiredFields.check(byId.get("E-MAIL-A")!, BASELINE_SPECS)).toEqual(["@validTo"]);
  });
});

describe("③ 중복 방지", () => {
  const groups = findDuplicates(evidenceInputs);

  it("D5는 D1과 같은 내용(중복, 대표 D1), D2는 D1에서 복사 후 BAF가 달라진 분기, B 선사 견적은 묶지 않는다", () => {
    const dup = groups.find((g) => g.kind === "duplicate")!;
    expect([dup.canonicalId, dup.memberIds]).toEqual(["E-D1", ["E-D5"]]);
    const div = groups.find((g) => g.kind === "diverged")!;
    expect([div.canonicalId, div.memberIds, div.differences.map((d) => d.key)]).toEqual(["E-D1", ["E-D2"], ["BAF"]]);
    expect(groups.flatMap((g) => [g.canonicalId, ...g.memberIds])).not.toContain("E-D3");
  });

  it("병합하면 구성원이 대표를 가리키고, 다시 찾으면 그 묶음은 나오지 않는다", () => {
    const dup = groups.find((g) => g.kind === "duplicate")!;
    const merged = mergeGroup(evidenceInputs, dup);
    const m = new Map(merged.map((e) => [e.id, e]));
    expect(resolveCanonical("E-D5", m)).toBe("E-D1");
    expect(findDuplicates(merged).some((g) => g.kind === "duplicate")).toBe(false);
  });
});

describe("근거 끌어오기 추천", () => {
  it("정산 금액 주장에 BAF 견적·한빛전자 선적 실적이 후보로 나온다(중복본 D5는 제외)", () => {
    const cc3 = report("R-CLAIM").sections.flatMap((s) => s.claims).find((c) => c.id === "CC3")!;
    const merged = mergeGroup(evidenceInputs, findDuplicates(evidenceInputs).find((g) => g.kind === "duplicate")!);
    const ids = recommendEvidence(cc3, merged, report("R-CLAIM").title).map((r) => r.evidence.id);
    expect(ids).toEqual(expect.arrayContaining(["E-D1", "E-HANBIT-NOV"]));
    expect(ids).not.toContain("E-D5");
  });

  it("이미 연결된 근거는 다시 추천하지 않는다", () => {
    const cl1 = report("R-SWITCH").sections.flatMap((s) => s.claims).find((c) => c.id === "CL1")!;
    const ids = recommendEvidence(cl1, evidenceInputs).map((r) => r.evidence.id);
    expect(ids).not.toContain("E-MAIL-A");
  });
});

describe("③ 병합 적용", () => {
  it("단가표 v2(BAF 198)를 견적서(BAF 215)로 병합하며 215를 고르면, 클레임 보고서 링크가 대표 하나로 모여 충돌이 사라진다", async () => {
    const { applyMerge } = await import("../domain/dedupe");
    const before = evaluateReport(report("R-CLAIM"), byId, AS_OF);
    expect(before.find((c) => c.claim.id === "CC1")!.links.some((l) => l.status === "conflict")).toBe(true);
    const m = applyMerge(evidenceInputs, reportInputs, "E-D1", "E-D2", { BAF: 215 });
    expect(m.repointed).toEqual([{ reportId: "R-CLAIM", claimId: "CC1" }]);
    const map = new Map(m.evidence.map((e) => [e.id, e]));
    const after = evaluateReport(m.reports.find((r) => r.id === "R-CLAIM")!, map, AS_OF).find((c) => c.claim.id === "CC1")!;
    expect(after.links.map((l) => l.evidenceId)).toEqual(["E-D1"]); // 중복 링크는 하나로
    expect(after.links.some((l) => l.status === "conflict")).toBe(false);
    expect(map.get("E-D2")!.canonicalId).toBe("E-D1");
  });

  it("값이 같은 중복(참고자료 → 견적서)은 고를 값 없이 병합되고, 쓰던 보고서가 없으면 링크 변경 0건", async () => {
    const { applyMerge } = await import("../domain/dedupe");
    const m = applyMerge(evidenceInputs, reportInputs, "E-D1", "E-D5");
    expect(m.repointed).toEqual([]);
    expect(m.evidence.find((e) => e.id === "E-D5")!.canonicalId).toBe("E-D1");
  });
});
