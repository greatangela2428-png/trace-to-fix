// 보고서 작성 도구 시드: 근거 보관함 + 보고서. JSON을 스키마로 검증하고 파생값을 코드로 채운다.
import { z } from "zod";
import {
  EvidenceInputSchema,
  WorkReportInputSchema,
  computeImpactKrw,
  usageIndex,
  type EvidenceInput,
  type EvidenceItem,
  type WorkReport,
  type WorkReportInput,
} from "../domain/workspace";
import { costOf, traceReportCase } from "../domain/reportRework";
import { seed } from "./index";
import evidenceJson from "./evidence.json";
import reportsJson from "./reports.json";

/**
 * 보고서 반려 기록 자체도 근거다(반려 현황 보고서가 기댄다). 값은 반려 사건에서 계산한다(원칙 2).
 */
export function reworkLogEvidence(cases = seed.reportRework): EvidenceInput {
  const traces = cases.map(traceReportCase).filter((t) => t !== null);
  const dates = cases.map((c) => c.returnedAt).sort();
  return {
    id: "E-REWORK-LOG",
    type: "past_report",
    title: `보고서 반려 기록(${dates[0] ?? ""} ~ ${dates.at(-1) ?? ""})`,
    source: "재작업 역추적 반려 기록",
    capturedAt: dates.at(-1) ?? "2026-11-05",
    scope: [],
    fields: [
      { key: "반려 건수", value: cases.length, unit: "건" },
      { key: "재작업 비용 합계", value: cases.reduce((s, c) => s + costOf(c), 0), unit: "KRW" },
      { key: "근거 저장 단계 원인 건수", value: traces.filter((t) => t.origin === "SAVE").length, unit: "건" },
    ],
  };
}

const evidenceInputs: EvidenceInput[] = [...z.array(EvidenceInputSchema).parse(evidenceJson), reworkLogEvidence()];
const reportInputs: WorkReportInput[] = z.array(WorkReportInputSchema).parse(reportsJson);

/** 저장값 → 화면용(파생값 포함). 필수 필드 점검(requiredFieldsMissing)은 2단계 규칙이 채운다. */
export function hydrate(evidence: EvidenceInput[], reports: WorkReportInput[]) {
  const usage = usageIndex(reports);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const items: EvidenceItem[] = evidence.map((e) => ({ ...e, usedByReportIds: usage.get(e.id) ?? [], requiredFieldsMissing: [] }));
  const works: WorkReport[] = reports.map((r) => ({
    ...r,
    decisionImpactKrw: r.impactBasis ? computeImpactKrw(r.impactBasis, byId) : undefined,
  }));
  return { evidence: items, reports: works };
}

export const workspaceSeed = { evidenceInputs, reportInputs };
