import type { LinkRule } from "../types";
import { applyDate } from "../helpers";

/** 결정 적용 시점 기준 만료(새 규칙, 우선 표시). 기준일엔 유효해도 적용 시점에 끝나면 잡는다. */
export const expiredAtApply: LinkRule = {
  id: "expired-at-apply",
  scope: "link",
  name: "적용 시점 만료",
  description: "근거 유효기간 끝(validTo)이 결정 적용 시점(appliesFrom, 없으면 마감일)보다 앞서면 표시",
  inputs: ["evidence.validTo", "report.appliesFrom", "report.deadline"],
  owner: "code",
  check: ({ report, evidence }) => {
    const when = applyDate(report);
    if (!evidence.validTo || evidence.validTo >= when) return null;
    return {
      ruleId: "expired-at-apply",
      name: "적용 시점 만료",
      status: "expired_at_apply",
      message: `'${evidence.title}'의 유효기간(~${evidence.validTo})이 결정 적용 시점(${when}) 전에 끝납니다. 적용 시점의 값을 확인해야 합니다.`,
    };
  },
};
