// 보고서 내보내기: 앱 데이터 → 하나의 문서 모델(ReportDoc). 엑셀과 PDF가 같은 모델을 그린다.
// 순수 함수라 테스트할 수 있고, 두 형식의 내용이 어긋나지 않는다. 개인명은 어디에도 없다(원칙 2).
import type { Procedure, ReasonCode, Report } from "../domain/schemas";
import { REASON_LABEL } from "../domain/ai";
import { CHECK_LABEL, checkReport } from "../domain/logic";
import {
  HOURLY_COST_KRW,
  R_STAGE_LABEL,
  aggregateRPatterns,
  simulateRequired,
  type RTrace,
  type ReportReworkCase,
  type RequiredFromReports,
} from "../domain/reportRework";
import { KIND_LABEL, ZOMBIE_STATUS_LABEL, type ZombieFinding } from "../domain/zombie";

export type CellType = "text" | "number" | "krw" | "date";
export interface Column {
  key: string;
  label: string;
  type?: CellType;
  width?: number; // 엑셀 열 너비(글자 수)
}
export interface Table {
  title?: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
}
export interface Section {
  id: SectionId;
  title: string;
  summary: { label: string; value: string }[];
  tables: Table[];
  notes: string[];
}
export interface ReportDoc {
  title: string;
  asOf: string;
  generatedAt: string;
  periodLabel: string;
  sections: Section[];
}

