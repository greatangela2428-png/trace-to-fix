// 업무 TODO: 지금 상태에서 '먼저 처리할 일'을 계산한다(저장된 목록이 아님).
// 근거를 고치거나 연결하면, 섹션을 쓰면, 결정을 내리면 해당 할 일이 자동으로 사라지고 순서가 다시 정렬된다.
// 점수 = 보고서 우선순위 점수 × 할 일 가중치(초기 가정). 근거 보관함 정리는 그 근거를 쓰는 보고서 중 가장 높은 점수를 따른다.
import type { CheckItem } from "../rules";
import type { DupGroup } from "./dedupe";
import type { PriorityDetail, UnreadItem } from "./priority";
import type { EvidenceItem, SectionInput, WorkReport } from "./workspace";

export type TodoKind = "check" | "write" | "link" | "vault" | "dedupe" | "decide";
export const TODO_KIND_LABEL: Record<TodoKind, string> = {
  check: "근거 확인",
  write: "작성",
  link: "근거 연결",
  vault: "보관함 보완",
  dedupe: "중복 정리",
  decide: "결정",
};

/** 할 일 종류별 가중치(초기 가정) */
export const TODO_WEIGHT = { check: 1, link: 1, write: 0.6, vault: 0.5, dedupe: 0.3 } as const;
/** 보고서와 무관한 정리·결정 일의 기본 점수(초기 가정) */
export const BASE_SCORE = { dedupe: 8, decide: 6 } as const;

export type TodoTarget =
  | { tab: "write"; reportId: string; claimId?: string; evidenceId?: string }
  | { tab: "vault"; evidenceId?: string }
  | { tab: "docs" }
  | { tab: "home" };

export interface Todo {
  key: string;
  kind: TodoKind;
  title: string;
  context: string; // 어느 보고서·근거의 일인지
  why: string; // 왜 지금 해야 하는지(한 줄)
  score: number;
  daysLeft?: number;
  target: TodoTarget;
  pendingFix?: boolean; // '수정할게요'를 누른 확인 요청
  procedureId?: string; // 결정 일(업무 관성)
  itemKeys?: string[]; // 묶인 확인 요청 키들([확인함]을 누르면 모두 응답)
}

