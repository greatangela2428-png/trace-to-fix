// 오늘의 보고서: 우선순위 상위 3건을 크게, 왜 그 순위인지와 준비 상태를 함께 보여 준다.
// 근거 수정·연결, 문장 수정, 마감 변경, 기준일 경과가 생기면 순위가 다시 계산되고 변동이 표시된다.
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardTitle } from "../../components/ui";
import { DEFAULT_WEIGHTS, type Weights } from "../../domain/priority";
import { REPORT_TYPE_LABEL } from "../../domain/workspace";
import { useApp, ZOMBIE_DECISION_LABEL } from "../../store";
import { useWorkspace, type ReportView } from "../../workspace/useWorkspace";
import { SampleNotice } from "../../workspace/ui";
import { TodoPanel } from "./TodoPanel";
import { DueThisWeekPanel } from "./DueThisWeekPanel";

const FACTOR_LABEL: Record<keyof Weights, string> = {
  impact: "의사결정 영향도",
  urgency: "마감 임박도",
  unreadiness: "준비 부족도",
  audience: "독자 중요도",
};

const fmtDeadline = (iso: string) => iso.slice(5, 16).replace("T", " ");
const dday = (d: number) => (d < 0 ? "마감 지남" : d < 1 ? "오늘 마감" : `D-${Math.floor(d)}`);

/** 직전 순위와 비교해 오르내림을 표시한다 */
function useRankMovement(ids: string[]) {
  const prev = useRef<string[]>(ids);
  const moves = Object.fromEntries(ids.map((id, i) => [id, prev.current.indexOf(id) === -1 ? 0 : prev.current.indexOf(id) - i]));
  useEffect(() => {
    prev.current = ids;
  });
  return moves;
}

