import type { LinkRule } from "../types";
import { isFreightField, valueOf } from "../helpers";

const KEY = "포함 항목";

/** 운임 구성 불명확: 해상운임 단독인지 부대비용 포함인지 알 수 없거나, 근거끼리 구성이 다르면 표시 */
export const unclearBasis: LinkRule = {
  id: "unclear-basis",
  scope: "link",
  name: "포함 항목 불명확",
  description: "운임 값에 '포함 항목'이 없거나, 같은 주장의 다른 운임 근거와 포함 항목이 다르면 표시(BAF·THC 단일 항목은 제외)",
  inputs: ["link.field", "evidence.fields['포함 항목']", "siblings.fields['포함 항목']"],
  owner: "code",
  check: ({ link, evidence, siblings }) => {
    if (!link.field || !isFreightField(link.field)) return null;
    const mine = valueOf(evidence, KEY);
    if (mine === undefined || mine === "") {
      return {
        ruleId: "unclear-basis",
        name: "포함 항목 불명확",
        status: "unclear_basis",
        message: `'${evidence.title}'에 운임 포함 항목이 없습니다. 해상운임만인지 BAF·THC 같은 부대비용이 포함된 값인지 확인이 필요합니다.`,
      };
    }
    const differ = siblings.find((s) => s.link.field && isFreightField(s.link.field) && valueOf(s.evidence, KEY) && valueOf(s.evidence, KEY) !== mine);
    if (differ) {
      return {
        ruleId: "unclear-basis",
        name: "포함 항목 불명확",
        status: "unclear_basis",
        message: `'${evidence.title}'(${mine})과 '${differ.evidence.title}'(${valueOf(differ.evidence, KEY)})의 운임 구성이 달라, 같은 기준으로 비교한 것인지 확인이 필요합니다.`,
      };
    }
    return null;
  },
};
