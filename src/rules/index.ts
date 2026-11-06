// 규칙 목록과 실행. 작성 화면·보관함·우선순위가 모두 여기서 같은 결과를 받는다.
import type { ClaimInput, EvidenceInput, EvidenceLink, LinkStatus, WorkReportInput } from "../domain/workspace";
import type { ClaimRule, Finding, LinkRule, RuleMeta, SaveRule } from "./types";
import { expiredAtApply } from "./link/expiredAtApply";
import { expiredAsOf } from "./link/expiredAsOf";
import { expiring } from "./link/expiring";
import { conflict } from "./link/conflict";
import { scopeGap } from "./link/scopeGap";
import { unclearBasis } from "./link/unclearBasis";
import { noSource } from "./link/noSource";
import { missingLink } from "./claim/missingLink";
import { requiredFields } from "./save/requiredFields";

/** 배열 순서 = 같은 근거에 여러 개가 걸릴 때 보여 주는 순서(적용 시점 만료가 기준일 만료보다 먼저) */
export const LINK_RULES: LinkRule[] = [expiredAtApply, expiredAsOf, conflict, scopeGap, unclearBasis, noSource, expiring];
export const CLAIM_RULES: ClaimRule[] = [missingLink];
export const SAVE_RULES: SaveRule[] = [requiredFields];

/** LLM이 맡는 일(판정하지 않음). 규칙 목록 화면에 함께 보여 준다 */
export const LLM_TASKS: RuleMeta[] = [
  {
    id: "llm-split",
    name: "문장 나누기",
    description: "붙여넣은 보고서를 결론·주장·근거 후보로 나눈다(/api/ai/decompose-report). 판정은 하지 않는다",
    inputs: ["보고서 본문"],
    owner: "llm",
  },
  {
    id: "llm-reason",
    name: "반려 사유 분류 제안",
    description: "반려 메일을 사유 코드로 제안한다(/api/ai/classify-reason). 사람이 확정해야 반영된다",
    inputs: ["반려 메일 원문"],
    owner: "llm",
  },
];

/** 링크 우선순위 점수(코드). 가중치는 초기 가정이다 */
export const LINK_PRIORITY_RULE: RuleMeta = {
  id: "link-priority",
  name: "점검 항목 순위",
  description: "결론 의존도 × 근거 약함 × 되돌리기 비용 × 영향 유형 가중 × 100 (가중치는 초기 가정)",
  inputs: ["link.status", "link.impactType", "report.type", "같은 항목을 받치는 근거 수"],
  owner: "code",
};

export const ALL_RULES: RuleMeta[] = [...LINK_RULES, ...CLAIM_RULES, ...SAVE_RULES, LINK_PRIORITY_RULE, ...LLM_TASKS];
export const CODE_RULE_COUNT = ALL_RULES.filter((r) => r.owner === "code").length;

/** 심한 순서. 링크 상태는 걸린 점검 항목 중 가장 심한 것 */
export const STATUS_SEVERITY: LinkStatus[] = ["missing", "expired_at_apply", "conflict", "scope_gap", "unclear_basis", "expiring", "fresh"];
const worst = (fs: Finding[]): LinkStatus =>
  fs.length ? fs.map((f) => f.status).sort((a, b) => STATUS_SEVERITY.indexOf(a) - STATUS_SEVERITY.indexOf(b))[0]! : "fresh";

// ── 우선순위 가중치(초기 가정) ──────────────────────────
export const WEAKNESS: Record<LinkStatus, number> = {
  missing: 1,
  expired_at_apply: 0.9,
  conflict: 0.85,
  scope_gap: 0.6,
  unclear_basis: 0.5,
  expiring: 0.3,
  fresh: 0,
};
export const REVERSAL_COST: Record<WorkReportInput["type"], number> = {
  contract_decision: 1, // 계약은 체결 후 되돌리기 어렵다
  claim: 0.8,
  management: 0.5,
  regular_status: 0.3,
};
export const IMPACT_WEIGHT = { direction: 1, magnitude: 0.6 } as const;

export interface ScoreParts {
  dependence: number;
  weakness: number;
  reversal: number;
  impact: number;
}
export const scoreOf = (p: ScoreParts) => Math.round(p.dependence * p.weakness * p.reversal * p.impact * 100);

/** 같은 항목을 혼자 받치면 1, 다른 근거도 같은 항목을 받치면 0.7 */
const dependenceOf = (claim: ClaimInput, field: string | undefined) =>
  field && claim.evidenceLinks.filter((l) => l.field === field).length > 1 ? 0.7 : 1;

function defaultImpactLine(claim: ClaimInput, impactType: "direction" | "magnitude", field?: string): string {
  const what = field ?? "값";
  return impactType === "direction"
    ? `이 근거의 ${what}가 달라지면 '${claim.text}'의 결론 방향이 바뀔 수 있습니다.`
    : `이 근거의 ${what}가 달라지면 '${claim.text}'의 크기(금액·수치)가 달라집니다.`;
}