export const SECTION_IDS = ["rework", "patterns", "suggestions", "logic", "zombie"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABEL: Record<SectionId, string> = {
  rework: "보고서 반려·재작업 이력",
  patterns: "반려 원인 패턴",
  suggestions: "저장 필수 항목 제안·승인",
  logic: "보고서 논리 점검",
  zombie: "업무 관성 절차",
};
/** 기간 필터가 적용되는 섹션 */
export const DATED_SECTIONS: SectionId[] = ["rework", "patterns", "zombie"];

export const PERIODS = [
  { months: 1, label: "최근 1개월" },
  { months: 3, label: "최근 3개월" },
  { months: 6, label: "최근 6개월" },
  { months: 12, label: "최근 12개월" },
] as const;

export interface ReportInput {
  asOf: string; // YYYY-MM-DD
  cases: ReportReworkCase[]; // 반려된 보고서
  traces: RTrace[];
  confirmedReasons: Record<string, ReasonCode>; // 사람이 확정한 사유(AI 분류 확인 포함)
  candidates: RequiredFromReports[]; // 저장 필수 항목 제안
  approvedKeys: string[];
  report: Report;
  zombies: ZombieFinding[];
  procedures: Map<string, Procedure>;
  zombieDecisions: Record<string, { decision: "PAUSE_APPROVED" | "KEEP" | "SAMPLE_AUDIT"; at: string }>;
}

export interface ReportOptions {
  months: number;
  sections: SectionId[];
  generatedAt?: string; // 테스트에서 고정
}

const KIND = { MISSING: "누락", WRONG: "틀린 값" } as const;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const day = (iso: string) => iso.slice(0, 10);

/** 기준일이 속한 달 직전까지 N개월의 시작일(YYYY-MM-DD). 1개월이면 기준일 한 달 전. */
export function periodStart(asOf: string, months: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function buildReport(input: ReportInput, opts: ReportOptions): ReportDoc {
  const from = periodStart(input.asOf, opts.months);
  const inPeriod = (iso: string) => day(iso) >= from && day(iso) <= input.asOf;
  const caseById = new Map(input.cases.map((c) => [c.id, c]));
  const traces = input.traces.filter((t) => {
    const c = caseById.get(t.caseId);
    return c && inPeriod(c.returnedAt);
  });
  const periodLabel = `${from} ~ ${input.asOf}`;

  const builders: Record<SectionId, () => Section | null> = {
    rework: () => {
      const rows = traces
        .map((t) => {
          const c = caseById.get(t.caseId)!;
          const reason = input.confirmedReasons[c.id] ?? c.recordedReason;
          return {
            returnedAt: c.returnedAt,
            report: c.report,
            reviewer: c.reviewer,
            item: t.item,
            kind: KIND[t.kind],
            origin: R_STAGE_LABEL[t.origin],
            reason: reason ? REASON_LABEL[reason] : "기록 없음",
            hours: c.hours,
            cost: t.cost,
          };
        })
        .sort((a, b) => a.returnedAt.localeCompare(b.returnedAt));
      const cost = rows.reduce((s, r) => s + r.cost, 0);
      return {
        id: "rework",
        title: SECTION_LABEL.rework,
        summary: [
          { label: "기간", value: periodLabel },
          { label: "반려", value: `${rows.length}건` },
          { label: "재작업 비용", value: won(cost) },
        ],
        tables: [
          {
            columns: [
              { key: "returnedAt", label: "반려일", type: "date", width: 12 },
              { key: "report", label: "보고서", width: 26 },
              { key: "reviewer", label: "반려", width: 8 },
              { key: "item", label: "재작업 항목", width: 16 },
              { key: "kind", label: "유형", width: 8 },
              { key: "origin", label: "최초 원인 단계", width: 14 },
              { key: "reason", label: "반려 사유", width: 18 },
              { key: "hours", label: "시간", type: "number", width: 8 },
              { key: "cost", label: "재작업 비용", type: "krw", width: 14 },
            ],
            rows,
          },
        ],
        notes: [
          "최초 원인 단계는 저장 → 끌어오기 → 작성 → 제출 이력을 거꾸로 따라가 찾은 추정입니다(담당자 확인 필요).",
          `재작업 비용 = 시간 × 시간당 ${HOURLY_COST_KRW.toLocaleString("ko-KR")}원(가정).`,
        ],
      };
    },

    patterns: () => {
      const ps = aggregateRPatterns(traces, input.cases);
      return {
        id: "patterns",
        title: SECTION_LABEL.patterns,
        summary: [
          { label: "기간", value: periodLabel },
          { label: "패턴 수", value: `${ps.length}개` },
        ],
        tables: [
          {
            columns: [
              { key: "stage", label: "최초 원인 단계", width: 14 },
              { key: "item", label: "항목", width: 16 },
              { key: "kind", label: "유형", width: 8 },
              { key: "count", label: "건수", type: "number", width: 8 },
              { key: "hours", label: "시간", type: "number", width: 8 },
              { key: "cost", label: "재작업 비용", type: "krw", width: 14 },
            ],
            rows: ps.map((p) => ({
              stage: R_STAGE_LABEL[p.origin],
              item: p.item,
              kind: KIND[p.kind],
              count: p.caseIds.length,
              hours: p.hours,
              cost: p.cost,
            })),
          },
        ],
        notes: [],
      };
    },

    suggestions: () => ({
      id: "suggestions",
      title: SECTION_LABEL.suggestions,
      summary: [
        { label: "제안", value: `${input.candidates.length}개` },
        { label: "승인", value: `${input.candidates.filter((c) => input.approvedKeys.includes(c.key)).length}개` },
      ],
      tables: [
        {
          columns: [
            { key: "proposal", label: "제안", width: 40 },
            { key: "prevented", label: "방지(건)", type: "number", width: 10 },
            { key: "total", label: "전체(건)", type: "number", width: 10 },
            { key: "saved", label: "절감", type: "krw", width: 14 },
            { key: "burden", label: "입력 부담", width: 24 },
            { key: "status", label: "상태", width: 10 },
          ],
          rows: input.candidates.map((c) => {
            const sim = simulateRequired(c, input.traces);
            return {
              proposal: `근거 저장 시 '${c.label}' 필수(운임표·견적 메일·계약)`,
              prevented: sim.prevented,
              total: sim.total,
              saved: sim.savedCost,
              burden: `저장마다 +${c.burden.extraFieldsPerSave}항목, 채울 근거 ${c.burden.backfill.length}건`,
              status: input.approvedKeys.includes(c.key) ? "승인" : "승인 전",
            };
          }),
        },
      ],
      notes: ["방지 건수는 가상 재실행(저장 단계에서 비어 있던 반려만 예방으로 계산)입니다. 승인 없이 양식에 반영된 규칙은 없습니다."],
    }),

    logic: () => {
      const r = input.report;
      const fs = checkReport(r, { asOf: input.asOf });
      const no = new Map(r.claims.map((c, i) => [c.id, i + 1]));
      return {
        id: "logic",
        title: SECTION_LABEL.logic,
        summary: [
          { label: "보고서", value: r.title },
          { label: "결론", value: r.conclusion },
          { label: "점검 결과", value: `점검 항목 ${fs.length}개 발견` },
        ],
        tables: [
          {
            columns: [
              { key: "kind", label: "점검 항목", width: 16 },
              { key: "claim", label: "주장", width: 8 },
              { key: "message", label: "내용", width: 70 },
            ],
            rows: fs.map((f) => ({
              kind: CHECK_LABEL[f.kind],
              claim: [...new Set(f.refs.map((x) => no.get(x.claimId)))].join("·"),
              message: f.message,
            })),
          },
          {
            title: "주장 목록",
            columns: [
              { key: "no", label: "번호", type: "number", width: 6 },
              { key: "text", label: "주장", width: 70 },
              { key: "evidence", label: "근거 수", type: "number", width: 8 },
            ],
            rows: r.claims.map((c, i) => ({ no: i + 1, text: c.text, evidence: c.evidence.length })),
          },
        ],
        notes: ["점검 결과는 판정이 아니라 담당자가 확인할 항목입니다.", `유효기간 판단 기준일: ${input.asOf}`],
      };
    },

    zombie: () => {
      // 기간에 맞춰 월별 기록을 다시 센다(데이터는 최근 12개월)
      const fromMonth = from.slice(0, 7);
      const rows = input.zombies.map((f) => {
        const p = input.procedures.get(f.procedureId)!;
        const months = f.monthly.filter((m) => m.month >= fromMonth);
        const d = input.zombieDecisions[f.procedureId];
        return {
          name: p.name,
          kind: KIND_LABEL[p.kind],
          dept: p.dept,
          status: ZOMBIE_STATUS_LABEL[f.status],
          executed: months.reduce((s, m) => s + m.executed, 0),
          outcome: months.reduce((s, m) => s + m.outcome, 0),
          lastOutcome: f.lastOutcomeMonth ?? "기록 없음",
          hours: Math.round(months.reduce((s, m) => s + m.executed, 0) * (p.minutesPerRun / 60)),
          decision: d ? { PAUSE_APPROVED: "시범 중단 승인", KEEP: "유지", SAMPLE_AUDIT: "표본 감사" }[d.decision] : "결정 전",
        };
      });
      const monthCols = [...new Set(input.zombies.flatMap((f) => f.monthly.map((m) => m.month)))].filter((m) => m >= fromMonth).sort();
      return {
        id: "zombie",
        title: SECTION_LABEL.zombie,
        summary: [
          { label: "기간", value: periodLabel },
          { label: "추적 절차", value: `${rows.length}개` },
          { label: "폐지 후보", value: `${input.zombies.filter((f) => f.status === "CANDIDATE").length}개` },
        ],
        tables: [
          {
            columns: [
              { key: "name", label: "절차", width: 30 },
              { key: "kind", label: "종류", width: 10 },
              { key: "dept", label: "부서", width: 12 },
              { key: "status", label: "판정", width: 14 },
              { key: "executed", label: "실행", type: "number", width: 8 },
              { key: "outcome", label: "결과 활용", type: "number", width: 10 },
              { key: "lastOutcome", label: "마지막 결과 활용", width: 14 },
              { key: "hours", label: "처리 시간(시간)", type: "number", width: 14 },
              { key: "decision", label: "사람 결정", width: 14 },
            ],
            rows,
          },
          {
            title: "월별 실행 건수",
            columns: [{ key: "name", label: "절차", width: 30 }, ...monthCols.map((m) => ({ key: m, label: m, type: "number" as const, width: 9 }))],
            rows: input.zombies.map((f) => ({
              name: input.procedures.get(f.procedureId)!.name,
              ...Object.fromEntries(f.monthly.filter((m) => m.month >= fromMonth).map((m) => [m.month, m.executed])),
            })),
          },
        ],
        notes: ["폐지 후보 판정은 12개월 기준이며, 폐지 대신 3개월 시범 중단 후 재평가를 제안합니다."],
      };
    },
  };

  return {
    title: "보고서 도우미 리포트",
    asOf: input.asOf,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    periodLabel,
    sections: SECTION_IDS.filter((id) => opts.sections.includes(id))
      .map((id) => builders[id]())
      .filter((s): s is Section => s !== null),
  };
}

export const reportFileName = (doc: ReportDoc, ext: string) => `보고서도우미_리포트_${doc.generatedAt.slice(0, 10)}.${ext}`;
