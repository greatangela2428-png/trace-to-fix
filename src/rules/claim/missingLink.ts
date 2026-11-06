import type { ClaimRule } from "../types";

/** 숫자나 인과(그래서·때문에)를 말하는 문장인가 */
export const needsEvidence = (text: string) => /\d/.test(text) || /(므로|때문|따라서|덕분|으로 인해)/.test(text);

/** 연결 없음: 수치·인과 주장인데 근거 링크가 하나도 없다 */
export const missingLink: ClaimRule = {
  id: "missing-link",
  scope: "claim",
  name: "연결 없음",
  description: "숫자나 인과 표현이 있는 주장(또는 asserts가 있는 주장)에 근거 링크가 없으면 표시",
  inputs: ["claim.text", "claim.asserts", "claim.evidenceLinks"],
  owner: "code",
  check: ({ claim }) => {
    if (claim.evidenceLinks.length) return null;
    if (!claim.asserts.length && !needsEvidence(claim.text)) return null;
    return {
      ruleId: "missing-link",
      name: "연결 없음",
      status: "missing",
      message: `'${claim.text}'에 연결된 근거가 없습니다. 이 수치·인과를 뒷받침할 근거를 보관함에서 끌어와야 하는지 확인해 주세요.`,
    };
  },
};
