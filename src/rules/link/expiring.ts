import type { LinkRule } from "../types";
import { addDays, applyDate } from "../helpers";

export const EXPIRING_DAYS = 30;

/** 곧 만료: 적용 시점엔 유효하지만 기준일부터 30일 안에 끝나는 근거 */
export const expiring: LinkRule = {
  id: "expiring",
  scope: "link",
  name: "곧 만료",
  description: `유효기간 끝이 기준일부터 ${EXPIRING_DAYS}일 안이면 표시(적용 시점 만료가 아닐 때)`,
  inputs: ["evidence.validTo", "asOf", "report.appliesFrom"],
  owner: "code",
  check: ({ report, evidence, asOf }) => {
    const to = evidence.validTo;
    if (!to || to < asOf || to < applyDate(report)) return null;
    if (to > addDays(asOf, EXPIRING_DAYS)) return null;
    return {
      ruleId: "expiring",
      name: "곧 만료",
      status: "expiring",
      message: `'${evidence.title}'의 유효기간이 ${to}에 끝납니다. 제출 뒤에도 쓰일 보고서라면 갱신 여부를 확인해 주세요.`,
    };
  },
};
