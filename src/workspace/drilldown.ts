// 상단 지표 → 상세 목록. 지표와 같은 기준으로 세므로 건수가 항상 일치한다.
import type { Finding } from "../rules/types";
import type { LinkStatus } from "../domain/workspace";
import type { Workspace } from "./useWorkspace";

export interface WeakRow {
  key: string;
  reportId: string;
  reportTitle: string;
  claimId: string;
  claimText: string;
  evidenceId?: string; // 없으면 '근거 없는 주장'
  status: LinkStatus;
  finding?: Finding;
}

/** 약한 근거 = 상태가 '최신'이 아닌 연결 + 근거 없는 주장 (홈 지표 '약한 근거'와 같은 기준) */
export function weakRows(ws: Workspace): WeakRow[] {
  const rows: WeakRow[] = [];
  for (const v of ws.reports) {
    for (const ec of v.evaluated) {
      for (const l of ec.links) {
        if (l.status === "fresh") continue;
        rows.push({
          key: `${v.report.id}:${ec.claim.id}:${l.evidenceId}:${l.field ?? ""}`,
          reportId: v.report.id,
          reportTitle: v.report.title,
          claimId: ec.claim.id,
          claimText: ec.claim.text,
          evidenceId: l.evidenceId,
          status: l.status,
          finding: l.findings[0],
        });
      }
      const missing = ec.claimFindings.find((f) => f.status === "missing");
      if (missing)
        rows.push({
          key: `${v.report.id}:${ec.claim.id}::missing`,
          reportId: v.report.id,
          reportTitle: v.report.title,
          claimId: ec.claim.id,
          claimText: ec.claim.text,
          status: "missing",
          finding: missing,
        });
    }
  }
  return rows;
}

/** 이번 주(월~일) 마감 보고서 — 홈 지표 '이번 주 마감 보고서'와 같은 기준 */
export function dueThisWeek(ws: Workspace) {
  const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
  const { from, to } = ws.metrics.week;
  return ws.ranked.filter((v) => kst(v.report.deadline) >= from && kst(v.report.deadline) <= to);
}
