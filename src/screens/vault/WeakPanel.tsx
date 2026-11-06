// 상단 지표 '약한 근거'를 누르면 보관함에 펼쳐지는 목록: 근거별로 어느 보고서·주장에서 무엇을 확인해야 하는지
import { useEffect, useRef } from "react";
import { Badge, Button, Card, CardTitle } from "../../components/ui";
import { useApp } from "../../store";
import { weakRows, type WeakRow } from "../../workspace/drilldown";
import type { Workspace } from "../../workspace/useWorkspace";
import { EvidenceMeta, StatusBadge } from "../../workspace/ui";

export function WeakPanel({ ws }: { ws: Workspace }) {
  const setFocus = useApp((s) => s.setFocus);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const rows = weakRows(ws);
  // 근거별로 묶고, 근거 없는 주장은 따로
  const byEvidence = new Map<string, WeakRow[]>();
  for (const r of rows) if (r.evidenceId) byEvidence.set(r.evidenceId, [...(byEvidence.get(r.evidenceId) ?? []), r]);
  const missing = rows.filter((r) => !r.evidenceId);

  return (
    <div ref={ref} className="scroll-mt-28">
      <Card className="border-accent/50">
        <CardTitle aside={<Button onClick={() => setFocus(null)}>닫기</Button>}>약한 근거 {rows.length}건</CardTitle>
        <p className="-mt-2 mb-3 text-xs text-ink-3">상태가 '최신'이 아닌 연결 {rows.length - missing.length}건 + 근거 없는 주장 {missing.length}건. 같은 근거를 여러 주장이 쓰면 한 근거 아래에 모았습니다.</p>
        <ul className="space-y-3">
          {[...byEvidence.entries()].map(([id, list]) => {
            const e = ws.byId.get(id);
            return (
              <li key={id} className="rounded-2xl border border-line p-3.5">
                <div className="font-semibold text-ink">{e?.title ?? id}</div>
                {e && <EvidenceMeta e={e} />}
                <ul className="mt-2 space-y-1.5">
                  {list.map((r) => (
                    <Row key={r.key} r={r} />
                  ))}
                </ul>
              </li>
            );
          })}
          {missing.length > 0 && (
            <li className="rounded-2xl border border-danger/30 p-3.5">
              <div className="font-semibold text-ink">근거 없는 주장</div>
              <ul className="mt-2 space-y-1.5">
                {missing.map((r) => (
                  <Row key={r.key} r={r} />
                ))}
              </ul>
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function Row({ r }: { r: WeakRow }) {
  const setTab = useApp((s) => s.setTab);
  const selectReport = useApp((s) => s.selectReport);
  const selectClaim = useApp((s) => s.selectClaim);
  const setFocus = useApp((s) => s.setFocus);
  return (
    <li className="flex flex-wrap items-start gap-2 text-sm">
      <StatusBadge status={r.status} finding={r.finding} />
      <div className="min-w-0 flex-1">
        <span className="text-ink-3">{r.reportTitle} · </span>
        <span className="text-ink-2">“{r.claimText}”</span>
        {r.finding && <p className="text-xs text-ink-3">{r.finding.message}</p>}
      </div>
      <Badge>{r.evidenceId ? "연결됨" : "연결 없음"}</Badge>
      <Button
        onClick={() => {
          selectReport(r.reportId);
          selectClaim(r.claimId);
          setFocus(null);
          setTab("write");
        }}
      >
        작성 화면에서 보기
      </Button>
    </li>
  );
}
