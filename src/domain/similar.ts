// ③ 동일 내용·다른 제목 문서 역추적(사양 6장). 4단계 파이프라인, 모두 순수 함수.
// 1) 후보 찾기(임베딩 코사인 유사도) → 2) 검증(핵심 항목 일치) → 3) 이력 역추적(분기 지점·값 불일치) → 4) 원인 분류·개선 제안
// 원칙: 유사하지만 핵심 값이 다르면 병합하지 않는다. 이력이 없으면 '유사함'까지만 말하고 원인은 '추정 불가'.
import type { Doc } from "./schemas";

export const CORE_KEYS = ["기준자료", "거래처", "항로"] as const;

/** 업계 용어집: 같은 개념의 여러 표기. 문서마다 다른 표기를 쓰면 '용어 차이'로 본다 */
export const GLOSSARY: Record<string, string[]> = {
  BAF: ["BAF", "Bunker Adjustment Factor", "유류할증료"],
  THC: ["THC", "Terminal Handling Charge", "터미널 조작료"],
  해상운임: ["해상운임", "Ocean Freight"],
};

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ── 1단계: 후보 찾기 ───────────────────────────────────
export interface Candidate {
  key: string; // "D1|D2"
  a: Doc;
  b: Doc;
  similarity: number;
}

/**
 * 임계값 이상 쌍을 후보로 고른다. 열람 권한이 있는 부서의 문서만 비교한다(권한 밖 문서는 제외).
 * allowedDepts가 비어 있으면 전체 부서.
 */
export function findCandidates(docs: Doc[], threshold: number, allowedDepts: string[] = []): { candidates: Candidate[]; excluded: Doc[] } {
  const visible = allowedDepts.length ? docs.filter((d) => allowedDepts.includes(d.dept)) : docs;
  const excluded = docs.filter((d) => !visible.includes(d));
  const out: Candidate[] = [];
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i]!;
      const b = visible[j]!;
      if (!a.embedding || !b.embedding) continue;
      const similarity = cosine(a.embedding, b.embedding);
      if (similarity >= threshold) out.push({ key: `${a.id}|${b.id}`, a, b, similarity });
    }
  return { candidates: out.sort((x, y) => y.similarity - x.similarity), excluded };
}

// ── 2단계: 검증 ────────────────────────────────────────
export interface Mismatch {
  key: string;
  a: string | undefined;
  b: string | undefined;
}
export interface Verification {
  sameContent: boolean; // 핵심 항목이 모두 같으면 같은 내용
  coreMismatches: Mismatch[]; // 다르면 별개 문서(병합 안 함)
  valueMismatches: Mismatch[]; // 같은 내용인데 값이 다른 항목(예: BAF 215 vs 198)
}

export function verify(a: Doc, b: Doc): Verification {
  const coreMismatches = CORE_KEYS.filter((k) => a.keyValues[k] !== b.keyValues[k]).map((k) => ({ key: k, a: a.keyValues[k], b: b.keyValues[k] }));
  const keys = [...new Set([...Object.keys(a.keyValues), ...Object.keys(b.keyValues)])].filter((k) => !(CORE_KEYS as readonly string[]).includes(k));
  const valueMismatches = keys.filter((k) => a.keyValues[k] !== b.keyValues[k]).map((k) => ({ key: k, a: a.keyValues[k], b: b.keyValues[k] }));
  return { sameContent: coreMismatches.length === 0, coreMismatches, valueMismatches };
}

// ── 3단계: 이력 역추적 ─────────────────────────────────
export interface TimelineEvent {
  at: string;
  docId: string;
  event: string;
  isBranch: boolean; // 다른 문서에서 복사된 지점
}
export interface HistoryTrace {
  timeline: TimelineEvent[];
  branch?: { at: string; from: string; to: string; event: string };
  missingHistory: string[]; // 이력이 없는 문서 id
}

export function traceHistory(a: Doc, b: Doc): HistoryTrace {
  const timeline: TimelineEvent[] = [a, b]
    .flatMap((d) => d.history.map((h) => ({ at: h.at, docId: d.id, event: h.event, isBranch: !!h.fromDocId && (h.fromDocId === a.id || h.fromDocId === b.id) })))
    .sort((x, y) => x.at.localeCompare(y.at));
  const copy = [a, b].flatMap((d) => d.history.filter((h) => h.fromDocId && (h.fromDocId === a.id || h.fromDocId === b.id)).map((h) => ({ to: d.id, h })))[0];
  return {
    timeline,
    branch: copy ? { at: copy.h.at, from: copy.h.fromDocId!, to: copy.to, event: copy.h.event } : undefined,
    missingHistory: [a, b].filter((d) => d.history.length === 0).map((d) => d.id),
  };
}