export interface TodoInput {
  reports: { report: WorkReport; priority: PriorityDetail; items: CheckItem[]; sections: SectionInput[] }[];
  evidence: EvidenceItem[];
  duplicates: DupGroup[];
  unread: UnreadItem[];
  checkLog: Record<string, { action: "ack" | "fix" | "dismiss" }>;
  decided: Set<string>; // 결정이 내려진 절차 id
  evidenceTitle: (id: string) => string;
  requiredLabel: (key: string) => string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildTodos(input: TodoInput): Todo[] {
  const out: Todo[] = [];
  const reportScore = new Map(input.reports.map((v) => [v.report.id, v.priority.score]));

  for (const { report, priority, items, sections } of input.reports) {
    const ctx = report.title;
    // 확인 요청(응답하지 않았거나 '수정 예정'인 것). 같은 근거·같은 문제는 주장이 여러 개여도 할 일 하나로 묶는다
    const merged = new Map<string, Todo>();
    for (const i of items) {
      const log = input.checkLog[i.key];
      if (log && log.action !== "fix") continue;
      const isMissing = i.finding.status === "missing";
      const groupKey = isMissing ? `todo:${i.key}` : `todo:${report.id}:${i.evidenceId}:${i.finding.ruleId}`;
      const score = r1(priority.score * (i.score / 100) * (isMissing ? TODO_WEIGHT.link : TODO_WEIGHT.check));
      const prev = merged.get(groupKey);
      if (prev) {
        prev.itemKeys!.push(i.key);
        prev.pendingFix = prev.pendingFix || log?.action === "fix";
        if (score > prev.score) Object.assign(prev, { score, target: { tab: "write", reportId: report.id, claimId: i.claimId, evidenceId: i.evidenceId } });
        prev.why = `${i.finding.name} · 주장 ${prev.itemKeys!.length}개에 영향`;
        continue;
      }
      merged.set(groupKey, {
        key: groupKey,
        kind: isMissing ? "link" : "check",
        title: isMissing ? `근거 연결: ${i.finding.message.split("'")[1] ?? "주장"}` : i.finding.message,
        context: ctx,
        why: `${i.finding.name} · ${i.impactType === "direction" ? "결론 방향에 영향" : "크기에 영향"}`,
        score,
        daysLeft: priority.daysLeft,
        target: { tab: "write", reportId: report.id, claimId: i.claimId, evidenceId: i.evidenceId },
        pendingFix: log?.action === "fix",
        itemKeys: [i.key],
      });
    }
    out.push(...merged.values());
    // 미작성 섹션
    for (const s of sections.filter((x) => x.status === "empty")) {
      out.push({
        key: `todo:write:${report.id}:${s.id}`,
        kind: "write",
        title: `'${s.title}' 섹션 쓰기`,
        context: ctx,
        why: "아직 쓰지 않은 섹션",
        score: r1(priority.score * TODO_WEIGHT.write),
        daysLeft: priority.daysLeft,
        target: { tab: "write", reportId: report.id },
      });
    }
  }

  // 보관함: 필수 항목이 비어 있는 근거(그 근거를 쓰는 보고서가 급할수록 먼저)
  for (const e of input.evidence.filter((x) => x.requiredFieldsMissing.length)) {
    const best = Math.max(0, ...e.usedByReportIds.map((id) => reportScore.get(id) ?? 0));
    out.push({
      key: `todo:vault:${e.id}`,
      kind: "vault",
      title: `'${e.title}'에 ${e.requiredFieldsMissing.map(input.requiredLabel).join(", ")} 입력`,
      context: e.usedByReportIds.length ? `${e.usedByReportIds.length}개 보고서가 사용 중` : "아직 쓰는 보고서 없음",
      why: "저장 필수·권장 항목이 비어 있음",
      score: r1(best ? best * TODO_WEIGHT.vault : 3),
      target: { tab: "vault", evidenceId: e.id },
    });
  }

  // 중복·분기 정리
  for (const g of input.duplicates) {
    out.push({
      key: `todo:dedupe:${g.canonicalId}:${g.memberIds.join(",")}`,
      kind: "dedupe",
      title:
        g.kind === "duplicate"
          ? `'${input.evidenceTitle(g.memberIds[0]!)}'은 '${input.evidenceTitle(g.canonicalId)}'과 같은 내용 — 병합 검토`
          : `'${input.evidenceTitle(g.memberIds[0]!)}' 값이 원본과 다름(${g.differences.map((d) => d.key).join(", ")}) — 어느 값이 맞는지 확인`,
      context: "근거 보관함",
      why: g.kind === "duplicate" ? "같은 내용을 두 번 저장하면 보고서마다 다른 출처를 가리킬 수 있음" : "복사 후 값이 달라짐",
      score: g.kind === "diverged" ? BASE_SCORE.dedupe * 1.5 : BASE_SCORE.dedupe,
      target: { tab: "docs" },
    });
  }

  // 업무 관성: 읽히지 않는 보고서·항목을 뺄지 결정(보호 항목은 할 일이 아님)
  for (const u of input.unread.filter((x) => !x.protectedBy && !input.decided.has(x.procedureId))) {
    out.push({
      key: `todo:decide:${u.procedureId}`,
      kind: "decide",
      title: u.kind === "REPORT" ? `'${u.name}' 템플릿에서 뺄지(시범 중단) 결정` : `'${u.name}'을 입력 양식에서 뺄지 결정`,
      context: `12개월 ${u.executed}회 · ${u.kind === "REPORT" ? "열람" : "후속 참조"} ${u.outcomes}회`,
      why: "결과가 쓰이지 않음(시스템 로그 기준, 인쇄·구두 공유 미포함) · 시범 중단은 수신자 확인 후 3개월, 그사이 요청이 1건이라도 오면 재개",
      score: BASE_SCORE.decide,
      target: { tab: "home" },
      procedureId: u.procedureId,
    });
  }

  return out.sort((a, b) => b.score - a.score || (a.daysLeft ?? 99) - (b.daysLeft ?? 99) || a.key.localeCompare(b.key));
}
