// 모듈 1 핵심 로직(순수 함수). UI·DB·LLM에 의존하지 않는다.
import { STAGES, type FieldSnapshot, type ReworkCase, type Stage } from "./schemas";

export type TraceKind = "MISSING" | "WRONG";

export interface TraceResult {
  origin: number; // 최초 원인 단계 인덱스
  kind: TraceKind;
}

/**
 * 단계 순서대로 정렬된 값 배열에서, 결과(마지막 단계)부터 거꾸로 따라가
 * "틀린 값이 끊기지 않고 이어진 가장 이른 단계"를 최초 원인으로 본다.
 * 중간에 정상이었다가 다시 틀어진 경우(예: SI에서 유실)는 다시 틀어진 지점이 원인이다.
 * 마지막 값이 정답이면(재작업 없음) null.
 */
export function traceOrigin(values: readonly string[], correct: string): TraceResult | null {
  if (values.length === 0) return null;
  const wrong = values.map((v) => v !== correct);
  let i = values.length - 1;
  if (!wrong[i]) return null;
  while (i > 0 && wrong[i - 1]) i--;
  return { origin: i, kind: values[i] === "" ? "MISSING" : "WRONG" };
}

export type StepStatus = "OK" | "ERROR" | "ORIGIN";

export interface CaseTrace {
  caseId: string;
  field: string;
  originStage: Stage;
  kind: TraceKind;
  steps: { stage: Stage; value: string; at: string; status: StepStatus }[];
}

/**
 * 사건 하나의 필드 이력을 단계 순으로 정리해 역추적한다.
 * 같은 단계에 기록이 여러 개면 그 단계의 마지막(가장 늦은) 값을 쓴다.
 * 기록이 없는 단계는 건너뛴다(없는 단계를 원인으로 지목하지 않는다).
 */
export function traceCase(c: ReworkCase, snapshots: readonly FieldSnapshot[]): CaseTrace | null {
  const latestByStage = new Map<Stage, FieldSnapshot>();
  for (const s of snapshots) {
    if (s.caseId !== c.id || s.field !== c.field) continue;
    const prev = latestByStage.get(s.stage);
    if (!prev || Date.parse(s.at) >= Date.parse(prev.at)) latestByStage.set(s.stage, s);
  }
  const ordered = STAGES.flatMap((st) => {
    const s = latestByStage.get(st);
    return s ? [s] : [];
  });

  const result = traceOrigin(
    ordered.map((s) => s.value),
    c.correctValue,
  );
  if (!result) return null;

  return {
    caseId: c.id,
    field: c.field,
    originStage: ordered[result.origin]!.stage,
    kind: result.kind,
    steps: ordered.map((s, idx) => ({
      stage: s.stage,
      value: s.value,
      at: s.at,
      status: idx === result.origin ? "ORIGIN" : s.value === c.correctValue ? "OK" : "ERROR",
    })),
  };
}
