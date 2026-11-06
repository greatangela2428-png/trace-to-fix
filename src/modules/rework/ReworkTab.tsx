// ① 재작업 역추적: 사건 목록 → 타임라인 → 패턴 집계 → 개선안 + 가상 재실행
import { STAGE_LABEL, type Suggestion } from "../../domain/schemas";
import { fieldLabel, formatKRW } from "../../domain/labels";
import type { SimResult } from "../../domain/patterns";
import { caseById, patterns, traceById, traces } from "../../data";
import { seed } from "../../seed";
import { useApp } from "../../store";
import { Badge, Button, Card, CardTitle, ConfirmButton, NeedsReview, Stat } from "../../components/ui";
import { ReasonClassifier } from "./ReasonClassifier";

const KIND_LABEL = { MISSING: "누락", WRONG: "오입력" } as const;

export function ReworkTab() {
  const totalCost = seed.cases.reduce((s, c) => s + c.cost, 0);
  const suggestions = useApp((s) => s.suggestions);
  const approved = Object.values(suggestions).filter((s) => s.status === "APPROVED").length;
  const top = patterns[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="재작업·반려 건수" value={`${traces.length}건`} />
        <Stat label="누적 수정비용" value={formatKRW(totalCost)} />
        <Stat
          label="비용 1위 패턴"
          value={top ? `${fieldLabel(top.field)} ${KIND_LABEL[top.kind]}` : "-"}
          sub={top ? `${STAGE_LABEL[top.stage]} · ${top.count}건` : undefined}
        />
        <Stat label="승인된 개선 규칙" value={`${approved}개`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CaseList />
        <CaseTimeline />
      </div>

      <PatternTable />
      <SuggestionPanel />
    </div>
  );
}

function CaseList() {
  const selected = useApp((s) => s.selectedCaseId);
  const select = useApp((s) => s.selectCase);
  return (
    <Card>
      <CardTitle aside={<span className="text-sm text-ink-3">{traces.length}건</span>}>사건 목록</CardTitle>
      <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {traces.map((t) => {
          const c = caseById.get(t.caseId)!;
          const active = t.caseId === selected;
          return (
            <li key={t.caseId}>
              <button
                type="button"
                onClick={() => select(t.caseId)}
                aria-pressed={active}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition ${
                  active ? "border-accent/50 bg-info-soft" : "border-transparent hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">{c.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-3">{formatKRW(c.cost)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{fieldLabel(t.field)}</Badge>
                  <Badge tone={t.kind === "MISSING" ? "danger" : "warn"}>{KIND_LABEL[t.kind]}</Badge>
                  <Badge>원인: {STAGE_LABEL[t.originStage]}</Badge>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CaseTimeline() {
  const id = useApp((s) => s.selectedCaseId);
  const t = id ? traceById.get(id) : undefined;
  const c = id ? caseById.get(id) : undefined;
  if (!t || !c)
    return (
      <Card>
        <p className="text-ink-3">사건을 선택하세요.</p>
      </Card>
    );

  return (
    <Card>
      <CardTitle aside={<NeedsReview />}>단계별 타임라인 · {c.label}</CardTitle>
      <p className="mb-5 text-ink-2">
        <b className="font-semibold text-ink">{fieldLabel(t.field)}</b> 정답 값{" "}
        <code className="break-all rounded-md bg-surface-2 px-1.5 py-0.5 text-sm text-ink">{c.correctValue}</code>
      </p>
      <ol className="grid gap-3 sm:grid-cols-4">
        {t.steps.map((s, i) => {
          const style =
            s.status === "ORIGIN"
              ? "border-danger/60 bg-danger-soft"
              : s.status === "ERROR"
                ? "border-warn/30 bg-warn-soft"
                : "border-line bg-surface-2";
          return (
            <li key={s.stage} className={`rounded-xl border p-3.5 ${style}`}>
              <div className="text-sm text-ink-3">
                {i + 1}. {STAGE_LABEL[s.stage]}
              </div>
              <div className="mt-1 break-words text-ink">
                {s.value === "" ? <span className="text-danger">(비어 있음)</span> : s.value}
              </div>
              <div className="mt-2.5">
                {s.status === "ORIGIN" && <Badge tone="danger">최초 원인(추정)</Badge>}
                {s.status === "ERROR" && <Badge tone="warn">오류 이어짐</Badge>}
                {s.status === "OK" && <Badge tone="ok">정상</Badge>}
              </div>
            </li>
          );
        })}
      </ol>
      {c.reworkText && <ReasonClassifier key={c.id} caseId={c.id} text={c.reworkText} existing={c.reasonCode} />}
    </Card>
  );
}

function PatternTable() {
  const selected = useApp((s) => s.selectedPatternKey);
  const select = useApp((s) => s.selectPattern);
  const max = Math.max(...patterns.map((p) => p.totalCost));
  return (
    <Card>
      <CardTitle aside={<span className="text-sm text-ink-3">원인 단계 · 필드 · 유형별, 비용순 · 행을 누르면 개선안</span>}>
        패턴 집계
      </CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <thead className="text-left text-sm text-ink-3">
            <tr>
              <th className="py-2 font-normal">원인 단계</th>
              <th className="font-normal">필드</th>
              <th className="font-normal">유형</th>
              <th className="text-right font-normal">건수</th>
              <th className="w-2/5 pl-5 font-normal">누적 비용</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((p, i) => {
              const active = p.key === selected;
              return (
                <tr
                  key={p.key}
                  onClick={() => select(p.key)}
                  className={`cursor-pointer border-t border-line ${active ? "bg-info-soft" : "hover:bg-surface-2"}`}
                >
                  <td className="py-2.5 pl-2">
                    <button type="button" className="text-left text-ink" onClick={() => select(p.key)} aria-pressed={active}>
                      {STAGE_LABEL[p.stage]}
                    </button>
                  </td>
                  <td className="text-ink">{fieldLabel(p.field)}</td>
                  <td>
                    <Badge tone={p.kind === "MISSING" ? "danger" : "warn"}>{KIND_LABEL[p.kind]}</Badge>
                  </td>
                  <td className="text-right tabular-nums text-ink">{p.count}</td>
                  <td className="pl-5 pr-2">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full rounded-full ${i === 0 ? "bg-danger" : "bg-warn/70"}`}
                          style={{ width: `${(p.totalCost / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm tabular-nums text-ink-2">{formatKRW(p.totalCost)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const SUGGESTION_KIND_LABEL: Record<Suggestion["kind"], string> = {
  REQUIRED_FIELD: "필수 항목화",
  PRE_CHECK: "사전 점검 질문",
  CHECKLIST: "체크리스트",
  CROSS_CHECK: "서류 간 자동 대조",
  NAMING_RULE: "제목 규칙",
  SINGLE_SOURCE: "원본 하나로 연결",
  PAUSE_PROCEDURE: "시범 중단",
};

function SuggestionPanel() {
  const key = useApp((s) => s.selectedPatternKey);
  const all = useApp((s) => s.suggestions);
  const pattern = patterns.find((p) => p.key === key);
  if (!pattern) return null;
  const list = Object.values(all).filter((s) => s.patternKey === key);

  return (
    <Card>
      <CardTitle aside={<NeedsReview />}>
        개선안 · {STAGE_LABEL[pattern.stage]} {fieldLabel(pattern.field)} {KIND_LABEL[pattern.kind]} ({pattern.count}건)
      </CardTitle>
      <p className="mb-5 text-ink-2">
        사람이 승인하기 전에는 어떤 규칙도 양식에 반영되지 않습니다.
        {pattern.kind === "WRONG" && " 오입력은 필수 항목으로 만들어도 막을 수 없어 대조·확인 방식으로 제안합니다."}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => (
          <SuggestionCard key={s.id} s={s} />
        ))}
      </div>
    </Card>
  );
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const sim = useApp((st) => st.simulations[s.id]);
  const run = useApp((st) => st.runSimulation);
  const approve = useApp((st) => st.approve);
  const reject = useApp((st) => st.reject);

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="info">{SUGGESTION_KIND_LABEL[s.kind]}</Badge>
        {s.status === "APPROVED" && <Badge tone="ok">승인됨</Badge>}
        {s.status === "REJECTED" && <Badge>반려됨</Badge>}
      </div>
      <p className="mt-2.5 flex-1 text-ink">{s.description}</p>

      {sim && <SimView sim={sim} />}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => run(s.id)}>{sim ? "다시 실행" : "가상 재실행"}</Button>
        {s.status === "PROPOSED" && (
          <>
            <ConfirmButton label="승인" confirmLabel="승인 확정" onConfirm={() => approve(s.id)} />
            <Button onClick={() => reject(s.id)}>반려</Button>
          </>
        )}
      </div>
      {s.appliedAt && (
        <p className="mt-2 text-sm text-ink-3">승인 시각 {new Date(s.appliedAt).toLocaleString("ko-KR")}</p>
      )}
    </div>
  );
}

function SimView({ sim }: { sim: SimResult }) {
  if (!sim.estimable) return <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-ink-2">{sim.note}</p>;
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
      {sim.prevented.length > 0 || sim.detectable.length === 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold text-ok">예방 가능 {sim.prevented.length}건</span>
          <span className="text-ink">절감 {formatKRW(sim.savedCost)}</span>
          <span className="text-ink-3">(추정)</span>
        </div>
      ) : null}
      {sim.detectable.length > 0 && <div className="font-semibold text-info">조기 발견 가능 {sim.detectable.length}건</div>}
      {sim.note && <p className="text-ink-2">{sim.note}</p>}
      {sim.outOfScope.length > 0 && (
        <ul className="space-y-0.5 text-ink-2">
          {sim.outOfScope.map((o) => (
            <li key={o.caseId}>
              · {caseById.get(o.caseId)?.label}: {o.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
