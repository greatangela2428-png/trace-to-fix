// 피로도 위젯: 사람에게 얼마나 묻고, 얼마나 받아들였고, 얼마나 무시했는지(실제 클릭 집계, 이 브라우저에 저장)
import { useApp } from "../../store";
import { useWorkspace } from "../../workspace/useWorkspace";

export function FatigueWidget() {
  const ws = useWorkspace();
  const f = useApp((s) => s.fatigue);
  const reset = useApp((s) => s.resetFatigue);
  const log = useApp((s) => s.checkLog);
  // 지금 사람에게 묻고 있는 확인 요청(응답했거나 '수정 예정' 제외 전 전체)
  const asked = ws.reports.reduce((s, v) => s + v.items.filter((i) => !log[i.key] || log[i.key]!.action === "fix").length, 0);
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-ink-3" title="수용·무시는 이 브라우저에 저장된 실제 클릭 수입니다">
      <span className="hidden sm:inline">이번 세션</span>
      <span>
        확인 요청 <b className="tabular-nums text-ink-2">{asked}</b> · 수용 <b className="tabular-nums text-ok">{f.accepted}</b> · 무시 <b className="tabular-nums text-warn">{f.ignored}</b> · 자동 통과{" "}
        <b className="tabular-nums text-ink-2">{ws.metrics.autoPass}</b>
      </span>
      {(f.accepted > 0 || f.ignored > 0) && (
        <button type="button" onClick={reset} className="underline-offset-2 hover:text-ink hover:underline">
          초기화
        </button>
      )}
    </div>
  );
}
