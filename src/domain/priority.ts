// 우선순위 엔진(코드): 지금 어떤 보고서를 먼저 쓸지.
// 점수 = 100 × 영향도^w1 × 마감 임박도^w2 × 준비 부족도^w3 × 독자 중요도^w4  (각 요소 0.1~1, 가중치 w는 초기 가정 1)
// ④ 업무 관성: 읽히지 않는 정기 보고서는 독자 중요도를 낮추고 이유를 남긴다. 재작업 원인 필드는 열람 0건이어도 보호한다.
import type { EvaluatedClaim } from "../rules";
import type { PriorityItem, SectionInput, WorkReport } from "./workspace";
import { LINK_STATUS_LABEL, REPORT_TYPE_LABEL, type LinkStatus } from "./workspace";

export interface Weights {
  impact: number;
  urgency: number;
  unreadiness: number;
  audience: number;
}
export const DEFAULT_WEIGHTS: Weights = { impact: 1, urgency: 1, unreadiness: 1, audience: 1 };

/** 정기 보고서의 최근 12개월 실행·열람(④ 시드의 절차 기록) */
export interface ReadStat {
  procedureId: string;
  name: string;
  executed: number;
  outcomes: number; // 보고서면 열람 건수
}

export interface Readiness {
  claims: number;
  claimsLinked: number; // 근거가 1건 이상 연결된 주장
  links: number;
  freshLinks: number; // 자동 통과
  weakLinks: number; // 상태가 '최신'이 아닌 링크
  missingClaims: number; // 연결 없음
  statusCounts: Partial<Record<LinkStatus, number>>;
  sections: number;
  emptySections: number;
  draftSections: number;
}

export interface PriorityDetail extends PriorityItem {
  readiness: Readiness;
  read?: ReadStat & { factor: number };
  daysLeft: number;
}

