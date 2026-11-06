// 상단 지표 '이번 주 마감 보고서'를 누르면 홈 맨 위에 펼쳐지는 목록
import { useEffect, useRef } from "react";
import { Badge, Button, Card, CardTitle } from "../../components/ui";
import { REPORT_TYPE_LABEL } from "../../domain/workspace";
import { useApp } from "../../store";
import { dueThisWeek } from "../../workspace/drilldown";
import { useWorkspace } from "../../workspace/useWorkspace";

export function DueThisWeekPanel() {
  const ws = useWorkspace();
  const setFocus = useApp((s) => s.setFocus);
  const setTab = useApp((s) => s.setTab);
  const selectReport = useApp((s) => s.selectReport);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const list = dueThisWeek(ws);
  const rankOf = (id: string) => ws.ranked.findIndex((v) => v.report.id === id) + 1;

  return (
    <div ref={ref} className="scroll-mt-28">
      <Card className="border-accent/50">
        <CardTitle aside={<Button onClick={() => setFocus(null)}>닫기</Button>}>
          이번 주 마감 보고서 {list.length}건 <span className="ml-1 text-sm font-normal text-ink-3">({ws.metrics.week.from} ~ {ws.metrics.week.to})</span>
        </CardTitle>
        {list.length === 0 ? (
          <p className="text-sm text-ink-3">이번 주에 마감되는 보고서가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((v) => {
              const r = v.priority.readiness;
              return (
                <li key={v.report.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                  <Badge tone="info">우선순위 {rankOf(v.report.id)}위</Badge>
                  <span className="font-semibold text-ink">{v.report.title}</span>
                  <Badge>{REPORT_TYPE_LABEL[v.report.type]}</Badge>
                  <span className={`text-sm ${v.priority.daysLeft < 2 ? "font-semibold text-danger" : "text-ink-3"}`}>마감 {v.report.deadline.slice(5, 16).replace("T", " ")}</span>
                  <span className="text-sm text-ink-3">
                    약한 근거 {r.weakLinks + r.missingClaims}건 · 미작성 섹션 {r.emptySections}개
                  </span>
                  <span className="ml-auto">
                    <Button
                      variant="primary"
                      onClick={() => {
                        selectReport(v.report.id);
                        setFocus(null);
                        setTab("write");
                      }}
                    >
                      작성하러 가기
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
