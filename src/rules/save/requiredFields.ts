import type { RequiredSpec, SaveRule } from "../types";
import type { EvidenceInput, EvidenceType } from "../../domain/workspace";

/**
 * 기본 권장 필수 항목(데이터에서 도출한 것이 아님). 운임 근거는 포함 항목·유효기간·적용 구간이 있어야
 * 작성 중 점검(포함 항목 불명확·적용 시점 만료·범위 부족)이 판단할 수 있다.
 * 필드명 "@validTo", "@scope"는 필드 목록이 아니라 근거의 속성을 뜻한다.
 */
export const BASELINE_SPECS: RequiredSpec[] = (["rate_table", "quote_mail", "contract"] as EvidenceType[]).flatMap((type) => [
  { type, field: "포함 항목", label: "포함 항목", origin: "baseline" as const },
  { type, field: "@validTo", label: "유효기간", origin: "baseline" as const },
  { type, field: "@scope", label: "적용 구간", origin: "baseline" as const },
]);

function isEmpty(e: EvidenceInput, field: string): boolean {
  if (field === "@validTo") return !e.validTo;
  if (field === "@scope") return e.scope.length === 0;
  const f = e.fields.find((x) => x.key === field);
  return !f || f.value === "";
}

/** 저장 시점 점검: 이 근거 유형에 필수인 필드 중 비어 있는 것 */
export const requiredFields: SaveRule = {
  id: "required-fields",
  scope: "save",
  name: "저장 필수 항목",
  description: "근거 유형별 필수 항목(승인된 규칙 + 기본 권장)이 비어 있으면 저장 화면에 표시",
  inputs: ["evidence.type", "evidence.fields", "evidence.validTo", "evidence.scope", "승인된 필수 항목"],
  owner: "code",
  check: (e, specs) => specs.filter((s) => s.type === e.type && isEmpty(e, s.field)).map((s) => s.field),
};
