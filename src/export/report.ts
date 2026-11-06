// 보고서 내보내기: 앱 데이터 → 하나의 문서 모델(ReportDoc). 엑셀과 PDF가 같은 모델을 그린다.
// 순수 함수라 테스트할 수 있고, 두 형식의 내용이 어긋나지 않는다. 개인명은 어디에도 없다(원칙 2).
import { STAGE_LABEL, type Procedure, type ReasonCode, type Report, type ReworkCase, type Suggestion } from "../domain/schemas";
import { REASON_LABEL } from "../domain/ai";
import { fieldLabel } from "../domain/labels";
import { aggregatePatterns } from "../domain/patterns";
import type { CaseTrace } from "../domain/trace";
import { CHECK_LABEL, checkReport } from "../domain/logic";
import { KIND_LABEL, ZOMBIE_STATUS_LABEL, type ZombieFinding } from "../domain/zombie";
import { isActive, summarizeHits, type DataSource, type RegulationHit } from "../domain/kotra";

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

export const SECTION_IDS = ["rework", "patterns", "suggestions", "logic", "zombie", "precheck"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABEL: Record<SectionId, string> = {
  rework: "재작업·반려 사건 이력",
  patterns: "원인 패턴 집계",
  suggestions: "개선 제안·승인 이력",
  logic: "보고서 논리 점검",
  zombie: "업무 관성 절차",
  precheck: "수출 사전 점검(KOTRA)",
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
  cases: ReworkCase[];
  traces: CaseTrace[];
  confirmedReasons: Record<string, ReasonCode>; // 사람이 확정한 사유(AI 분류 확인 포함)
  suggestions: Suggestion[];
  report: Report;
  zombies: ZombieFinding[];
  procedures: Map<string, Procedure>;
  zombieDecisions: Record<string, { decision: "PAUSE_APPROVED" | "KEEP"; at: string }>;
  precheck?: {
    source: DataSource;
    bookings: { label: string; hs: string; country: string; hits: RegulationHit[] }[];
    query?: { hs: string; country: string; hits: RegulationHit[] };
    countryName: (iso2: string) => string;
  };
}

export interface ReportOptions {
  months: number;
  sections: SectionId[];
  generatedAt?: string; // 테스트에서 고정
}

const KIND = { MISSING: "누락", WRONG: "오입력" } as const;
const STATUS = { PROPOSED: "제안", APPROVED: "승인", REJECTED: "반려", RETIRED: "폐기" } as const;
const SUGGESTION_KIND: Record<Suggestion["kind"], string> = {
  REQUIRED_FIELD: "필수 항목화",
  PRE_CHECK: "사전 점검 질문",
  CHECKLIST: "체크리스트",
  CROSS_CHECK: "서류 간 자동 대조",
  NAMING_RULE: "제목 규칙",
  SINGLE_SOURCE: "원본 하나로 연결",
  PAUSE_PROCEDURE: "시범 중단",
};

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
    return c && inPeriod(c.detectedAt);
  });
  const periodLabel = `${from} ~ ${input.asOf}`;

  const builders: Record<SectionId, () => Section | null> = {
    rework: () => {
      const rows = traces
        .map((t) => {
          const c = caseById.get(t.caseId)!;
          const reason = input.confirmedReasons[c.id] ?? c.reasonCode;
          return {
            detectedAt: day(c.detectedAt),
            label: c.label,
            field: fieldLabel(t.field),
            kind: KIND[t.kind],
            origin: STAGE_LABEL[t.originStage],
            reason: reason ? REASON_LABEL[reason] : "미분류",
            cost: c.cost,
          };
        })
        .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
      const cost = rows.reduce((s, r) => s + r.cost, 0);
      return {
        id: "rework",
        title: SECTION_LABEL.rework,
        summary: [
          { label: "기간", value: periodLabel },
          { label: "건수", value: `${rows.length}건` },
          { label: "누적 수정비용", value: won(cost) },
        ],
        tables: [
          {
            columns: [
              { key: "detectedAt", label: "발견일", type: "date", width: 12 },
              { key: "label", label: "예약", width: 26 },
              { key: "field", label: "항목", width: 14 },
              { key: "kind", label: "유형", width: 8 },
              { key: "origin", label: "최초 원인 단계", width: 24 },
              { key: "reason", label: "반려 사유", width: 18 },
              { key: "cost", label: "수정비용", type: "krw", width: 14 },
            ],
            rows,
          },
        ],
        notes: ["최초 원인 단계는 필드 이력을 거꾸로 따라가 찾은 추정입니다(담당자 확인 필요)."],
      };
    },

    patterns: () => {
      const ps = aggregatePatterns(traces, input.cases);
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
              { key: "stage", label: "원인 단계", width: 24 },
              { key: "field", label: "항목", width: 14 },
              { key: "kind", label: "유형", width: 8 },
              { key: "count", label: "건수", type: "number", width: 8 },
              { key: "cost", label: "누적 비용", type: "krw", width: 14 },
            ],
            rows: ps.map((p) => ({
              stage: STAGE_LABEL[p.stage],
              field: fieldLabel(p.field),
              kind: KIND[p.kind],
              count: p.count,
              cost: p.totalCost,
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
        { label: "제안", value: `${input.suggestions.length}개` },
        { label: "승인", value: `${input.suggestions.filter((s) => s.status === "APPROVED").length}개` },
      ],
      tables: [
        {
          columns: [
            { key: "kind", label: "종류", width: 16 },
            { key: "description", label: "제안 내용", width: 60 },
            { key: "status", label: "상태", width: 8 },
            { key: "prevented", label: "예방 예상(건)", type: "number", width: 12 },
            { key: "appliedAt", label: "승인일", type: "date", width: 12 },
          ],
          rows: input.suggestions.map((s) => ({
            kind: SUGGESTION_KIND[s.kind],
            description: s.description,
            status: STATUS[s.status],
            prevented: s.expectedPrevented ?? null,
            appliedAt: s.appliedAt ? day(s.appliedAt) : null,
          })),
        },
      ],
      notes: ["예방 예상 건수는 가상 재실행을 돌린 제안에만 있습니다. 승인 없이 적용된 규칙은 없습니다."],
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
          decision: d ? (d.decision === "PAUSE_APPROVED" ? "시범 중단 승인" : "유지") : "결정 전",
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

    precheck: () => {
      const pc = input.precheck;
      if (!pc) return null;
      const hitRow = (h: RegulationHit) => ({
        country: pc.countryName(h.reg.country),
        product: h.reg.product,
        measure: h.reg.measure,
        status: h.reg.status,
        korea: h.reg.korea ? "Y" : "N",
        code: h.matchedCode,
        period: h.reg.period,
        duty: h.reg.duty,
      });
      const hitColumns: Column[] = [
        { key: "country", label: "시행국", width: 10 },
        { key: "product", label: "품목", width: 40 },
        { key: "measure", label: "규제 형태", width: 14 },
        { key: "status", label: "진행", width: 8 },
        { key: "korea", label: "한국 대상", width: 9 },
        { key: "code", label: "일치 HS", width: 12 },
        { key: "period", label: "기간", width: 24 },
        { key: "duty", label: "판정·세율", width: 50 },
      ];
      const tables: Table[] = [
        {
          title: "진행 중인 예약 점검",
          columns: [
            { key: "label", label: "예약", width: 26 },
            { key: "hs", label: "HS 코드", width: 10 },
            { key: "country", label: "목적국", width: 10 },
            { key: "active", label: "규제중", type: "number", width: 8 },
            { key: "korea", label: "한국 대상", type: "number", width: 9 },
          ],
          rows: pc.bookings.map((b) => {
            const s = summarizeHits(b.hits);
            return { label: b.label, hs: b.hs, country: pc.countryName(b.country), active: s.active, korea: s.activeKorea };
          }),
        },
      ];
      if (pc.query) {
        tables.push({
          title: `조회: HS ${pc.query.hs} · ${pc.query.country ? pc.countryName(pc.query.country) : "전체 국가"}`,
          columns: hitColumns,
          rows: pc.query.hits.map(hitRow),
        });
      }
      const active = pc.query?.hits.filter((h) => isActive(h.reg)).length ?? 0;
      return {
        id: "precheck",
        title: SECTION_LABEL.precheck,
        summary: [
          { label: "예약 점검", value: `${pc.bookings.length}건` },
          ...(pc.query ? [{ label: "조회 결과", value: `${pc.query.hits.length}건(규제중 ${active}건)` }] : []),
        ],
        tables,
        notes: [
          `출처: ${pc.source.name}(${pc.source.fileName}, 공공데이터포털) · ${pc.source.license} · ${pc.source.fetchedAt} 내려받음`,
          "목록에 없다고 규제가 없다는 뜻은 아닙니다. 인증·검역 등 비관세 요건은 따로 확인해 주세요.",
        ],
      };
    },
  };

  return {
    title: "업무 역추적 보고서",
    asOf: input.asOf,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    periodLabel,
    sections: SECTION_IDS.filter((id) => opts.sections.includes(id))
      .map((id) => builders[id]())
      .filter((s): s is Section => s !== null),
  };
}

export const reportFileName = (doc: ReportDoc, ext: string) => `업무역추적_보고서_${doc.generatedAt.slice(0, 10)}.${ext}`;
