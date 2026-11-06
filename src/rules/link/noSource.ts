import type { LinkRule } from "../types";

/** 출처 불명확(기존 ② 규칙): 근거에 원본 파일·메일·시스템 기록이 없다 */
export const noSource: LinkRule = {
  id: "no-source",
  scope: "link",
  name: "출처 불명확",
  description: "근거의 출처(source)가 비어 있으면 표시",
  inputs: ["evidence.source"],
  owner: "code",
  check: ({ evidence }) => {
    if (evidence.source.trim()) return null;
    return {
      ruleId: "no-source",
      name: "출처 불명확",
      status: "unclear_basis",
      message: `'${evidence.title}'의 원본(파일·메일·시스템 기록)이 기록되어 있지 않습니다. 확인 가능한 자료인지 확인이 필요합니다.`,
    };
  },
};
