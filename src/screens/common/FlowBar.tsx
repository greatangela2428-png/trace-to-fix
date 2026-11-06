// 흐름 단계 표시: 저장 → 작성 → 점검 → 제출 → 개선. 지금 화면이 어느 단계인지와 홈으로 돌아가기.
import { useApp, type TabId } from "../../store";

const STEPS: { label: string; tab?: TabId; tabs: TabId[] }[] = [
  { label: "저장", tab: "vault", tabs: ["vault", "docs"] },
  { label: "작성", tab: "write", tabs: ["write"] },
  { label: "점검", tab: "write", tabs: ["write", "logic"] },
  { label: "제출", tabs: [] }, // 제출은 이 도구 밖(그룹웨어 등)
  { label: "개선", tab: "rework", tabs: ["rework", "docs"] },
];

export function FlowBar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  if (tab === "home") return null;
  return (
    <nav aria-label="작성 흐름" className="mb-4 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setTab("home")} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink">
        ← 오늘의 보고서
      </button>
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {STEPS.map((s, i) => {
          const on = s.tabs.includes(tab);
          return (
            <li key={s.label} className="flex items-center gap-1">
              {s.tab ? (
                <button
                  type="button"
                  onClick={() => setTab(s.tab!)}
                  aria-current={on ? "step" : undefined}
                  className={`rounded-full px-2.5 py-1 transition ${on ? "bg-accent font-semibold text-on-accent" : "text-ink-3 hover:bg-surface-2 hover:text-ink"}`}
                >
                  {s.label}
                </button>
              ) : (
                <span className="rounded-full px-2.5 py-1 text-ink-3" title="제출은 이 도구 밖에서 합니다">
                  {s.label}
                </span>
              )}
              {i < STEPS.length - 1 && <span className="text-ink-3">→</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
