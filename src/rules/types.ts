// 규칙 공통 타입. 규칙 1개 = 함수 1개 + 메타데이터(원칙 4).
// owner: code(코드 규칙이 판정) | llm(문장 나누기·추천·문장화만, 판정 안 함)
import type { ClaimInput, EvidenceInput, EvidenceLinkInput, EvidenceType, LinkStatus, WorkReportInput } from "../domain/workspace";

export interface RuleMeta {
  id: string;
  name: string; // 화면 배지·목록에 쓰는 짧은 이름
  description: string; // 무엇을 어떻게 보는지 한 줄
  inputs: string[]; // 판단에 쓰는 필드
  owner: "code" | "llm";
}

/** 점검 항목: 판정이 아니라 담당자가 확인할 내용(원칙 3) */
export interface Finding {
  ruleId: string;
  name: string;
  status: LinkStatus;
  message: string; // "~인지 확인이 필요합니다" 형태
}

export interface LinkContext {
  report: WorkReportInput;
  claim: ClaimInput;
  link: EvidenceLinkInput;
  evidence: EvidenceInput;
  /** 같은 주장에 연결된 다른 근거들(근거 간 비교용) */
  siblings: { link: EvidenceLinkInput; evidence: EvidenceInput }[];
  asOf: string; // 점검 기준일
}

export interface LinkRule extends RuleMeta {
  scope: "link";
  check: (ctx: LinkContext) => Finding | null;
}

export interface ClaimContext {
  report: WorkReportInput;
  claim: ClaimInput;
}

export interface ClaimRule extends RuleMeta {
  scope: "claim";
  check: (ctx: ClaimContext) => Finding | null;
}

/** 저장 시점 점검: 어떤 필드가 필수인지와 그 근거 */
export interface RequiredSpec {
  type: EvidenceType;
  field: string;
  label: string;
  origin: "approved" | "baseline"; // 승인된 규칙 | 기본 권장(데이터 도출 아님)
}

export interface SaveRule extends RuleMeta {
  scope: "save";
  check: (evidence: EvidenceInput, specs: RequiredSpec[]) => string[]; // 비어 있는 필드 목록
}
