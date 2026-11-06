import type { LinkRule } from "../types";
import { uncovered } from "../helpers";

/** 범위 부족: 주장은 상위 범위(예: 유럽 항로)인데 근거는 단일 구간(예: 부산-로테르담)뿐 */
export const scopeGap: LinkRule = {
  id: "scope-gap",
  scope: "link",
  name: "범위 부족",
  description: "주장 범위(claim.scope)를 근거 범위(evidence.scope)가 덮지 못하면 표시. 범위 계층은 SCOPE_TREE",
  inputs: ["claim.scope", "evidence.scope"],
  owner: "code",
  check: ({ claim, evidence }) => {
    if (!claim.scope.length || !evidence.scope.length) return null;
    const gap = uncovered(evidence.scope, claim.scope);
    if (!gap.length) return null;
    return {
      ruleId: "scope-gap",
      name: "범위 부족",
      status: "scope_gap",
      message: `주장은 '${gap.join(", ")}' 전체를 말하지만 '${evidence.title}'은 '${evidence.scope.join(", ")}'만 다룹니다. 다른 구간에도 같은 값이 맞는지 확인이 필요합니다.`,
    };
  },
};
