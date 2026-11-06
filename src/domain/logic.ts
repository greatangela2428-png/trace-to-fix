// 모듈 2: 논리 역추적의 규칙 기반 점검(사양 5-3). LLM이 아니라 코드로 판정한다.
// 결과는 '판정'이 아니라 '점검 항목'이다. 화면에서는 "점검 항목 N개 발견"으로 표기한다.
import type { Report } from "./schemas.js";
import { josa } from "./labels.js";

/** 따옴표로 감싸고 마지막 글자 받침에 맞는 조사를 붙인다("B 선사" → 'B 선사'와). */
const q = (word: string, pair: Parameters<typeof josa>[1]) => {
  const w = word.trim().replace(/[.。]$/, "");
  return `'${w}'${josa(w, pair).slice(w.length)}`;
};

export const CHECK_KINDS = ["EXPIRED", "NO_SOURCE", "UNGROUNDED", "MISSING_COMPARE", "FIGURE_CONFLICT"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const CHECK_LABEL: Record<CheckKind, string> = {
  EXPIRED: "근거 유효기간 만료",
  NO_SOURCE: "출처 불명확",
  UNGROUNDED: "가정 근거 없음",
  MISSING_COMPARE: "비교 대상 누락",
  FIGURE_CONFLICT: "수치 충돌",
};

/** 점검 항목이 가리키는 보고서 안의 위치(약한 고리 하이라이트용). */
export type NodeRef =
  | { claimId: string; node: "claim" }
  | { claimId: string; node: "evidence"; index: number }
  | { claimId: string; node: "assumption"; index: number };

export interface CheckFinding {
  kind: CheckKind;
  claimId: string; // 대표 주장(정렬·묶음 기준)
  refs: NodeRef[];
  message: string;
}

export const refKey = (r: NodeRef) => (r.node === "claim" ? `${r.claimId}` : `${r.claimId}:${r.node}:${r.index}`);

/** 공백 차이를 무시하고 포함 여부를 본다("현 선사"와 "현선사"를 같게 본다). */
const squash = (s: string) => s.replace(/\s+/g, "");

const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

export function checkReport(report: Report, opts: { asOf: string }): CheckFinding[] {
  const out: CheckFinding[] = [];

  for (const c of report.claims) {
    // 근거에 하나도 연결되지 않은 주장도 출처 불명확(사양 5-2: 연결 실패 시 "출처 불명확")
    if (c.evidence.length === 0) {
      out.push({ kind: "NO_SOURCE", claimId: c.id, refs: [{ claimId: c.id, node: "claim" }], message: "이 주장을 뒷받침하는 근거 자료가 보고서에 없습니다." });
    }
    c.evidence.forEach((e, index) => {
      const ref: NodeRef = { claimId: c.id, node: "evidence", index };
      if (!e.source?.trim()) {
        out.push({ kind: "NO_SOURCE", claimId: c.id, refs: [ref], message: `'${e.name}'의 원본 파일·메일·시스템 기록을 찾을 수 없습니다.` });
      }
      // 날짜 문자열(YYYY-MM-DD)은 사전순 비교가 곧 날짜 비교다
      if (e.validUntil && e.validUntil < opts.asOf) {
        out.push({ kind: "EXPIRED", claimId: c.id, refs: [ref], message: `'${e.name}'의 유효기간이 ${e.validUntil}에 끝났습니다.` });
      }
    });

    c.assumptions.forEach((a, index) => {
      if (!a.grounded) {
        out.push({
          kind: "UNGROUNDED",
          claimId: c.id,
          refs: [{ claimId: c.id, node: "assumption", index }],
          message: `${q(a.text, "을/를")} 뒷받침하는 근거가 보고서에 없습니다.`,
        });
      }
    });

    const said = squash(c.text);
    const missing = c.compareTargets.filter((t) => !said.includes(squash(t)));
    if (missing.length) {
      out.push({
        kind: "MISSING_COMPARE",
        claimId: c.id,
        refs: [{ claimId: c.id, node: "claim" }],
        message: `비교해야 할 대상 중 ${[...missing.slice(0, -1).map((m) => `'${m}'`), q(missing.at(-1)!, "과/와")].join(", ")}의 비교가 없습니다.`,
      });
    }
  }

  // 수치 충돌: 서로 다른 근거가 같은 항목에 다른 값을 내면 보고서 전체에서 하나로 묶는다
  const byKey = new Map<string, { ref: NodeRef; value: number; name: string }[]>();
  for (const c of report.claims) {
    c.evidence.forEach((e, index) => {
      for (const [key, value] of Object.entries(e.figures ?? {})) {
        const list = byKey.get(key) ?? [];
        list.push({ ref: { claimId: c.id, node: "evidence", index }, value, name: e.name });
        byKey.set(key, list);
      }
    });
  }
  for (const [key, list] of byKey) {
    if (new Set(list.map((x) => x.value)).size < 2) continue;
    out.push({
      kind: "FIGURE_CONFLICT",
      claimId: list[0]!.ref.claimId,
      refs: list.map((x) => x.ref),
      message: `${key}: ${list.map((x) => `${fmt(x.value)}('${x.name}')`).join(" vs ")}`,
    });
  }

  // 보고서의 주장 순서 → 점검 종류 순서로 정렬
  const claimOrder = new Map(report.claims.map((c, i) => [c.id, i]));
  return out.sort(
    (a, b) =>
      (claimOrder.get(a.claimId) ?? 0) - (claimOrder.get(b.claimId) ?? 0) ||
      CHECK_KINDS.indexOf(a.kind) - CHECK_KINDS.indexOf(b.kind),
  );
}

/** 노드별로 걸린 점검 종류를 모은다. 화면에서 약한 고리만 하이라이트할 때 쓴다. */
export function weakLinks(findings: CheckFinding[]): Map<string, CheckKind[]> {
  const map = new Map<string, CheckKind[]>();
  for (const f of findings) {
    for (const r of f.refs) {
      const k = refKey(r);
      const list = map.get(k) ?? [];
      if (!list.includes(f.kind)) list.push(f.kind);
      map.set(k, list);
    }
  }
  return map;
}

/** 비교 대상별로 보고서에서 실제 비교했는지 표시용. */
export function compareStatus(claimText: string, targets: string[]) {
  const said = squash(claimText);
  return targets.map((t) => ({ target: t, compared: said.includes(squash(t)) }));
}