export function HomeTab() {
  const ws = useWorkspace();
  const offset = useApp((s) => s.ws.clockOffsetDays);
  const shift = useApp((s) => s.shiftClock);
  const focus = useApp((s) => s.focus);
  const [more, setMore] = useState(false);
  const moves = useRankMovement(ws.ranked.map((v) => v.report.id));
  const top = ws.ranked.slice(0, 3);
  const rest = ws.ranked.slice(3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">오늘의 보고서</h2>
          <p className="text-sm text-ink-3">
            {ws.asOf} 09:00 기준 · 지금 가장 중요한 보고서부터 씁니다{offset ? ` (시연: 기준일 +${offset}일)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-3">시연용</span>
          <Button onClick={() => shift(1)}>기준일 하루 넘기기</Button>
          {offset > 0 && <Button onClick={() => shift(-offset)}>되돌리기</Button>}
        </div>
      </div>
      <SampleNotice>우선순위 가중치와 점수 식은 초기 가정입니다.</SampleNotice>

      {focus === "dueThisWeek" && <DueThisWeekPanel />}

      <TodoPanel />

      <MetricFormulas />

      {top.length === 0 && (
        <Card>
          <p className="text-ink-2">아직 보고서가 없습니다. 작성 탭에서 보고서를 시작하면 여기서 우선순위대로 보여 줍니다.</p>
        </Card>
      )}
      <ol className="grid gap-4 lg:grid-cols-3">
        {top.map((v, i) => (
          <li key={v.report.id}>
            <ReportCard v={v} rank={i + 1} move={moves[v.report.id] ?? 0} />
          </li>
        ))}
      </ol>

      {rest.length > 0 && (
        <Card>
          <button type="button" onClick={() => setMore((x) => !x)} aria-expanded={more} className="text-sm font-semibold text-ink-2 hover:text-ink">
            {more ? "접기" : `더 보기 · 나머지 보고서 ${rest.length}건`}
          </button>
          {more && (
            <ul className="mt-3 divide-y divide-line">
              {rest.map((v, i) => (
                <RestRow key={v.report.id} v={v} rank={i + 4} move={moves[v.report.id] ?? 0} />
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <WeightPanel />
        <UnreadPanel />
      </div>
    </div>
  );
}

function Move({ move }: { move: number }) {
  if (!move) return null;
  return <Badge tone={move > 0 ? "ok" : "neutral"}>{move > 0 ? `▲${move}` : `▼${-move}`}</Badge>;
}

function ReportCard({ v, rank, move }: { v: ReportView; rank: number; move: number }) {
  const { report, priority: p } = v;
  const setTab = useApp((s) => s.setTab);
  const selectReport = useApp((s) => s.selectReport);
  const updateDeadline = useApp((s) => s.updateDeadline);
  const r = p.readiness;
  const go = () => {
    selectReport(report.id);
    setTab("write");
  };

  return (
    <Card className={`flex h-full flex-col ${rank === 1 ? "border-accent/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">{rank}</span>
        <Badge>{REPORT_TYPE_LABEL[report.type]}</Badge>
        <Move move={move} />
        <span className="ml-auto text-sm tabular-nums text-ink-3">점수 {p.score}</span>
      </div>
      <h3 className="mt-3 text-lg font-bold leading-snug tracking-tight text-ink">{report.title}</h3>
      <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-3">
        <span className={p.daysLeft < 2 ? "font-semibold text-danger" : ""}>
          {dday(p.daysLeft)} · {fmtDeadline(report.deadline)}
        </span>
        <span>{report.decisionImpactKrw !== undefined ? `걸린 금액 ${report.decisionImpactKrw.toLocaleString("ko-KR")}원` : "걸린 금액 없음"}</span>
      </div>

      <section className="mt-4">
        <h4 className="text-sm font-semibold text-ink-2">왜 {rank}순위인가</h4>
        <ul className="mt-1 space-y-0.5 text-sm text-ink-2">
          {p.reasonLines.slice(0, 4).map((l) => (
            <li key={l} className={l.startsWith("순위를 낮춘") ? "text-warn" : ""}>
              · {l}
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5">
          {(Object.keys(FACTOR_LABEL) as (keyof Weights)[]).map((k) => (
            <div key={k} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <dt className="text-ink-3">{FACTOR_LABEL[k]}</dt>
              <dd className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${p.breakdown[k] * 100}%` }} />
              </dd>
              <dd className="text-right tabular-nums text-ink-2">{p.breakdown[k].toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-4 rounded-2xl bg-surface-2/60 p-3 text-sm">
        <h4 className="font-semibold text-ink-2">준비 상태</h4>
        <ul className="mt-1 space-y-0.5 text-ink-2">
          <li>
            근거 연결 {r.claimsLinked}/{r.claims} 주장
          </li>
          <li className={r.weakLinks + r.missingClaims ? "text-warn" : "text-ok"}>약한 근거 {r.weakLinks + r.missingClaims}건</li>
          <li>
            미작성 섹션 {r.emptySections}개{r.draftSections ? ` · 작성 중 ${r.draftSections}개` : ""}
          </li>
        </ul>
      </section>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <Button variant="primary" onClick={go}>
          작성하러 가기
        </Button>
        <label className="ml-auto text-xs text-ink-3">
          마감{" "}
          <input
            type="date"
            value={report.deadline.slice(0, 10)}
            onChange={(e) => e.target.value && updateDeadline(report.id, `${e.target.value}${report.deadline.slice(10)}`)}
            className="rounded-lg border border-line bg-surface px-1.5 py-0.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={`${report.title} 마감일`}
          />
        </label>
      </div>
    </Card>
  );
}

function RestRow({ v, rank, move }: { v: ReportView; rank: number; move: number }) {
  const setTab = useApp((s) => s.setTab);
  const selectReport = useApp((s) => s.selectReport);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <span className="w-6 text-sm font-semibold tabular-nums text-ink-3">{rank}</span>
      <span className="font-medium text-ink">{v.report.title}</span>
      <Move move={move} />
      <span className="text-sm text-ink-3">
        {dday(v.priority.daysLeft)} · 점수 {v.priority.score} · {v.priority.reasonLines[0]}
      </span>
      <span className="ml-auto">
        <Button
          onClick={() => {
            selectReport(v.report.id);
            setTab("write");
          }}
        >
          작성
        </Button>
      </span>
    </li>
  );
}

function MetricFormulas() {
  const ws = useWorkspace();
  const m = ws.metrics;
  return (
    <details className="rounded-2xl border border-line px-4 py-2.5 text-sm text-ink-3">
      <summary className="cursor-pointer text-ink-2">상단 지표 계산식 보기</summary>
      <ul className="mt-2 space-y-1">
        <li>이번 주 마감 보고서 {m.dueThisWeek}건 = 마감일이 {m.week.from}(월)~{m.week.to}(일)인 보고서 수</li>
        <li>
          근거 준비도 {m.readinessPct}% = 자동 통과 근거 {m.autoPass} ÷ (연결된 근거 {m.totalSlots - ws.reports.reduce((s, v) => s + v.priority.readiness.missingClaims, 0)} + 근거 없는 주장{" "}
          {ws.reports.reduce((s, v) => s + v.priority.readiness.missingClaims, 0)})
        </li>
        <li>약한 근거 {m.weak}건 = 상태가 '최신'이 아닌 연결 + 근거 없는 주장</li>
        <li>자동 통과 근거 {m.autoPass}건 = 모든 점검 규칙을 통과한 연결(사람 확인 요청 없음)</li>
      </ul>
    </details>
  );
}

function WeightPanel() {
  const w = useApp((s) => s.ws.weights);
  const setWeights = useApp((s) => s.setWeights);
  return (
    <Card>
      <CardTitle aside={<Badge tone="warn">초기 가정</Badge>}>우선순위 가중치</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-ink-3">
        점수 = 100 × 영향도<sup>w1</sup> × 마감 임박도<sup>w2</sup> × 준비 부족도<sup>w3</sup> × 독자 중요도<sup>w4</sup>. 각 요소는 0.1~1이고 가중치는 처음에 모두 1입니다. 0으로 두면 그 요소는
        순위에 영향을 주지 않습니다. 실제 운영에서는 팀이 합의해 정해야 합니다.
      </p>
      <div className="space-y-3">
        {(Object.keys(FACTOR_LABEL) as (keyof Weights)[]).map((k) => (
          <label key={k} className="block text-sm">
            <span className="flex justify-between text-ink-3">
              {FACTOR_LABEL[k]} <span className="tabular-nums text-ink">{w[k].toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={w[k]}
              onChange={(e) => setWeights({ [k]: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
              aria-label={`${FACTOR_LABEL[k]} 가중치`}
            />
          </label>
        ))}
      </div>
      <div className="mt-3">
        <Button onClick={() => setWeights(DEFAULT_WEIGHTS)}>처음 값으로</Button>
      </div>
    </Card>
  );
}

function UnreadPanel() {
  const ws = useWorkspace();
  const decisions = useApp((s) => s.zombieDecisions);
  const undo = useApp((s) => s.undoZombie);
  return (
    <Card>
      <CardTitle aside={<Badge>업무 관성</Badge>}>읽히지 않는 보고서·항목</CardTitle>
      <p className="mb-3 text-xs text-ink-3">최근 12개월 시스템 로그 기준(인쇄·구두 공유 미포함). 빼거나 줄이는 결정은 사람이 하며, 업무 TODO의 [시범 중단]·[유지]로 내립니다.</p>
      <ul className="space-y-3">
        {ws.unread.map((u) => (
          <li key={u.procedureId} className={`rounded-2xl border p-3 ${u.protectedBy ? "border-ok/40" : "border-line"}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-ink">{u.name}</span>
              {u.protectedBy ? <Badge tone="ok">보호 · 재작업 원인 필드</Badge> : <Badge tone="warn">{u.kind === "REPORT" ? "순위 낮춤" : "양식에서 뺄지 확인"}</Badge>}
              {decisions[u.procedureId] && (
                <>
                  <Badge tone="info">결정: {ZOMBIE_DECISION_LABEL[decisions[u.procedureId]!.decision]}</Badge>
                  <button type="button" onClick={() => undo(u.procedureId)} className="text-xs text-ink-3 underline">
                    되돌리기
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {u.executed}회 {u.kind === "REPORT" ? "작성" : "입력"} · {u.kind === "REPORT" ? "열람" : "후속 참조"} {u.outcomes}회
            </p>
            <p className={`mt-1 text-sm ${u.protectedBy ? "text-ok" : "text-ink-3"}`}>{u.question}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
