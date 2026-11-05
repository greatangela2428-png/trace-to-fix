// 모듈 4: 업무 관성 탐지. 결과가 쓰이지 않는 절차를 '폐지 후보'로 제안한다(판정·자동 폐지 아님).
import type { Procedure } from "./schemas";
import { josa } from "./labels";

export type ZombieStatus = "CANDIDATE" | "KEEP" | "HOLD" | "EXCLUDED";

export const ZOMBIE_STATUS_LABEL: Record<ZombieStatus, string> = {
  CANDIDATE: "폐지 후보",
  HOLD: "판단 보류",
  KEEP: "유지",
  EXCLUDED: "제외(법정 절차)",
};

export const EXECUTED_LABEL: Record<Procedure["kind"], string> = {
  APPROVAL: "승인 요청",
  REPORT: "작성",
  INPUT_FIELD: "입력",
};
export const OUTCOME_LABEL: Record<Procedure["kind"], string> = {
  APPROVAL: "반려·수정",
  REPORT: "열람",
  INPUT_FIELD: "후속 단계 참조",
};
export const KIND_LABEL: Record<Procedure["kind"], string> = {
  APPROVAL: "승인 단계",
  REPORT: "보고서",
  INPUT_FIELD: "입력 항목",
};

export interface ZombieOptions {
  asOf: string; // YYYY-MM-DD. 이 날짜가 속한 달 직전까지 windowMonths개월을 본다
  windowMonths?: number; // 기본 12
  minSample?: number; // 이보다 실행이 적으면 판단 보류. 기본 12
  reworkFieldCounts?: Record<string, number>; // 모듈 1: 필드별 재작업 원인 건수
}

export interface ZombieFinding {
  procedureId: string;
  status: ZombieStatus;
  reasons: string[];
  executed: number; // 기간 내
  outcomes: number; // 기간 내
  monthly: { month: string; executed: number; outcome: number }[]; // 기간 내, 빈 달 0으로 채움
  lastOutcomeMonth: string | null;
  monthsSinceLastOutcome: number | null;
  hoursPerYear: number; // 기간 내 처리 시간 합(시간)
  originUnknown: boolean;
}

const toIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

export function findZombies(procs: readonly Procedure[], opts: ZombieOptions): ZombieFinding[] {
  const windowMonths = opts.windowMonths ?? 12;
  const minSample = opts.minSample ?? 12;
  const asOfIdx = toIndex(opts.asOf.slice(0, 7));
  const from = asOfIdx - windowMonths; // 포함
  const months = Array.from({ length: windowMonths }, (_, k) => fromIndex(from + k));

  return procs.map((p) => {
    const byMonth = new Map(p.usage.map((u) => [u.month, u]));
    const monthly = months.map((m) => ({
      month: m,
      executed: byMonth.get(m)?.executed ?? 0,
      outcome: byMonth.get(m)?.outcome ?? 0,
    }));
    const executed = monthly.reduce((s, u) => s + u.executed, 0);
    const outcomes = monthly.reduce((s, u) => s + u.outcome, 0);

    const outcomeMonths = p.usage.filter((u) => u.outcome > 0 && toIndex(u.month) < asOfIdx).map((u) => toIndex(u.month));
    if (p.lastOutcomeBefore) outcomeMonths.push(toIndex(p.lastOutcomeBefore));
    const lastIdx = outcomeMonths.length ? Math.max(...outcomeMonths) : null;

    const reasons: string[] = [];
    const outcomeLabel = OUTCOME_LABEL[p.kind];
    const reworkCount = p.fieldKey ? (opts.reworkFieldCounts?.[p.fieldKey] ?? 0) : 0;
    let status: ZombieStatus;

    if (p.legalBasis) {
      status = "EXCLUDED";
      reasons.push(`법정 절차(${p.legalBasis})라 폐지 후보에서 제외`);
    } else if (reworkCount > 0) {
      status = "KEEP";
      reasons.push(`재작업 역추적에서 이 항목이 원인 필드로 확인됨(${reworkCount}건) — 빼면 오류가 늘 수 있음`);
      if (outcomes === 0) reasons.push(`${josa(outcomeLabel, "은/는")} 0건이지만, 폐지보다 후속 단계 연결을 먼저 검토`);
    } else if (executed < minSample) {
      status = "HOLD";
      reasons.push(`${windowMonths}개월 ${EXECUTED_LABEL[p.kind]} ${executed}건 — 표본이 적어(기준 ${minSample}건) 판단 보류`);
    } else if (outcomes === 0) {
      status = "CANDIDATE";
      reasons.push(`${windowMonths}개월 동안 ${EXECUTED_LABEL[p.kind]} ${executed}건, ${outcomeLabel} 0건`);
    } else {
      status = "KEEP";
      reasons.push(`${windowMonths}개월 ${outcomeLabel} ${outcomes}건 — 결과가 쓰이고 있음`);
    }

    return {
      procedureId: p.id,
      status,
      reasons,
      executed,
      outcomes,
      monthly,
      lastOutcomeMonth: lastIdx === null ? null : fromIndex(lastIdx),
      monthsSinceLastOutcome: lastIdx === null ? null : asOfIdx - lastIdx,
      hoursPerYear: Math.round(((executed * p.minutesPerRun) / 60) * 10) / 10,
      originUnknown: !p.originReason,
    };
  });
}

const ORDER: ZombieStatus[] = ["CANDIDATE", "HOLD", "KEEP", "EXCLUDED"];
export const sortFindings = (fs: ZombieFinding[]) =>
  [...fs].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.hoursPerYear - a.hoursPerYear);