// ── 4단계: 원인 분류·개선 제안 ─────────────────────────
export type CauseCode = "COPY_DIVERGED" | "TERM_DIFF" | "NO_NAMING_RULE" | "UNKNOWN";
export const CAUSE_LABEL: Record<CauseCode, string> = {
  COPY_DIVERGED: "복사 후 분기",
  TERM_DIFF: "부서별 용어 차이",
  NO_NAMING_RULE: "제목 규칙 부재",
  UNKNOWN: "원인 추정 불가",
};
export type SuggestionCode = "CHECK_VALUE" | "SINGLE_SOURCE" | "NAMING_RULE" | "GLOSSARY";
export const SUGGESTION_LABEL: Record<SuggestionCode, string> = {
  CHECK_VALUE: "어느 값이 맞는지 먼저 확인",
  SINGLE_SOURCE: "원본 하나로 연결(참조만)",
  NAMING_RULE: "제목 규칙 통일",
  GLOSSARY: "용어집 등록",
};

/** 문서 본문이 각 개념을 어떤 표기로 쓰는가 */
export function termsUsed(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [concept, variants] of Object.entries(GLOSSARY)) {
    const hit = variants.filter((v) => text.includes(v));
    if (hit.length) out[concept] = hit;
  }
  return out;
}

export function termDifferences(a: Doc, b: Doc): { concept: string; a: string[]; b: string[] }[] {
  const ta = termsUsed(a.text);
  const tb = termsUsed(b.text);
  return Object.keys(GLOSSARY)
    .filter((c) => ta[c] && tb[c] && ta[c]!.join() !== tb[c]!.join())
    .map((c) => ({ concept: c, a: ta[c]!, b: tb[c]! }));
}

export interface PairAnalysis {
  candidate: Candidate;
  verification: Verification;
  history: HistoryTrace;
  causes: { code: CauseCode; detail: string }[];
  observations: { code: CauseCode; detail: string }[]; // 이력이 없을 때도 보이는 구조적 사실(원인 단정 아님)
  suggestions: { code: SuggestionCode; detail: string }[];
}

export function analyzePair(c: Candidate): PairAnalysis {
  const v = verify(c.a, c.b);
  const h = traceHistory(c.a, c.b);
  if (!v.sameContent) return { candidate: c, verification: v, history: h, causes: [], observations: [], suggestions: [] };

  const terms = termDifferences(c.a, c.b);
  const structural: { code: CauseCode; detail: string }[] = [];
  if (c.a.title !== c.b.title) structural.push({ code: "NO_NAMING_RULE", detail: `같은 내용인데 제목이 다릅니다: '${c.a.title}' / '${c.b.title}'` });
  if (terms.length)
    structural.push({ code: "TERM_DIFF", detail: terms.map((t) => `${t.concept}: '${t.a.join("·")}' vs '${t.b.join("·")}'`).join(", ") });

  const causes: { code: CauseCode; detail: string }[] = [];
  let observations: { code: CauseCode; detail: string }[] = [];
  if (h.branch) {
    causes.push({ code: "COPY_DIVERGED", detail: `${h.branch.at.slice(0, 10)} ${h.branch.event} 뒤 따로 수정되었습니다.` });
    causes.push(...structural);
  } else {
    // 이력이 없거나 복사 기록이 없으면 원인을 단정하지 않는다
    causes.push({
      code: "UNKNOWN",
      detail: h.missingHistory.length ? `이력이 없는 문서(${h.missingHistory.join(", ")})가 있어 '유사함'까지만 말할 수 있습니다.` : "복사 기록이 없어 두 문서의 관계를 추정할 수 없습니다.",
    });
    observations = structural;
  }

  const suggestions: { code: SuggestionCode; detail: string }[] = [];
  if (v.valueMismatches.length)
    suggestions.push({ code: "CHECK_VALUE", detail: v.valueMismatches.map((m) => `${m.key} ${m.a ?? "–"} vs ${m.b ?? "–"}`).join(", ") });
  suggestions.push({ code: "SINGLE_SOURCE", detail: "한쪽을 원본으로 두고 다른 문서는 원본을 참조만 하게 합니다(내용 복사 금지)." });
  if (c.a.title !== c.b.title) suggestions.push({ code: "NAMING_RULE", detail: "예: [항로]_[거래처]_[기준자료]_[버전] 형식으로 제목을 통일합니다." });
  if (terms.length) suggestions.push({ code: "GLOSSARY", detail: `${terms.map((t) => t.concept).join(", ")} 표기를 용어집에 등록해 한 가지로 씁니다.` });

  return { candidate: c, verification: v, history: h, causes, observations, suggestions };
}
