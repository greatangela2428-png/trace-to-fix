// 업무 TODO: 우선순위 순서, 실시간 소멸(근거 수정·응답·결정), 보호 항목 제외
import { describe, expect, it } from "vitest";
import { buildTodos, type TodoInput } from "./todo";
import { deriveWorkspace } from "../workspace/useWorkspace";
import { workspaceSeed } from "../seed/workspace";
import { DEFAULT_WEIGHTS } from "./priority";
import type { WorkspaceState } from "../store";
import { requiredLabel } from "../workspace/ui";

const base: WorkspaceState = {
  evidence: workspaceSeed.evidenceInputs,
  reports: workspaceSeed.reportInputs,
  approvedRequired: [],
  clockOffsetDays: 0,
  weights: DEFAULT_WEIGHTS,
};

function todos(ws: WorkspaceState, extra: Partial<Pick<TodoInput, "checkLog" | "decided">> = {}) {
  const d = deriveWorkspace(ws);
  return buildTodos({
    reports: d.reports.map((v) => ({ report: v.report, priority: v.priority, items: v.items, sections: v.report.sections })),
    evidence: d.evidence,
    duplicates: d.duplicates,
    unread: d.unread,
    checkLog: extra.checkLog ?? {},
    decided: extra.decided ?? new Set(),
    evidenceTitle: (id) => d.byId.get(id)?.title ?? id,
    requiredLabel,
  });
}

describe("업무 TODO", () => {
  const list = todos(base);

  it("1순위 할 일은 1순위 보고서의 가장 중요한 확인 요청(현 선사 운임표 적용 시점 만료)", () => {
    expect(list[0]).toMatchObject({ kind: "check", context: "유럽 항로 A 선사 전환 검토" });
    expect(list[0]!.title).toContain("현 선사 계약 운임표");
  });

  it("점수 순으로 정렬되고 종류가 섞여 있다(확인·작성·연결·보관함·정리·결정)", () => {
    expect(list.map((t) => t.score)).toEqual([...list.map((t) => t.score)].sort((a, b) => b - a));
    expect(new Set(list.map((t) => t.kind))).toEqual(new Set(["check", "write", "link", "vault", "dedupe", "decide"]));
  });

  it("HS 코드처럼 보호된 항목은 '뺄지 결정' 할 일로 만들지 않는다", () => {
    expect(list.some((t) => t.kind === "decide" && t.title.includes("HS 코드"))).toBe(false);
    expect(list.some((t) => t.kind === "decide" && t.title.includes("주간 선복"))).toBe(true);
  });

  it("근거를 고치면 관련 할 일이 자동으로 사라진다(견적 메일 1,850 → 충돌 할 일 없음)", () => {
    const fixed = {
      ...base,
      evidence: base.evidence.map((e) => (e.id === "E-MAIL-A" ? { ...e, fields: e.fields.map((f) => (f.key === "A 선사 40ft 운임" ? { ...f, value: 1850 } : f)) } : e)),
    };
    const has = (l: ReturnType<typeof todos>) => l.some((t) => t.target.tab === "write" && t.target.evidenceId === "E-MAIL-A");
    expect(has(list)).toBe(true);
    expect(has(todos(fixed))).toBe(false);
  });

  it("빈 섹션을 쓰면 '섹션 쓰기' 할 일이 사라진다", () => {
    const written = {
      ...base,
      reports: base.reports.map((r) => (r.id === "R-SWITCH" ? { ...r, sections: r.sections.map((s) => (s.id === "S4" ? { ...s, text: "B 선사 비교", status: "draft" as const } : s)) } : r)),
    };
    expect(list.some((t) => t.key === "todo:write:R-SWITCH:S4")).toBe(true);
    expect(todos(written).some((t) => t.key === "todo:write:R-SWITCH:S4")).toBe(false);
  });

  it("확인함·문제없음은 빠지고, 수정할게요는 '수정 예정'으로 남는다", () => {
    const first = list[0]!;
    const ack = Object.fromEntries(first.itemKeys!.map((k) => [k, { action: "ack" as const }]));
    expect(todos(base, { checkLog: ack }).some((t) => t.key === first.key)).toBe(false);
    expect(todos(base, { checkLog: { [first.itemKeys![0]!]: { action: "fix" } } }).find((t) => t.key === first.key)?.pendingFix).toBe(true);
  });

  it("결정을 내리면 결정 할 일이 사라진다", () => {
    const decide = list.find((t) => t.kind === "decide")!;
    expect(todos(base, { decided: new Set([decide.procedureId!]) }).some((t) => t.key === decide.key)).toBe(false);
  });
});

describe("같은 일은 한 번만", () => {
  it("같은 근거·같은 문제가 주장 두 개에 걸려도 할 일은 하나(현 선사 운임표 적용 시점 만료)", () => {
    const list = todos(base).filter((t) => t.context === "유럽 항로 A 선사 전환 검토" && t.title.includes("현 선사 계약 운임표"));
    expect(list).toHaveLength(1);
    expect(list[0]!.itemKeys).toHaveLength(2);
    expect(list[0]!.why).toContain("주장 2개에 영향");
  });
});
