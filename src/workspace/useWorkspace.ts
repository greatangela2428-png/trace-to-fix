// 보고서 작성 도구의 파생값을 한곳에서 계산한다. 근거·링크가 바뀌면 모든 화면이 같은 결과로 다시 그려진다.
import { useMemo } from "react";
import { useApp, type WorkspaceState } from "../store";
import { AS_OF, seed } from "../seed";
import { procedureById, rPatterns, traces, zombieFindings } from "../data";
import { requiredFromReports } from "../domain/reportRework";
import { fieldLabel } from "../domain/labels";
import { addDays } from "../rules/helpers";
import { computePriority, homeMetrics, rankReports, unreadItems, type PriorityDetail, type ReadStat } from "../domain/priority";
import { evaluateReport, checkItems, type CheckItem, type EvaluatedClaim, type EvaluatedLink } from "../rules";
import { requiredFields, BASELINE_SPECS } from "../rules/save/requiredFields";
import type { RequiredSpec } from "../rules/types";
import { approvedSpecs, bookingRequiredCandidates } from "../domain/requiredFields";
import { findDuplicates, type DupGroup } from "../domain/dedupe";
import { computeImpactKrw, usageIndex, type ClaimInput, type EvidenceInput, type EvidenceItem, type EvidenceLinkInput, type WorkReport, type WorkReportInput } from "../domain/workspace";

export interface ReportView {
  report: WorkReport;
  evaluated: EvaluatedClaim[];
  items: CheckItem[];
  priority: PriorityDetail;
}

/** ④ 열람 기록(12개월) — 절차 id별 */
const readStats = new Map<string, ReadStat>(
  zombieFindings.map((f) => [f.procedureId, { procedureId: f.procedureId, name: procedureById.get(f.procedureId)!.name, executed: f.executed, outcomes: f.outcomes }]),
);
const reworkFieldCounts = traces.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.field]: (acc[t.field] ?? 0) + 1 }), {});
const unread = unreadItems(
  zombieFindings.map((f) => {
    const p = procedureById.get(f.procedureId)!;
    return { id: p.id, name: p.name, kind: p.kind, fieldKey: p.fieldKey, legalBasis: p.legalBasis, executed: f.executed, outcomes: f.outcomes };
  }),
  reworkFieldCounts,
  fieldLabel,
);

export function deriveWorkspace(ws: WorkspaceState) {
  const asOf = addDays(AS_OF, ws.clockOffsetDays);
  const nowIso = `${asOf}T09:00:00+09:00`;
  const byId = new Map(ws.evidence.map((e) => [e.id, e]));
  // 승인된 필수 항목이 같은 유형·필드의 기본 권장을 대신한다(중복 경고 방지)
  const approved = approvedSpecs(ws.approvedRequired);
  const specs: RequiredSpec[] = [...approved, ...BASELINE_SPECS.filter((b) => !approved.some((a) => a.type === b.type && a.field === b.field))];
  const usage = usageIndex(ws.reports);
  const evidence: EvidenceItem[] = ws.evidence.map((e) => ({
    ...e,
    usedByReportIds: usage.get(e.id) ?? [],
    requiredFieldsMissing: requiredFields.check(e, specs),
  }));
  const reports: ReportView[] = ws.reports.map((r) => {
    const evaluated = evaluateReport(r, byId, asOf);
    const report: WorkReport = { ...r, decisionImpactKrw: r.impactBasis ? computeImpactKrw(r.impactBasis, byId) : undefined };
    return {
      report,
      evaluated,
      items: checkItems(r, evaluated),
      priority: computePriority(report, evaluated, { nowIso, weights: ws.weights, readStats }),
    };
  });
  const ranked = rankReports(reports.map((v) => v.priority)).map((p) => reports.find((v) => v.report.id === p.reportId)!);
  return {
    asOf,
    nowIso,
    ranked,
    metrics: homeMetrics(
      reports.map((v) => ({ report: v.report, readiness: v.priority.readiness })),
      nowIso,
    ),
    unread,
    byId,
    specs,
    evidence,
    reports,
    reportById: new Map(reports.map((v) => [v.report.id, v])),
    duplicates: findDuplicates(ws.evidence),
    candidates: bookingRequiredCandidates(traces, seed.cases),
    reportCandidates: requiredFromReports(rPatterns, evidence),
  };
}

export type Workspace = ReturnType<typeof deriveWorkspace>;

export function useWorkspace(): Workspace {
  const ws = useApp((s) => s.ws);
  return useMemo(() => deriveWorkspace(ws), [ws]);
}

/** 연결하기 전에 미리 보는 상태: 이 링크를 붙이면 어떤 점검 항목이 생기는가 */
export function previewLink(
  report: WorkReportInput,
  claim: ClaimInput,
  link: EvidenceLinkInput,
  byId: Map<string, EvidenceInput>,
  asOf: string = AS_OF,
): EvaluatedLink | undefined {
  const withLink: WorkReportInput = {
    ...report,
    sections: report.sections.map((s) => ({
      ...s,
      claims: s.claims.map((c) => (c.id === claim.id ? { ...c, evidenceLinks: [...c.evidenceLinks, link] } : c)),
    })),
  };
  return evaluateReport(withLink, byId, asOf)
    .find((c) => c.claim.id === claim.id)
    ?.links.find((l) => l.evidenceId === link.evidenceId);
}

/** 근거 하나가 속한 중복·분기 묶음 */
export const groupOf = (groups: DupGroup[], id: string) => groups.find((g) => g.canonicalId === id || g.memberIds.includes(id));
