// 보고서 작성 도구 공통 화면 조각. 기존 디자인 토큰·Badge를 그대로 쓴다(원칙 1).
import type { ReactNode } from "react";
import { Badge } from "../components/ui";
import { AS_OF } from "../seed";
import { EVIDENCE_TYPE_LABEL, LINK_STATUS_LABEL, type EvidenceInput, type LinkStatus } from "../domain/workspace";
import type { Finding } from "../rules/types";

type Tone = "neutral" | "danger" | "warn" | "ok" | "info";

export const STATUS_TONE: Record<LinkStatus, Tone> = {
  fresh: "ok",
  expiring: "warn",
  expired_at_apply: "danger",
  conflict: "danger",
  scope_gap: "warn",
  unclear_basis: "warn",
  missing: "danger",
};

/** 링크 상태 배지. 점검 항목이 있으면 그 규칙 이름(예: '출처 불명확')을 보여 준다 */
export function StatusBadge({ status, finding }: { status: LinkStatus; finding?: Finding }) {
  return <Badge tone={STATUS_TONE[status]}>{finding?.name ?? LINK_STATUS_LABEL[status]}</Badge>;
}

/** 원칙 8: 샘플 데이터임을 화면에 밝힌다 */
export function SampleNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line px-4 py-2.5 text-sm text-ink-3">
      샘플 데이터이며 통계적 결론이 아닙니다. 점검 기준일 {AS_OF}.{children ? <> {children}</> : null}
    </p>
  );
}

export function validityLabel(e: Pick<EvidenceInput, "validFrom" | "validTo">): { text: string; tone: Tone } {
  if (!e.validTo && !e.validFrom) return { text: "유효기간 없음", tone: "neutral" };
  const range = `${e.validFrom ?? ""}~${e.validTo ?? ""}`;
  if (e.validTo && e.validTo < AS_OF) return { text: `만료 ${range}`, tone: "danger" };
  if (e.validFrom && e.validFrom > AS_OF) return { text: `적용 예정 ${range}`, tone: "info" };
  return { text: `유효 ${range}`, tone: "ok" };
}

/** 끌어온 근거는 항상 출처·저장일·유효기간·적용 범위와 함께 보인다 */
export function EvidenceMeta({ e }: { e: EvidenceInput }) {
  const v = validityLabel(e);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
      <span>{EVIDENCE_TYPE_LABEL[e.type]}</span>
      <span>출처: {e.source || <span className="text-warn">기록 없음</span>}</span>
      <span>저장 {e.capturedAt}</span>
      <span className={v.tone === "danger" ? "text-danger" : v.tone === "ok" ? "text-ok" : ""}>{v.text}</span>
      <span>범위: {e.scope.length ? e.scope.join(", ") : "지정 안 됨"}</span>
    </div>
  );
}

export const fmtField = (v: string | number, unit?: string) => `${typeof v === "number" ? v.toLocaleString("ko-KR") : v}${unit ? ` ${unit}` : ""}`;

/** 필수 항목 키 → 화면 이름 */
export const requiredLabel = (key: string) => (key === "@validTo" ? "유효기간" : key === "@scope" ? "적용 구간" : key);
