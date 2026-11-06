// 규칙 목록 보기 · 이 시스템이 하지 못하는 것(발표용 한계)
import { Badge } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { ALL_RULES, CODE_RULE_COUNT } from "../../rules";
import type { RuleMeta } from "../../rules/types";

const SCOPE_LABEL: Record<string, string> = { link: "근거 연결", claim: "주장", save: "저장" };

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const code = ALL_RULES.filter((r) => r.owner === "code");
  const llm = ALL_RULES.filter((r) => r.owner === "llm");
  return (
    <Modal open={open} onClose={onClose} title={`규칙 목록 · 코드 규칙 ${CODE_RULE_COUNT}개`} wide>
      <p className="mb-4 text-sm text-ink-2">
        만료·충돌·범위·금액·우선순위는 <b className="font-semibold text-ink">코드 규칙</b>이 판정합니다. AI는 문장 나누기·사유 분류 제안만 하고, 사람이 확정해야 반영됩니다. 규칙 1개 = 파일 1개(
        <code className="text-xs">src/rules/</code>).
      </p>
      <RuleList title="코드 규칙(판정)" rules={code} />
      <div className="mt-5" />
      <RuleList title="AI 담당(판정하지 않음)" rules={llm} />
    </Modal>
  );
}

function RuleList({ title, rules }: { title: string; rules: RuleMeta[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink-2">{title}</h3>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {rules.map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-ink">{r.name}</span>
              <Badge tone={r.owner === "code" ? "info" : "neutral"}>{r.owner === "code" ? "code" : "llm"}</Badge>
              {"scope" in r && typeof r.scope === "string" && <Badge>{SCOPE_LABEL[r.scope] ?? r.scope}</Badge>}
              <code className="ml-auto text-xs text-ink-3">{r.id}</code>
            </div>
            <p className="mt-0.5 text-sm text-ink-2">{r.description}</p>
            <p className="mt-0.5 text-xs text-ink-3">입력: {r.inputs.join(", ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 발표에서 정직하게 말할 한계. docs/limitations.md와 같은 내용 */
export const LIMITATIONS: { title: string; body: string }[] = [
  { title: "샘플 데이터", body: "보고서 5건, 근거 16건, 반려 13건, 선적 재작업 13건은 시연용 샘플입니다. 건수·비율·방지 효과는 통계적 결론이 아닙니다." },
  { title: "우선순위·점수 가중치는 초기 가정", body: "우선순위 식(영향도×임박도×준비 부족도×독자 중요도)과 각 기준값, 점검 항목 점수·TODO 가중치·재작업 시간당 5만 원은 모두 초기 가정입니다. 팀이 합의해 정해야 합니다." },
  { title: "작성 화면은 미리 분해된 보고서", body: "작성 화면의 보고서는 주장·근거 연결이 미리 들어 있습니다. 새 보고서의 실시간 분해(AI)는 논리 역추적 화면에서만 되고, 그 결과를 작성 화면으로 옮기는 기능은 없습니다." },
  { title: "근거 추천은 코드 매칭", body: "값 항목 이름·범위·낱말 일치로 고르므로 의미가 같은데 표현이 다르면 놓칠 수 있습니다." },
  { title: "범위 계층·운임 구성은 규칙표 기반", body: "항로 계층(유럽 항로 ⊃ 부산-로테르담 등)과 '포함 항목' 판단은 샘플 항로·필드에 맞춘 규칙표입니다. 실제 항로 마스터·운임 체계와 연결해야 합니다." },
  { title: "열람 지표의 한계", body: "읽히지 않는 보고서 판단은 시스템 열람 로그 기준이라 인쇄·구두 공유는 빠집니다. 그래서 자동 폐지 대신 사람의 결정(유지·시범 중단·표본 감사)을 받습니다." },
  { title: "저장되지 않는 상태", body: "승인·병합·응답·근거 수정은 새로고침하면 샘플 상태로 돌아갑니다(피로도 집계만 이 브라우저에 저장). 실제 운영에는 서버 저장이 필요합니다." },
  { title: "재발 모니터링 데이터 없음", body: "저장 필수 항목 승인 후 '같은 사유 반려가 줄었는지'는 승인 후 반려 기록이 있어야 알 수 있어, 지금은 보관함의 빈 항목 수만 보여 줍니다." },
  { title: "동일 내용 문서의 유사도", body: "유사도는 시드에 넣은 8차원 샘플 임베딩으로 계산합니다. 실제 문서 임베딩이 아닙니다." },
  { title: "개인 단위 평가 없음", body: "담당자 이름을 저장·표시하지 않으므로 '누가 자주 틀리나'는 볼 수 없습니다. 의도한 설계입니다." },
];

export function LimitsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="이 시스템이 하지 못하는 것" wide>
      <ol className="space-y-3">
        {LIMITATIONS.map((l, i) => (
          <li key={l.title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums text-ink-2">{i + 1}</span>
            <div>
              <div className="font-medium text-ink">{l.title}</div>
              <p className="text-sm text-ink-2">{l.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
