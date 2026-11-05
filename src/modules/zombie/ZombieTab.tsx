// ④ 업무 관성 탐지: 결과가 쓰이지 않는 승인·보고·입력 항목을 폐지 후보로 제안한다.
import { STAGE_LABEL } from "../../domain/schemas";
import {
  EXECUTED_LABEL,
  KIND_LABEL,
  OUTCOME_LABEL,
  ZOMBIE_STATUS_LABEL,
  type ZombieFinding,
  type ZombieStatus,
} from "../../domain/zombie";
import { procedureById, zombieFindings } from "../../data";
import { useApp } from "../../store";
import { Badge, Button, Card, ConfirmButton, NeedsReview, Stat } from "../../components/ui";

const STATUS_TONE: Record<ZombieStatus, "danger" | "warn" | "ok" | "neutral"> = {
  CANDIDATE: "danger",
  HOLD: "warn",
  KEEP: "ok",
  EXCLUDED: "neutral",
};

const ym = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;

export function ZombieTab() {
  const decisions = useApp((s) => s.zombieDecisions);
  const candidates = zombieFindings.filter((f) => f.status === "CANDIDATE");
  const hours = candidates.reduce((s, f) => s + f.hoursPerYear, 0);
  const paused = Object.values(decisions).filter((d) => d.decision === "PAUSE_APPROVED").length;
  const unknownOrigin = zombieFindings.filter((f) => f.originUnknown).length;

  return (
    <div className="space-y-6">
      <Card>
        <p className="leading-relaxed text-ink-2">
          업무를 더하는 대신 <b className="font-semibold text-ink">빼는</b> 모듈입니다. 승인·보고·입력 항목마다 왜 생겼는지,
          결과가 마지막으로 쓰인 때가 언제인지 추적해{" "}
          <b className="font-semibold text-ink">12개월 동안 결과가 한 번도 쓰이지 않은 절차</b>를 폐지 후보로 제안합니다.
          법정 절차, 재작업 원인 필드, 실행이 드문 통제는 후보에서 뺍니다. 폐지 대신{" "}
          <b className="font-semibold text-ink">3개월 시범 중단</b> 후 재평가하도록 제안해 되돌릴 수 있게 합니다.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="추적 중인 절차" value={`${zombieFindings.length}개`} />
        <Stat label="폐지 후보" value={`${candidates.length}개`} />
        <Stat label="후보 연간 처리 시간" value={`${hours.toLocaleString("ko-KR")}시간`} sub="승인 대기 시간 제외" />
        <Stat label="시범 중단 승인" value={`${paused}개`} sub={`도입 이유 미기록 ${unknownOrigin}개`} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {zombieFindings.map((f) => (
          <ProcedureCard key={f.procedureId} f={f} />
        ))}
      </div>
    </div>
  );
}

function ProcedureCard({ f }: { f: ZombieFinding }) {
  const p = procedureById.get(f.procedureId)!;
  const decision = useApp((s) => s.zombieDecisions[f.procedureId]);
  const decide = useApp((s) => s.decideZombie);
  const undo = useApp((s) => s.undoZombie);
  const maxExec = Math.max(1, ...f.monthly.map((m) => m.executed));
  const stale = f.monthsSinceLastOutcome === null || f.monthsSinceLastOutcome > 12;

  return (
    <Card className={f.status === "CANDIDATE" ? "border-l-4 border-l-danger/70" : ""}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[f.status]}>{ZOMBIE_STATUS_LABEL[f.status]}</Badge>
        <Badge>{KIND_LABEL[p.kind]}</Badge>
        <Badge>{p.dept}</Badge>
        {p.stage && <Badge>{STAGE_LABEL[p.stage]}</Badge>}
        {f.status === "CANDIDATE" && <NeedsReview />}
      </div>
      <h3 className="mt-3 text-[1.05rem] font-semibold text-ink">{p.name}</h3>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-ink-3">도입 이유</dt>
        <dd>
          {p.originReason ? (
            <span className="text-ink">
              {p.originReason}
              <span className="text-ink-3"> ({p.introducedAt.slice(0, 4)}년{p.originRef ? ` · ${p.originRef}` : ""})</span>
            </span>
          ) : (
            <span className="text-warn">기록 없음 — 도입 배경 확인 필요</span>
          )}
        </dd>
        <dt className="text-ink-3">마지막 결과 활용</dt>
        <dd className={stale ? "text-danger" : "text-ink"}>
          {f.lastOutcomeMonth
            ? `${ym(f.lastOutcomeMonth)} (${f.monthsSinceLastOutcome}개월 전, ${OUTCOME_LABEL[p.kind]})`
            : "기록 없음"}
        </dd>
        <dt className="text-ink-3">최근 12개월</dt>
        <dd className="text-ink">
          {EXECUTED_LABEL[p.kind]} {f.executed}건 · {OUTCOME_LABEL[p.kind]} {f.outcomes}건 · 처리 {f.hoursPerYear}시간
          {p.avgWaitHours !== undefined && ` · 평균 대기 ${p.avgWaitHours}시간`}
        </dd>
      </dl>

      {/* 월별 실행(막대)과 결과 활용(점) */}
      <div className="mt-4" aria-label="최근 12개월 월별 실행 건수와 결과 활용">
        <div className="flex h-10 gap-1">
          {f.monthly.map((m) => (
            <div
              key={m.month}
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={`${ym(m.month)}: ${EXECUTED_LABEL[p.kind]} ${m.executed}, ${OUTCOME_LABEL[p.kind]} ${m.outcome}`}
            >
              {m.outcome > 0 && <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-ok" />}
              <div
                className="w-full rounded-sm bg-ink-3/35"
                style={{ height: `${(m.executed / maxExec) * 100}%`, minHeight: m.executed ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-ink-3">
          <span>{ym(f.monthly[0]!.month)}</span>
          <span>
            막대: {EXECUTED_LABEL[p.kind]} · 점: {OUTCOME_LABEL[p.kind]}
          </span>
          <span>{ym(f.monthly[f.monthly.length - 1]!.month)}</span>
        </div>
      </div>

      <ul className="mt-4 space-y-0.5 text-ink-2">
        {f.reasons.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>

      {f.status === "CANDIDATE" && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {decision ? (
            <>
              <Badge tone={decision.decision === "PAUSE_APPROVED" ? "ok" : "neutral"}>
                {decision.decision === "PAUSE_APPROVED" ? "3개월 시범 중단 승인됨" : "유지 결정"}
              </Badge>
              <Button onClick={() => undo(f.procedureId)}>되돌리기</Button>
            </>
          ) : (
            <>
              <ConfirmButton
                label="3개월 시범 중단"
                confirmLabel="시범 중단 승인"
                onConfirm={() => decide(f.procedureId, "PAUSE_APPROVED")}
              />
              <Button onClick={() => decide(f.procedureId, "KEEP")}>유지</Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
