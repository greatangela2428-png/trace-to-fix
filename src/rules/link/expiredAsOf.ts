import type { LinkRule } from "../types";

/** 기존 규칙(점검 기준일 기준 만료). 유지하되 화면에선 적용 시점 규칙 뒤에 보인다. */
export const expiredAsOf: LinkRule = {
  id: "expired-as-of",
  scope: "link",
  name: "기준일 만료",
  description: "근거 유효기간 끝이 점검 기준일보다 앞서면 표시(기존 ② 규칙)",
  inputs: ["evidence.validTo", "asOf"],
  owner: "code",
  check: ({ evidence, asOf }) => {
    if (!evidence.validTo || evidence.validTo >= asOf) return null;
    return {
      ruleId: "expired-as-of",
      name: "기준일 만료",
      status: "expired_at_apply",
      message: `'${evidence.title}'은 점검 기준일(${asOf})에 이미 유효기간(~${evidence.validTo})이 지났습니다. 최신 자료로 바꿔야 하는지 확인이 필요합니다.`,
    };
  },
};
