// 화면 상태 + 시드 → 보고서 입력(ReportInput). 수출 사전 점검은 큰 파일이라 필요할 때만 불러온다.
import { AS_OF, seed } from "../seed";
import { procedureById, traces, zombieFindings } from "../data";
import { findRegulations } from "../domain/kotra";
import { countryName, loadRegulations } from "../data/kotra";
import { seedBookings } from "../modules/precheck/PrecheckTab";
import { useApp } from "../store";
import type { ReasonCode } from "../domain/schemas";
import type { ReportInput } from "./report";

export async function collectReportInput(withPrecheck: boolean): Promise<ReportInput> {
  const st = useApp.getState();
  const confirmedReasons: Record<string, ReasonCode> = {};
  for (const [caseId, r] of Object.entries(st.aiReasons)) {
    if (r.status === "done" && r.confirmed) confirmedReasons[caseId] = r.confirmed.code;
  }

  let precheck: ReportInput["precheck"];
  if (withPrecheck) {
    const file = await loadRegulations();
    const q = st.precheckQuery;
    const hsDigits = q.hs.replace(/\D/g, "");
    precheck = {
      source: file.source,
      countryName,
      bookings: seedBookings.map((b) => ({ ...b, hits: findRegulations(file.rows, { hs: b.hs, country: b.country }) })),
      query:
        hsDigits.length >= 4
          ? { hs: q.hs, country: q.country, hits: findRegulations(file.rows, { hs: q.hs, country: q.country || undefined }) }
          : undefined,
    };
  }

  return {
    asOf: AS_OF,
    cases: seed.cases,
    traces,
    confirmedReasons,
    suggestions: Object.values(st.suggestions),
    report: st.logic.report,
    zombies: zombieFindings,
    procedures: procedureById,
    zombieDecisions: st.zombieDecisions,
    precheck,
  };
}
