// 업무 TODO: 지금 먼저 처리할 일을 실시간으로 보여 준다. 상태가 바뀌면 해결된 일은 빠지고 순서가 다시 정렬된다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardTitle, ConfirmButton } from "../../components/ui";
import { TODO_KIND_LABEL, buildTodos, type Todo, type TodoKind } from "../../domain/todo";
import { useApp } from "../../store";
import { useWorkspace } from "../../workspace/useWorkspace";
import { requiredLabel } from "../../workspace/ui";

const TOP = 7;
const KIND_TONE: Record<TodoKind, "danger" | "warn" | "info" | "neutral" | "ok"> = {
  check: "danger",
  link: "danger",
  write: "info",
  vault: "warn",
  dedupe: "neutral",
  decide: "neutral",
};
const dday = (d?: number) => (d === undefined ? "" : d < 0 ? "마감 지남" : d < 1 ? "오늘 마감" : `D-${Math.floor(d)}`);

export function TodoPanel() {
  const ws = useWorkspace();
  const checkLog = useApp((s) => s.checkLog);
  const decisions = useApp((s) => s.zombieDecisions);
  const [showAll, setShowAll] = useState(false);

  const todos = useMemo(
    () =>
      buildTodos({
        reports: ws.reports.map((v) => ({ report: v.report, priority: v.priority, items: v.items, sections: v.report.sections })),
        evidence: ws.evidence,
        duplicates: ws.duplicates,
        unread: ws.unread,
        checkLog,
        decided: new Set(Object.keys(decisions)),
        evidenceTitle: (id) => ws.byId.get(id)?.title ?? id,
        requiredLabel,
      }),
    [ws, checkLog, decisions],
  );

  // 방금 해결된 일: 직전 목록엔 있었는데 지금은 없는 것(상태가 바뀌어 자동으로 빠진 일)
  const prev = useRef<Map<string, Todo>>(new Map(todos.map((t) => [t.key, t])));
  const [resolved, setResolved] = useState<Todo[]>([]);
  useEffect(() => {
    const now = new Set(todos.map((t) => t.key));
    const gone = [...prev.current.values()].filter((t) => !now.has(t.key));
    if (gone.length) setResolved((r) => [...gone, ...r].slice(0, 5));
    prev.current = new Map(todos.map((t) => [t.key, t]));
  }, [todos]);

  const shown = showAll ? todos : todos.slice(0, TOP);
  const urgent = todos.filter((t) => t.daysLeft !== undefined && t.daysLeft < 2).length;

  return (
    <Card>
      <CardTitle aside={<span className="text-sm text-ink-3">남은 일 {todos.length}건{urgent ? ` · 마감 2일 안 ${urgent}건` : ""}</span>}>업무 TODO</CardTitle>
      <p className="-mt-2 mb-3 text-xs text-ink-3">
        보고서 우선순위와 근거 상태로 계산한 목록입니다. 근거를 고치거나 연결하면, 섹션을 쓰면, 결정을 내리면 그 일은 자동으로 빠집니다. 점수 = 보고서 점수 × 일 종류 가중치(초기 가정).
      </p>
      {todos.length === 0 ? (
        <p className="text-sm text-ok">지금 처리할 일이 없습니다.</p>
      ) : (
        <ol className="divide-y divide-line">
          {shown.map((t, i) => (
            <TodoRow key={t.key} t={t} rank={i + 1} />
          ))}
        </ol>
      )}
      {todos.length > TOP && (
        <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="mt-2 text-sm text-ink-3 hover:text-ink hover:underline">
          {showAll ? "접기" : `더 보기 · ${todos.length - TOP}건`}
        </button>
      )}
      {resolved.length > 0 && (
        <div className="mt-3 rounded-2xl bg-ok-soft px-3 py-2 text-sm text-ok" role="status" aria-live="polite">
          방금 해결됨: {resolved.map((t) => t.title).slice(0, 2).join(" · ")}
          {resolved.length > 2 ? ` 외 ${resolved.length - 2}건` : ""}
          <button type="button" onClick={() => setResolved([])} className="ml-2 text-xs underline">
            지우기
          </button>
        </div>
      )}
    </Card>
  );
}

function TodoRow({ t, rank }: { t: Todo; rank: number }) {
  const setTab = useApp((s) => s.setTab);
  const selectReport = useApp((s) => s.selectReport);
  const selectClaim = useApp((s) => s.selectClaim);
  const setEditing = useApp((s) => s.setEditingEvidence);
  const respond = useApp((s) => s.respondCheck);
  const decide = useApp((s) => s.decideZombie);

  const go = () => {
    const tg = t.target;
    if (tg.tab === "write") {
      selectReport(tg.reportId);
      if (tg.claimId) selectClaim(tg.claimId);
      if (t.pendingFix && tg.evidenceId) setEditing(tg.evidenceId);
    }
    if (tg.tab !== "home") setTab(tg.tab);
  };

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-3">
      <span className="w-5 pt-0.5 text-sm font-semibold tabular-nums text-ink-3">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={KIND_TONE[t.kind]}>{TODO_KIND_LABEL[t.kind]}</Badge>
          {t.pendingFix && <Badge tone="info">수정 예정</Badge>}
          {t.daysLeft !== undefined && <span className={`text-xs ${t.daysLeft < 2 ? "font-semibold text-danger" : "text-ink-3"}`}>{dday(t.daysLeft)}</span>}
          <span className="text-xs text-ink-3">{t.context}</span>
        </div>
        <p className="mt-1 text-sm text-ink">{t.title}</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {t.why} · 점수 {t.score}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {t.kind === "decide" && t.procedureId ? (
          <>
            <ConfirmButton label="시범 중단" confirmLabel="수신자 확인 후 3개월 중단" onConfirm={() => decide(t.procedureId!, "PAUSE_APPROVED")} />
            <Button onClick={() => decide(t.procedureId!, "SAMPLE_AUDIT")}>표본 감사</Button>
            <Button onClick={() => decide(t.procedureId!, "KEEP")}>유지</Button>
          </>
        ) : (
          <>
            {t.kind === "check" && <Button onClick={() => t.itemKeys?.forEach((k) => respond(k, "ack"))}>확인함</Button>}
            <Button variant="primary" onClick={go}>
              바로 가기
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
