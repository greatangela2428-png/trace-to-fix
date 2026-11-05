import { useState } from "react";
import { useApp, type TabId } from "./store";
import { ReworkTab } from "./modules/rework/ReworkTab";
import { ZombieTab } from "./modules/zombie/ZombieTab";
import { Badge, Card } from "./components/ui";
import { currentTheme, saveTheme, type Theme } from "./theme";

const TABS: { id: TabId; label: string }[] = [
  { id: "rework", label: "① 재작업 역추적" },
  { id: "logic", label: "② 논리 역추적" },
  { id: "docs", label: "③ 동일 내용 문서" },
  { id: "zombie", label: "④ 업무 관성 탐지" },
];

function Placeholder({ step }: { step: string }) {
  return (
    <Card>
      <p className="text-ink-2">{step}에서 구현합니다.</p>
    </Card>
  );
}

export default function App() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };

  return (
    <div className="gutter min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pt-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">업무 역추적 시스템</h1>
          <p className="mt-0.5 text-ink-3">오류를 고치는 대신, 오류가 생기는 입구를 고칩니다.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 원칙 2: 개인명은 저장도 표시도 하지 않으므로 끌 수 없는 고정 표시로 둔다 */}
          <Badge tone="ok">개인명 비표시 · 항상 켜짐</Badge>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg border border-line px-3 py-1 text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={theme === "dark" ? "밝은 화면으로 전환" : "어두운 화면으로 전환"}
          >
            {theme === "dark" ? "밝게" : "어둡게"}
          </button>
        </div>
      </header>

      <nav className="mx-auto mt-6 max-w-6xl" aria-label="모듈">
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 transition ${
                  active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl py-6">
        {tab === "rework" && <ReworkTab />}
        {tab === "logic" && <Placeholder step="3단계" />}
        {tab === "docs" && <Placeholder step="4단계" />}
        {tab === "zombie" && <ZombieTab />}
      </main>
    </div>
  );
}
