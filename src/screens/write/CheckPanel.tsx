// 작성 중 점검: 확인 요청은 점수 상위 3개만 위에, 나머지는 '기타 N건'으로 접는다(원칙 7).
// [확인함] [수정할게요] [문제없음] — '문제없음'은 1클릭이며 로그에만 남는다. 자동 통과는 개수만 조용히.
import { useState } from "react";
import { Badge, Button, Card, CardTitle } from "../../components/ui";
import type { CheckItem } from "../../rules";
import { useApp, type CheckAction } from "../../store";
import type { Workspace } from "../../workspace/useWorkspace";
import { StatusBadge } from "../../workspace/ui";

const TOP = 3;
const ACTION_LABEL: Record<CheckAction, string> = { ack: "확인함", fix: "수정 예정", dismiss: "문제없음" };

export function CheckPanel({ ws, items, autoPass }: { ws: Workspace; items: CheckItem[]; autoPass: number }) {
  const log = useApp((s) => s.checkLog);
  const [showRest, setShowRest] = useState(false);
  // 확인함·문제없음은 목록에서 내리고, '수정 예정'은 점검이 사라질 때까지 남긴다
  const pending = items.filter((i) => !log[i.key] || log[i.key]!.action === "fix");
  const responded = items.filter((i) => log[i.key] && log[i.key]!.action !== "fix");
  const top = pending.slice(0, TOP);
  const rest = pending.slice(TOP);

  return (
    <Card>
      <CardTitle aside={<span className="text-sm text-ink-3">자동 통과 근거 {autoPass}건</span>}>확인 요청 {pending.length}건</CardTitle>
      {pending.length === 0 ? (
        <p className="text-sm text-ok">지금 확인할 항목이 없습니다.{responded.length ? ` (응답한 항목 ${responded.length}건)` : ""}</p>
      ) : (
        <ol className="space-y-3">
          {top.map((i, n) => (
            <ItemRow key={i.key} i={i} rank={n + 1} ws={ws} />
          ))}
        </ol>
      )}
      {rest.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowRest((v) => !v)} aria-expanded={showRest} className="text-sm text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            {showRest ? "접기" : `기타 ${rest.length}건 보기`}
          </button>
          {showRest && (
            <ol className="mt-2 space-y-3">
              {rest.map((i, n) => (
                <ItemRow key={i.key} i={i} rank={TOP + n + 1} ws={ws} />
              ))}
            </ol>
          )}
        </div>
      )}
      {responded.length > 0 && <Responded items={responded} />}
    </Card>
  );
}

function ItemRow({ i, rank, ws }: { i: CheckItem; rank: number; ws: Workspace }) {
  const respond = useApp((s) => s.respondCheck);
  const selectClaim = useApp((s) => s.selectClaim);
  const setEditing = useApp((s) => s.setEditingEvidence);
  const state = useApp((s) => s.checkLog[i.key]);
  const ev = i.evidenceId ? ws.byId.get(i.evidenceId) : undefined;

  return (
    <li className="rounded-2xl border border-line p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-ink-3">{rank}</span>
        <StatusBadge status={i.finding.status} finding={i.finding} />
        <Badge tone={i.impactType === "direction" ? "danger" : "neutral"}>{i.impactType === "direction" ? "방향 영향" : "크기 영향"}</Badge>
        {state?.action === "fix" && <Badge tone="info">수정 예정</Badge>}
        <span className="ml-auto text-xs tabular-nums text-ink-3" title="결론 의존도 × 근거 약함 × 되돌리기 비용 × 영향 유형 가중 × 100">
          점수 {i.score}
        </span>
      </div>
      <button type="button" onClick={() => selectClaim(i.claimId)} className="mt-1.5 block text-left text-sm text-ink hover:underline">
        {i.finding.message}
      </button>
      <p className="mt-1 text-xs text-ink-3">{i.impactLine}</p>
      {i.others.length > 0 && <p className="mt-1 text-xs text-ink-3">같은 근거에서 함께: {i.others.map((f) => f.name).join(", ")}</p>}
      <details className="mt-1 text-xs text-ink-3">
        <summary className="cursor-pointer">계산식 보기</summary>
        결론 의존도 {i.parts.dependence} × 근거 약함 {i.parts.weakness} × 되돌리기 비용 {i.parts.reversal} × 영향 유형 {i.parts.impact} × 100 = {i.score} (가중치는 초기 가정)
      </details>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button onClick={() => respond(i.key, "ack")}>확인함</Button>
        <Button
          onClick={() => {
            respond(i.key, "fix");
            selectClaim(i.claimId);
            if (ev) setEditing(ev.id);
          }}
        >
          수정할게요
        </Button>
        <Button onClick={() => respond(i.key, "dismiss")}>문제없음</Button>
      </div>
    </li>
  );
}

function Responded({ items }: { items: CheckItem[] }) {
  const log = useApp((s) => s.checkLog);
  const undo = useApp((s) => s.undoCheck);
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-sm text-ink-3 hover:text-ink">
        응답한 항목 {items.length}건 {open ? "접기" : "보기"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center gap-2 text-ink-3">
              <Badge>{ACTION_LABEL[log[i.key]!.action]}</Badge>
              <span className="min-w-0 flex-1 truncate">{i.finding.message}</span>
              <button type="button" onClick={() => undo(i.key)} className="text-xs underline">
                되돌리기
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
