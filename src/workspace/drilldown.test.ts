import { describe, expect, it } from "vitest";
import { deriveWorkspace } from "./useWorkspace";
import { dueThisWeek, weakRows } from "./drilldown";
import { workspaceSeed } from "../seed/workspace";
import { DEFAULT_WEIGHTS } from "../domain/priority";

const ws = deriveWorkspace({
  evidence: workspaceSeed.evidenceInputs,
  reports: workspaceSeed.reportInputs,
  approvedRequired: [],
  clockOffsetDays: 0,
  weights: DEFAULT_WEIGHTS,
});

describe("상단 지표 상세 목록", () => {
  it("약한 근거 목록 건수 = 홈 지표 '약한 근거'", () => {
    expect(weakRows(ws)).toHaveLength(ws.metrics.weak);
    expect(weakRows(ws).some((r) => r.status === "missing" && !r.evidenceId)).toBe(true);
  });

  it("이번 주 마감 목록 건수 = 홈 지표, 우선순위 순서(클레임·주간 선복)", () => {
    const due = dueThisWeek(ws);
    expect(due).toHaveLength(ws.metrics.dueThisWeek);
    expect(due.map((v) => v.report.id)).toEqual(["R-CLAIM", "R-WEEKLY"]);
  });
});
