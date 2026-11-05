// 모듈 1: 패턴 집계 → 개선안 생성 → 가상 재실행(Counterfactual Replay). 모두 순수 함수.
import { STAGES, STAGE_LABEL, type ReworkCase, type Stage, type Suggestion } from "./schemas";
import type { CaseTrace, TraceKind } from "./trace";
import { fieldLabel, josa } from "./labels";

export interface Pattern {
  key: string; // `${stage}|${field}|${kind}`
  stage: Stage;
  field: string;
  kind: TraceKind;
  count: number;
  totalCost: number;
  caseIds: string[];
}

/** 같은 (원인 단계, 필드, 유형)을 묶어 건수·누적 비용을 집계한다. 비용 내림차순. */
export function aggregatePatterns(traces: readonly CaseTrace[], cases: readonly ReworkCase[]): Pattern[] {
  const costOf = new Map(cases.map((c) => [c.id, c.cost]));
  const byKey = new Map<string, Pattern>();
  for (const t of traces) {
    const key = `${t.originStage}|${t.field}|${t.kind}`;
    const p = byKey.get(key) ?? {
      key,
      stage: t.originStage,
      field: t.field,
      kind: t.kind,
      count: 0,
      totalCost: 0,
      caseIds: [],
    };
    p.count += 1;
    p.totalCost += costOf.get(t.caseId) ?? 0;
    p.caseIds.push(t.caseId);
    byKey.set(key, p);
  }
  return [...byKey.values()].sort(
    (a, b) => b.totalCost - a.totalCost || b.count - a.count || a.key.localeCompare(b.key),
  );
}

/** 패턴 하나에 대한 개선안. 누락은 입구에서 막고, 오입력은 대조로 잡는다. */
export function suggestFor(p: Pattern): Suggestion[] {
  const f = fieldLabel(p.field);
  const st = STAGE_LABEL[p.stage];
  const next = STAGES[STAGES.indexOf(p.stage) + 1];
  const checklist = next
    ? `'${STAGE_LABEL[next]}' 단계로 넘기기 전 체크리스트에 '${f} 확인' 추가`
    : `발행 전 체크리스트에 '${f} 확인' 추가`;
  const base = { stage: p.stage, field: p.field, patternKey: p.key, status: "PROPOSED" as const };

  if (p.kind === "MISSING") {
    return [
      { ...base, id: `REQUIRED_FIELD:${p.key}`, kind: "REQUIRED_FIELD", description: `'${st}' 화면에서 ${josa(f, "을/를")} 필수 항목으로 지정` },
      { ...base, id: `PRE_CHECK:${p.key}`, kind: "PRE_CHECK", description: `'${st}' 때 "${josa(f, "을/를")} 받았나요?" 사전 점검 질문 추가` },
      { ...base, id: `CHECKLIST:${p.key}`, kind: "CHECKLIST", description: checklist },
    ];
  }
  const isFirst = STAGES.indexOf(p.stage) === 0;
  return [
    isFirst
      ? { ...base, id: `PRE_CHECK:${p.key}`, kind: "PRE_CHECK", description: `'${st}' 때 ${josa(f, "을/를")} 화주 원본 자료와 대조하는 확인 질문 추가` }
      : { ...base, id: `CROSS_CHECK:${p.key}`, kind: "CROSS_CHECK", description: `'${st}' 단계의 ${josa(f, "을/를")} 앞 단계 기록과 자동 대조` },
    { ...base, id: `CHECKLIST:${p.key}`, kind: "CHECKLIST", description: checklist },
  ];
}

export interface SimResult {
  estimable: boolean; // 과거 기록으로 효과를 셀 수 있는 규칙인가
  prevented: string[]; // 예방 가능(누락 유형만)
  savedCost: number;
  detectable: string[]; // 조기 발견 가능(예방으로 세지 않음)
  outOfScope: { caseId: string; reason: string }[];
  note?: string;
}

/**
 * 제안 규칙을 과거 사건에 가정 적용한다.
 * - REQUIRED_FIELD: 같은 단계에서 시작된 같은 필드의 '누락'만 예방으로 센다.
 * - CROSS_CHECK: 앞 단계에 정답 값이 있었던 '오입력'을 조기 발견 가능으로 센다(절감액에 넣지 않음).
 * - 그 밖의 규칙: 과거 기록으로 추정 불가 → 적용 후 전후 지표로 확인.
 */
export function simulate(
  s: Suggestion,
  traces: readonly CaseTrace[],
  cases: readonly ReworkCase[],
): SimResult {
  const costOf = new Map(cases.map((c) => [c.id, c.cost]));
  const related = traces.filter((t) => t.field === s.field);
  const empty: SimResult = { estimable: true, prevented: [], savedCost: 0, detectable: [], outOfScope: [] };

  if (s.kind === "REQUIRED_FIELD") {
    const r = { ...empty, prevented: [] as string[], outOfScope: [] as SimResult["outOfScope"] };
    for (const t of related) {
      if (t.kind === "MISSING" && t.originStage === s.stage) r.prevented.push(t.caseId);
      else if (t.kind === "WRONG")
        r.outOfScope.push({ caseId: t.caseId, reason: "오입력은 필수화로 막을 수 없음 → 서류 간 자동 대조 제안 참고" });
      else
        r.outOfScope.push({ caseId: t.caseId, reason: `원인 단계: ${STAGE_LABEL[t.originStage]} — 이 규칙 범위 밖` });
    }
    r.savedCost = r.prevented.reduce((sum, id) => sum + (costOf.get(id) ?? 0), 0);
    return r;
  }

  if (s.kind === "CROSS_CHECK") {
    const r = { ...empty, detectable: [] as string[], outOfScope: [] as SimResult["outOfScope"] };
    for (const t of related) {
      if (t.kind !== "WRONG" || t.originStage !== s.stage) continue;
      const originIdx = t.steps.findIndex((x) => x.status === "ORIGIN");
      const hadCorrectBefore = t.steps.slice(0, originIdx).some((x) => x.status === "OK");
      if (hadCorrectBefore) r.detectable.push(t.caseId);
      else r.outOfScope.push({ caseId: t.caseId, reason: "앞 단계에도 정답 값이 없어 대조로 발견할 수 없음" });
    }
    r.note = "대조는 오류를 일찍 발견하게 할 뿐 입력 자체를 막지 않으므로 예방 건수·절감액에 넣지 않습니다.";
    return r;
  }

  return {
    ...empty,
    estimable: false,
    note: "과거 기록으로는 효과를 추정할 수 없습니다. 적용 후 전후 지표(재작업 건수·입력 시간)로 확인합니다.",
  };
}