export interface EvaluatedLink extends EvidenceLink {
  evidence?: EvidenceInput;
  findings: Finding[];
  parts: ScoreParts;
}
export interface EvaluatedClaim {
  sectionId: string;
  claim: ClaimInput;
  links: EvaluatedLink[];
  claimFindings: Finding[]; // 연결 없음 등 주장 단위
}

/** 보고서 하나의 모든 링크·주장을 규칙으로 점검한다 */
export function evaluateReport(report: WorkReportInput, evidenceById: Map<string, EvidenceInput>, asOf: string): EvaluatedClaim[] {
  return report.sections.flatMap((section) =>
    section.claims.map((claim) => {
      const resolved = claim.evidenceLinks.map((link) => ({ link, evidence: evidenceById.get(link.evidenceId) }));
      const links: EvaluatedLink[] = resolved.map(({ link, evidence }) => {
        const findings: Finding[] = evidence
          ? LINK_RULES.map((r) =>
              r.check({
                report,
                claim,
                link,
                evidence,
                siblings: resolved.filter((x): x is { link: typeof link; evidence: EvidenceInput } => x.link !== link && !!x.evidence),
                asOf,
              }),
            ).filter((f): f is Finding => f !== null)
          : [{ ruleId: "missing-evidence", name: "연결 없음", status: "missing", message: `연결된 근거(${link.evidenceId})를 보관함에서 찾을 수 없습니다.` }];
        const status = worst(findings);
        const parts: ScoreParts = {
          dependence: dependenceOf(claim, link.field),
          weakness: WEAKNESS[status],
          reversal: REVERSAL_COST[report.type],
          impact: IMPACT_WEIGHT[link.impactType],
        };
        return {
          ...link,
          evidence,
          findings,
          status,
          impactLine: link.impactLine ?? defaultImpactLine(claim, link.impactType, link.field),
          priorityScore: scoreOf(parts),
          parts,
        };
      });
      const claimFindings = CLAIM_RULES.map((r) => r.check({ report, claim })).filter((f): f is Finding => f !== null);
      return { sectionId: section.id, claim, links, claimFindings };
    }),
  );
}

/** 확인 요청 한 건: 화면 상위 3개 노출·접힘·피로도 집계의 단위 */
export interface CheckItem {
  key: string; // reportId:claimId:evidenceId:ruleId
  reportId: string;
  claimId: string;
  evidenceId?: string;
  field?: string;
  finding: Finding; // 대표(가장 심한) 점검 항목
  others: Finding[]; // 같은 근거에 함께 걸린 나머지
  impactType: "direction" | "magnitude";
  impactLine: string;
  score: number;
  parts: ScoreParts;
}

/**
 * 보고서의 확인 요청 목록(점수 높은 순). 한 건 = 주장 × 근거(값) 한 쌍.
 * 같은 근거에 규칙이 여러 개 걸리면 가장 심한 것을 대표로(같으면 규칙 순서: 적용 시점 만료가 기준일 만료보다 먼저).
 * 주장 단위 '연결 없음'은 방향 영향·의존도 1로 본다.
 */
export function checkItems(report: WorkReportInput, evaluated: EvaluatedClaim[]): CheckItem[] {
  const items: CheckItem[] = [];
  for (const ec of evaluated) {
    for (const l of ec.links) {
      if (!l.findings.length) continue;
      const ranked = [...l.findings].sort((a, b) => WEAKNESS[b.status] - WEAKNESS[a.status]); // 안정 정렬: 같은 심각도는 규칙 순서 유지
      items.push({
        key: `${report.id}:${ec.claim.id}:${l.evidenceId}:${l.field ?? ""}`,
        reportId: report.id,
        claimId: ec.claim.id,
        evidenceId: l.evidenceId,
        field: l.field,
        finding: ranked[0]!,
        others: ranked.slice(1),
        impactType: l.impactType,
        impactLine: l.impactLine,
        score: l.priorityScore,
        parts: l.parts,
      });
    }
    for (const f of ec.claimFindings) {
      const parts = { dependence: 1, weakness: WEAKNESS[f.status], reversal: REVERSAL_COST[report.type], impact: IMPACT_WEIGHT.direction };
      items.push({
        key: `${report.id}:${ec.claim.id}::${f.ruleId}`,
        reportId: report.id,
        claimId: ec.claim.id,
        finding: f,
        others: [],
        impactType: "direction",
        impactLine: `근거가 없으면 '${ec.claim.text}'를 받아들일지 독자가 판단할 수 없습니다.`,
        score: scoreOf(parts),
        parts,
      });
    }
  }
  return items.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export { requiredFields };
export type { Finding };
