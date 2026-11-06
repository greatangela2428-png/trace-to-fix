import type { LinkRule } from "../types";
import { fmtValue, valueOf } from "../helpers";

/** 충돌: 같은 항목인데 주장 값과 근거 값, 또는 근거끼리 값이 다르면 표시 */
export const conflict: LinkRule = {
  id: "conflict",
  scope: "link",
  name: "충돌",
  description: "링크가 기대는 항목(field)의 값이 주장(asserts)이나 같은 주장의 다른 근거와 다르면 표시",
  inputs: ["link.field", "evidence.fields", "claim.asserts", "siblings.fields"],
  owner: "code",
  check: ({ claim, link, evidence, siblings }) => {
    if (!link.field) return null;
    const mine = valueOf(evidence, link.field);
    if (mine === undefined) return null;
    const unit = evidence.fields.find((f) => f.key === link.field)?.unit;

    const asserted = claim.asserts.find((a) => a.key === link.field);
    if (asserted && asserted.value !== mine) {
      return {
        ruleId: "conflict",
        name: "충돌",
        status: "conflict",
        message: `${link.field}: 보고서는 ${fmtValue(asserted.value, unit)}, '${evidence.title}'은 ${fmtValue(mine, unit)}입니다. 어느 값이 맞는지 확인이 필요합니다.`,
      };
    }
    const other = siblings.find((s) => s.link.field === link.field && valueOf(s.evidence, link.field!) !== undefined && valueOf(s.evidence, link.field!) !== mine);
    if (other) {
      return {
        ruleId: "conflict",
        name: "충돌",
        status: "conflict",
        message: `${link.field}: '${evidence.title}' ${fmtValue(mine, unit)} vs '${other.evidence.title}' ${fmtValue(valueOf(other.evidence, link.field)!, unit)}. 근거끼리 값이 달라 확인이 필요합니다.`,
      };
    }
    return null;
  },
};
