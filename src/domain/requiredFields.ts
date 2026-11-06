// ① 재작업 역추적 → 저장 시점 필수 항목 후보. 반려 데이터에서 코드로 도출하고, 사람이 승인해야 양식에 반영된다(원칙 5).
import type { CaseTrace } from "./trace";
import type { ReworkCase } from "./schemas";
import { fieldLabel } from "./labels";
import type { RequiredSpec } from "../rules/types";
import { ITEM_FIELD } from "./reportRework";

export interface RequiredCandidate {
  key: string; // 승인 키 "booking|필드"
  field: string;
  label: string;
  totalCases: number; // 이 필드의 재작업 전체(단계 합산)
  totalCost: number;
  preventable: string[]; // 부킹 저장 시 필수로 했다면 막을 수 있었던 사건(부킹 단계에서 비어 있던 누락)
  preventableCost: number;
  notPreventable: { caseId: string; reason: string }[];
  rationale: string; // 화면에 보일 한 줄 근거
}

/**
 * 부킹 기록(booking_record)의 필수 후보: 재작업 원인 필드 중 '누락'이 있는 필드.
 * 막을 수 있는 건 = 부킹 단계에서 이미 비어 있던 누락. 그 뒤 단계 유실·오입력은 필수화로 못 막는다.
 */
export function bookingRequiredCandidates(traces: CaseTrace[], cases: ReworkCase[]): RequiredCandidate[] {
  const cost = new Map(cases.map((c) => [c.id, c.cost]));
  const byField = new Map<string, CaseTrace[]>();
  for (const t of traces) byField.set(t.field, [...(byField.get(t.field) ?? []), t]);

  const out: RequiredCandidate[] = [];
  for (const [field, ts] of byField) {
    if (!ts.some((t) => t.kind === "MISSING")) continue;
    const preventable = ts.filter((t) => t.kind === "MISSING" && t.originStage === "BOOKING").map((t) => t.caseId);
    const notPreventable = ts
      .filter((t) => !preventable.includes(t.caseId))
      .map((t) => ({
        caseId: t.caseId,
        reason: t.kind === "WRONG" ? "값은 있었지만 틀림(필수화로는 못 막음)" : "부킹 이후 단계에서 유실(부킹 필수화로는 못 막음)",
      }));
    const sum = (ids: string[]) => ids.reduce((s, id) => s + (cost.get(id) ?? 0), 0);
    out.push({
      key: `booking|${field}`,
      field,
      label: fieldLabel(field),
      totalCases: ts.length,
      totalCost: sum(ts.map((t) => t.caseId)),
      preventable,
      preventableCost: sum(preventable),
      notPreventable,
      rationale: `재작업 ${cases.length}건 중 ${ts.length}건이 ${fieldLabel(field)} 관련, 그중 ${preventable.length}건은 부킹 접수 때 이미 비어 있었습니다.`,
    });
  }
  return out.sort((a, b) => b.preventable.length - a.preventable.length || b.totalCost - a.totalCost);
}

/**
 * 승인된 후보 → 저장 필수 규칙. 승인 키는 "출처|필드":
 *  - "booking|consigneeAddress" → 부킹 기록의 그 필드
 *  - "report|포함 항목" → 보고서 반려에서 도출한 항목. 해당하는 근거 유형 모두(ITEM_FIELD)
 */
export function approvedSpecs(keys: string[]): RequiredSpec[] {
  return keys.flatMap((key): RequiredSpec[] => {
    const [source, field] = key.split("|") as [string, string];
    if (source === "booking") return [{ type: "booking_record", field, label: fieldLabel(field), origin: "approved" }];
    const m = Object.values(ITEM_FIELD).find((x) => x.field === field);
    return m ? m.types.map((type) => ({ type, field, label: m.label, origin: "approved" as const })) : [];
  });
}
