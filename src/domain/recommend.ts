// 근거 끌어오기: 주장 → 보관함 근거 후보 추천. 코드 매칭(항목명·범위·낱말)이라 결과가 항상 같고 비용이 없다.
// (LLM 추천이 아님. 화면에 그렇게 밝힌다)
import type { ClaimInput, EvidenceInput } from "./workspace";
import { covers } from "../rules/helpers";

export interface Recommendation {
  evidence: EvidenceInput;
  score: number;
  field?: string; // 연결할 때 기댈 값(주장의 수치 항목과 같은 이름)
  reasons: string[];
}

const tokens = (s: string) => new Set((s.match(/[가-힣A-Za-z]{2,}|\d{3,}/g) ?? []).map((t) => t.toLowerCase()));

/** context: 보고서 제목 등 주장 바깥의 단서(예: 거래처명). 일치하면 가산점 */
export function recommendEvidence(claim: ClaimInput, items: EvidenceInput[], context = "", limit = 5): Recommendation[] {
  const linked = new Set(claim.evidenceLinks.map((l) => l.evidenceId));
  const claimTokens = tokens(claim.text);
  const contextTokens = [...tokens(context)].filter((t) => !claimTokens.has(t));
  const out: Recommendation[] = [];
  for (const e of items) {
    if (linked.has(e.id) || e.canonicalId) continue; // 이미 연결했거나 대표가 따로 있는 중복본
    const reasons: string[] = [];
    let score = 0;
    const keyHit = claim.asserts.find((a) => e.fields.some((f) => f.key === a.key));
    if (keyHit) {
      score += 3;
      reasons.push(`값 항목 일치: ${keyHit.key}`);
    }
    const scopeHit = claim.scope.find((s) => covers(e.scope, s) || e.scope.some((x) => covers([s], x)));
    if (scopeHit) {
      score += 2;
      reasons.push(`범위 관련: ${scopeHit}`);
    }
    const haystack = `${e.title} ${e.fields.map((f) => `${f.key} ${f.unit ?? ""} ${typeof f.value === "string" ? f.value : ""}`).join(" ")}`;
    const words = [...tokens(haystack.replace(/\//g, " "))].filter((t) => claimTokens.has(t));
    if (words.length) {
      score += Math.min(words.length, 3);
      reasons.push(`낱말 일치: ${words.slice(0, 3).join(", ")}`);
    }
    const ctxWords = [...tokens(haystack.replace(/\//g, " "))].filter((t) => contextTokens.includes(t));
    if (ctxWords.length) {
      score += Math.min(ctxWords.length, 2);
      reasons.push(`보고서 제목 관련: ${ctxWords.slice(0, 2).join(", ")}`);
    }
    if (score >= 3) out.push({ evidence: e, score, field: keyHit?.key, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.evidence.id.localeCompare(b.evidence.id)).slice(0, limit);
}
