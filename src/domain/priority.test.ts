// 우선순위 엔진: 기본 순위, 이유 문장, 실시간 재계산(근거 수정·기준일·마감·가중치), ④ 열람 보정과 HS 코드 교차 보호
import { describe, expect, it } from "vitest";
import { deriveWorkspace } from "../workspace/useWorkspace";
import { workspaceSeed } from "../seed/workspace";
import { DEFAULT_WEIGHTS, daysLeft, weekRange } from "./priority";
import type { WorkspaceState } from "../store";

const base: WorkspaceState = {
  evidence: workspaceSeed.evidenceInputs,
  reports: workspaceSeed.reportInputs,
  approvedRequired: [],
  clockOffsetDays: 0,
  weights: DEFAULT_WEIGHTS,
};
const order = (ws: WorkspaceState) => deriveWorkspace(ws).ranked.map((v) => v.report.id);
const detail = (ws: WorkspaceState, id: string) => deriveWorkspace(ws).reportById.get(id)!.priority;

describe("기본 순위", () => {
  it("상위 3건: A 선사 전환(10억·임원) → BAF 클레임(마감 임박) → 주간 선복", () => {
    expect(order(base).slice(0, 3)).toEqual(["R-SWITCH", "R-CLAIM", "R-WEEKLY"]);
  });

  it("1순위 이유는 금액·독자·근거 상태·미작성 섹션·마감을 담고, 점수 구성이 저장된다", () => {
    const p = detail(base, "R-SWITCH");
    expect(p.reasonLines[0]).toContain("10.1억 원");
    expect(p.reasonLines.join()).toContain("적용 시점 만료");
    expect(p.reasonLines.join()).toContain("미작성 섹션 1개");
    expect(Object.keys(p.breakdown)).toEqual(["impact", "urgency", "unreadiness", "audience"]);
  });

  it("결함 없는 보고서(R-THC)는 준비 부족도가 최저(0.1)", () => {
    expect(detail(base, "R-THC").breakdown.unreadiness).toBe(0.1);
  });
});

describe("실시간 재계산", () => {
  it("A 선사 보고서 근거를 고치면(계약 연장·견적 일치) 준비 부족도가 내려가고 1순위가 클레임으로 바뀐다", () => {
    const fixed: WorkspaceState = {
      ...base,
      evidence: base.evidence.map((e) =>
        e.id === "E-CONTRACT-CUR"
          ? { ...e, validTo: "2027-12-31", scope: ["유럽 항로"] }
          : e.id === "E-MAIL-A"
            ? { ...e, fields: e.fields.map((f) => (f.key === "A 선사 40ft 운임" ? { ...f, value: 1850 } : f)) }
            : e,
      ),
    };
    expect(detail(fixed, "R-SWITCH").breakdown.unreadiness).toBeLessThan(detail(base, "R-SWITCH").breakdown.unreadiness);
    expect(order(fixed)[0]).toBe("R-CLAIM");
  });

  it("기준일을 하루 넘기면 마감 임박도가 올라간다", () => {
    expect(detail({ ...base, clockOffsetDays: 1 }, "R-CLAIM").breakdown.urgency).toBeGreaterThan(detail(base, "R-CLAIM").breakdown.urgency);
  });

  it("마감을 앞당기면 점수가 올라간다(월간 재작업 마감을 오늘 저녁으로)", () => {
    const moved = { ...base, reports: base.reports.map((r) => (r.id === "R-REWORK" ? { ...r, deadline: "2026-11-05T18:00:00+09:00" } : r)) };
    expect(detail(moved, "R-REWORK").score).toBeGreaterThan(detail(base, "R-REWORK").score * 1.5);
  });

  it("가중치를 0으로 두면 그 요소는 순위에 영향을 주지 않는다(마감만 보기)", () => {
    const onlyUrgency = { ...base, weights: { impact: 0, urgency: 1, unreadiness: 0, audience: 0 } };
    expect(order(onlyUrgency)[0]).toBe("R-WEEKLY"); // 마감이 가장 가까움
  });
});

describe("④ 열람 보정과 교차 보호", () => {
  it("주간 선복 보고서: 12개월 52회 작성·열람 0회 → 독자 중요도 절반, '순위를 낮춘 이유'를 맨 앞에", () => {
    const p = detail(base, "R-WEEKLY");
    expect(p.read).toMatchObject({ executed: 52, outcomes: 0, factor: 0.5 });
    expect(p.reasonLines[0]).toContain("순위를 낮춘 이유");
    expect(p.reasonLines[0]).toContain("인쇄·구두 공유 미포함");
  });

  it("HS 코드는 참조 0건이어도 재작업 원인 필드라 보호, 화주 팩스번호는 뺄지 질문", () => {
    const u = deriveWorkspace(base).unread;
    const hs = u.find((x) => x.name.includes("HS 코드"))!;
    expect(hs.protectedBy).toMatchObject({ reworkCases: 1 });
    expect(hs.question).toContain("빼면 반려가 늘 수 있어");
    expect(u.find((x) => x.name.includes("팩스"))!.protectedBy).toBeUndefined();
  });
});

describe("상단 지표", () => {
  it("이번 주(11-02~11-08) 마감 2건, 근거 준비도 = 자동 통과 ÷ (링크 + 연결 없는 주장)", () => {
    const m = deriveWorkspace(base).metrics;
    expect(m.week).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(m.dueThisWeek).toBe(2);
    expect(m.readinessPct).toBe(Math.round((m.autoPass / m.totalSlots) * 100));
    expect(m.weak + m.autoPass).toBe(m.totalSlots);
  });

  it("보조 함수", () => {
    expect(daysLeft("2026-11-06T09:00:00+09:00", "2026-11-05T09:00:00+09:00")).toBe(1);
    expect(weekRange("2026-11-09T09:00:00+09:00").from).toBe("2026-11-09"); // 월요일
  });
});

describe("금액 표기", () => {
  it("1억 이상은 억, 그 아래는 만 원", async () => {
    const { krwShort } = await import("./priority");
    expect(krwShort(1_009_260_000)).toBe("10.1억 원");
    expect(krwShort(1_101_600)).toBe("110만 원");
  });
});
