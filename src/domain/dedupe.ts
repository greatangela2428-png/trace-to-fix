// ③ 근거 보관함 중복 방지: 같은 내용은 한 번만 저장하고 모든 보고서가 하나의 출처를 참조한다.
// 판정 기준(코드): 같은 유형 + 핵심 항목(기준자료·거래처·적용 구간) 일치 → 값까지 모두 같으면 '중복', 값이 다르면 '분기'.
// 핵심 항목이 다르면(예: 다른 선사 견적) 병합하지 않는다(오탐 방지).
import type { EvidenceInput, WorkReportInput } from "./workspace";

const KEY_FIELDS = ["기준자료", "거래처"];
const keyOf = (e: EvidenceInput) =>
  [e.type, ...KEY_FIELDS.map((k) => String(e.fields.find((f) => f.key === k)?.value ?? "")), [...e.scope].sort().join("|")].join("§");
const hasKey = (e: EvidenceInput) => KEY_FIELDS.some((k) => e.fields.some((f) => f.key === k && f.value !== ""));

export interface DupGroup {
  kind: "duplicate" | "diverged";
  canonicalId: string; // 대표로 남길 근거(가장 먼저 저장된 것)
  memberIds: string[]; // 대표를 뺀 나머지
  differences: { key: string; values: { id: string; value: string | number | undefined }[] }[];
  branchNote?: string; // 이력으로 찾은 분기 지점
}

function diffs(group: EvidenceInput[]) {
  const keys = [...new Set(group.flatMap((e) => e.fields.map((f) => f.key)))];
  return keys
    .map((key) => ({ key, values: group.map((e) => ({ id: e.id, value: e.fields.find((f) => f.key === key)?.value })) }))
    .filter((d) => new Set(d.values.map((v) => String(v.value))).size > 1);
}

/** 병합되지 않은(canonicalId가 없는) 근거들 중 중복·분기 묶음 */
export function findDuplicates(items: EvidenceInput[]): DupGroup[] {
  const open = items.filter((e) => !e.canonicalId && hasKey(e));
  const byKey = new Map<string, EvidenceInput[]>();
  for (const e of open) byKey.set(keyOf(e), [...(byKey.get(keyOf(e)) ?? []), e]);

  const groups: DupGroup[] = [];
  for (const g of byKey.values()) {
    if (g.length < 2) continue;
    const sorted = [...g].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
    // 값이 완전히 같은 것끼리 먼저 묶는다
    const sig = (e: EvidenceInput) => e.fields.map((f) => `${f.key}=${f.value}`).sort().join(";");
    const bySig = new Map<string, EvidenceInput[]>();
    for (const e of sorted) bySig.set(sig(e), [...(bySig.get(sig(e)) ?? []), e]);
    for (const same of bySig.values()) {
      if (same.length > 1) groups.push({ kind: "duplicate", canonicalId: same[0]!.id, memberIds: same.slice(1).map((e) => e.id), differences: [] });
    }
    // 값이 다른 것: 이력에 복사 기록이 있으면 분기로 표시(병합 제안이 아니라 '어느 값이 맞는지 확인')
    for (const e of sorted) {
      const from = e.history?.find((h) => h.fromId)?.fromId;
      const origin = from ? sorted.find((x) => x.id === from) : undefined;
      if (origin && sig(origin) !== sig(e)) {
        const copied = e.history?.find((h) => h.fromId);
        groups.push({
          kind: "diverged",
          canonicalId: origin.id,
          memberIds: [e.id],
          differences: diffs([origin, e]),
          branchNote: copied ? `${copied.at.slice(0, 10)} '${origin.title}'에서 복사된 뒤 값이 달라졌습니다.` : undefined,
        });
      }
    }
  }
  return groups;
}

/** 병합 승인: 구성원에 canonicalId를 채운다. 보고서 링크는 resolveCanonical로 대표를 가리킨다 */
export const mergeGroup = (items: EvidenceInput[], g: DupGroup): EvidenceInput[] =>
  items.map((e) => (g.memberIds.includes(e.id) ? { ...e, canonicalId: g.canonicalId } : e));

export const resolveCanonical = (id: string, byId: Map<string, EvidenceInput>): string => {
  const seen = new Set<string>();
  let cur = id;
  while (byId.get(cur)?.canonicalId && !seen.has(cur)) {
    seen.add(cur);
    cur = byId.get(cur)!.canonicalId!;
  }
  return cur;
};

// ── 병합 적용(사람 승인 후) ─────────────────────────────

export interface MergeResult {
  evidence: EvidenceInput[];
  reports: WorkReportInput[];
  repointed: { reportId: string; claimId: string }[]; // 대표를 가리키도록 바뀐 링크
}

/**
 * 구성원(member)을 대표(canonical)로 병합한다.
 * - 값이 다른 항목은 사람이 고른 값(chosen)으로 대표를 고친다
 * - 구성원에는 canonicalId를 채우고, 모든 보고서의 링크를 대표로 바꾼다(같은 링크가 이미 있으면 하나로)
 */
export function applyMerge(
  evidence: EvidenceInput[],
  reports: WorkReportInput[],
  canonicalId: string,
  memberId: string,
  chosen: Record<string, string | number> = {},
): MergeResult {
  const nextEvidence = evidence.map((e) => {
    if (e.id === canonicalId) return { ...e, fields: e.fields.map((f) => (f.key in chosen ? { ...f, value: chosen[f.key]! } : f)) };
    if (e.id === memberId) return { ...e, canonicalId };
    return e;
  });
  const repointed: MergeResult["repointed"] = [];
  const nextReports = reports.map((r) => ({
    ...r,
    sections: r.sections.map((s) => ({
      ...s,
      claims: s.claims.map((c) => {
        if (!c.evidenceLinks.some((l) => l.evidenceId === memberId)) return c;
        repointed.push({ reportId: r.id, claimId: c.id });
        const links = c.evidenceLinks.map((l) => (l.evidenceId === memberId ? { ...l, evidenceId: canonicalId } : l));
        const seen = new Set<string>();
        return { ...c, evidenceLinks: links.filter((l) => (seen.has(`${l.evidenceId}|${l.field ?? ""}`) ? false : (seen.add(`${l.evidenceId}|${l.field ?? ""}`), true))) };
      }),
    })),
  }));
  return { evidence: nextEvidence, reports: nextReports, repointed };
}