const clamp = (x: number, lo = 0.1, hi = 1) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;
/** 1억 이상은 억, 그 아래는 만 원 단위로 읽기 쉽게 */
export const krwShort = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억 원` : `${Math.round(n / 1e4).toLocaleString("ko-KR")}만 원`);

export const TYPE_IMPACT: Record<WorkReport["type"], number> = { contract_decision: 0.6, claim: 0.5, management: 0.35, regular_status: 0.25 };
export const AUDIENCE_WEIGHT: Record<string, number> = { 임원: 1, 고객: 0.9, 팀장: 0.6 };
export const URGENCY_HORIZON_DAYS = 14;

export function readinessOf(sections: SectionInput[], evaluated: EvaluatedClaim[]): Readiness {
  const links = evaluated.flatMap((c) => c.links);
  const statusCounts: Partial<Record<LinkStatus, number>> = {};
  for (const l of links) if (l.status !== "fresh") statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;
  const missingClaims = evaluated.filter((c) => c.claimFindings.some((f) => f.status === "missing")).length;
  if (missingClaims) statusCounts.missing = (statusCounts.missing ?? 0) + missingClaims;
  return {
    claims: evaluated.length,
    claimsLinked: evaluated.filter((c) => c.links.length > 0).length,
    links: links.length,
    freshLinks: links.filter((l) => l.status === "fresh").length,
    weakLinks: links.filter((l) => l.status !== "fresh").length,
    missingClaims,
    statusCounts,
    sections: sections.length,
    emptySections: sections.filter((s) => s.status === "empty").length,
    draftSections: sections.filter((s) => s.status === "draft").length,
  };
}

/** 마감까지 남은 일수(소수). 음수면 지남 */
export const daysLeft = (deadline: string, nowIso: string) => (Date.parse(deadline) - Date.parse(nowIso)) / 86_400_000;

export function computePriority(
  report: WorkReport,
  evaluated: EvaluatedClaim[],
  ctx: { nowIso: string; weights?: Weights; readStats?: Map<string, ReadStat> },
): PriorityDetail {
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const r = readinessOf(report.sections, evaluated);
  const reasons: { line: string; weight: number }[] = [];

  // 영향도: 걸린 금액이 있으면 로그 척도(10억 원 = 1), 없으면 유형 기본값
  const krw = report.decisionImpactKrw;
  const impact = krw && krw > 0 ? clamp(0.2 + (0.8 * Math.log10(krw)) / 9) : TYPE_IMPACT[report.type];
  reasons.push({
    line: krw ? `걸린 금액 ${krwShort(krw)}(${report.impactBasis?.label ?? "계산식"})` : `걸린 금액 없음 · ${REPORT_TYPE_LABEL[report.type]} 기본값`,
    weight: impact,
  });

  // 마감 임박도: 14일 남으면 0.1, 마감 당일·지남 1
  const d = daysLeft(report.deadline, ctx.nowIso);
  const urgency = clamp(1 - d / URGENCY_HORIZON_DAYS);
  reasons.push({ line: d < 0 ? "마감이 지났습니다" : d < 1 ? `마감까지 ${Math.max(1, Math.round(d * 24))}시간` : `마감 ${Math.floor(d)}일 남음`, weight: urgency });

  // 준비 부족도: 약한 근거·연결 없는 주장 비율 + 미작성·작성 중 섹션 비율
  const weakShare = (r.weakLinks + r.missingClaims) / Math.max(1, r.links + r.missingClaims);
  const sectionShare = (r.emptySections + 0.5 * r.draftSections) / Math.max(1, r.sections);
  const unreadiness = clamp(0.1 + 0.6 * weakShare + 0.3 * sectionShare);
  const weakDetail = (Object.entries(r.statusCounts) as [LinkStatus, number][]).map(([s, n]) => `${LINK_STATUS_LABEL[s]} ${n}`).join(", ");
  if (r.weakLinks + r.missingClaims > 0) reasons.push({ line: `근거 ${r.weakLinks + r.missingClaims}건 확인 필요(${weakDetail})`, weight: unreadiness });
  if (r.emptySections) reasons.push({ line: `미작성 섹션 ${r.emptySections}개`, weight: unreadiness * 0.9 });
  if (!r.weakLinks && !r.missingClaims && !r.emptySections) reasons.push({ line: "근거·섹션 준비 완료", weight: 0.05 });

  // 독자 중요도 × 열람 보정(④): 읽히지 않으면 낮춘다(시스템 로그 기준)
  let audience = AUDIENCE_WEIGHT[report.audience] ?? 0.5;
  reasons.push({ line: `독자: ${report.audience}`, weight: audience * 0.8 });
  const rs = report.procedureId ? ctx.readStats?.get(report.procedureId) : undefined;
  let read: PriorityDetail["read"];
  if (rs && rs.executed > 0) {
    const rate = rs.outcomes / rs.executed;
    const factor = 0.5 + 0.5 * rate;
    audience = clamp(audience * factor);
    read = { ...rs, factor };
    if (rate < 0.5)
      reasons.push({
        line: `순위를 낮춘 이유: 최근 12개월 ${rs.executed}회 작성, 열람 ${rs.outcomes}회(시스템 로그 기준, 인쇄·구두 공유 미포함)`,
        weight: 0.95,
      });
  }

  const breakdown = { impact: round2(impact), urgency: round2(urgency), unreadiness: round2(unreadiness), audience: round2(audience) };
  const score =
    Math.round(
      100 *
        breakdown.impact ** w.impact *
        breakdown.urgency ** w.urgency *
        breakdown.unreadiness ** w.unreadiness *
        breakdown.audience ** w.audience *
        10,
    ) / 10;

  return {
    reportId: report.id,
    score,
    breakdown,
    reasonLines: reasons.sort((a, b) => b.weight - a.weight).map((x) => x.line),
    readiness: r,
    read,
    daysLeft: d,
  };
}

export const rankReports = (items: PriorityDetail[]) => [...items].sort((a, b) => b.score - a.score || a.daysLeft - b.daysLeft);

// ── 상단 지표 ──────────────────────────────────────────
/** 기준 시각이 속한 주(월~일)의 시작·끝(YYYY-MM-DD, 한국 시간) */
export function weekRange(nowIso: string): { from: string; to: string } {
  const d = new Date(Date.parse(nowIso) + 9 * 3_600_000); // KST 날짜로
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  const mon = new Date(d.getTime() - dow * 86_400_000);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

export interface HomeMetrics {
  dueThisWeek: number;
  week: { from: string; to: string };
  readinessPct: number; // 자동 통과 근거 ÷ (전체 링크 + 연결 없는 주장)
  weak: number;
  autoPass: number;
  totalSlots: number;
}

export function homeMetrics(reports: { report: WorkReport; readiness: Readiness }[], nowIso: string): HomeMetrics {
  const week = weekRange(nowIso);
  const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
  const dueThisWeek = reports.filter((x) => kst(x.report.deadline) >= week.from && kst(x.report.deadline) <= week.to).length;
  const autoPass = reports.reduce((s, x) => s + x.readiness.freshLinks, 0);
  const weak = reports.reduce((s, x) => s + x.readiness.weakLinks + x.readiness.missingClaims, 0);
  const totalSlots = reports.reduce((s, x) => s + x.readiness.links + x.readiness.missingClaims, 0);
  return { dueThisWeek, week, readinessPct: totalSlots ? Math.round((autoPass / totalSlots) * 100) : 100, weak, autoPass, totalSlots };
}

// ── ④ 교차 보호 ────────────────────────────────────────
export interface UnreadItem {
  procedureId: string;
  name: string;
  kind: "REPORT" | "INPUT_FIELD" | "APPROVAL";
  executed: number;
  outcomes: number;
  protectedBy?: { field: string; reworkCases: number }; // 재작업 원인 필드라 보호
  question: string; // 사람에게 묻는 문장(결정은 사람이)
}

/**
 * 결과가 쓰이지 않는 항목(열람·참조 0건). 재작업 원인 필드로 확인된 항목은 '보호'로 표시하고 빼지 말라고 알린다.
 * 보호 판단은 재작업 역추적 결과(필드별 사건 수)로 코드가 한다.
 */
export function unreadItems(
  procs: { id: string; name: string; kind: UnreadItem["kind"]; fieldKey?: string; legalBasis?: string; executed: number; outcomes: number }[],
  reworkFieldCounts: Record<string, number>,
  fieldLabel: (f: string) => string,
): UnreadItem[] {
  return procs
    .filter((p) => !p.legalBasis && p.executed >= 12 && p.outcomes === 0 && p.kind !== "APPROVAL")
    .map((p) => {
      const n = p.fieldKey ? reworkFieldCounts[p.fieldKey] ?? 0 : 0;
      if (n > 0)
        return {
          procedureId: p.id,
          name: p.name,
          kind: p.kind,
          executed: p.executed,
          outcomes: p.outcomes,
          protectedBy: { field: fieldLabel(p.fieldKey!), reworkCases: n },
          question: `열람·참조 0건이지만 ${fieldLabel(p.fieldKey!)}은(는) 재작업 원인 필드(${n}건)입니다. 빼면 반려가 늘 수 있어 유지를 권합니다.`,
        };
      return {
        procedureId: p.id,
        name: p.name,
        kind: p.kind,
        executed: p.executed,
        outcomes: p.outcomes,
        question: p.kind === "REPORT" ? "12개월 동안 열람 0건입니다. 템플릿에서 뺄지(또는 시범 중단할지) 확인해 주세요." : "12개월 동안 후속 단계에서 쓰이지 않았습니다. 입력 양식에서 뺄지 확인해 주세요.",
      };
    })
    .sort((a, b) => Number(!!a.protectedBy) - Number(!!b.protectedBy));
}
