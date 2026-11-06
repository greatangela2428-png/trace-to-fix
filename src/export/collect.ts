// 화면 상태 + 시드 → 보고서 입력(ReportInput)
import { AS_OF, seed } from "../seed";
import { procedureById, rTraces, zombieFindings } from "../data";
import { useApp } from "../store";
import { deriveWorkspace } from "../workspace/useWorkspace";
import type { ReasonCode } from "../domain/schemas";
import type { ReportInput } from "./report";

export async function collectReportInput(): Promise<ReportInput> {
  const st = useApp.getState();
  const confirmedReasons: Record<string, ReasonCode> = {};
  for (const [caseId, r] of Object.entries(st.aiReasons)) {
    if (r.status === "done" && r.confirmed) confirmedReasons[caseId] = r.confirmed.code;
  }
  return {
    asOf: AS_OF,
    cases: seed.reportRework,
    traces: rTraces,
    confirmedReasons,
    candidates: deriveWorkspace(st.ws).reportCandidates,
    approvedKeys: st.ws.approvedRequired,
    report: st.logic.report,
    zombies: zombieFindings,
    procedures: procedureById,
    zombieDecisions: st.zombieDecisions,
  };
}
