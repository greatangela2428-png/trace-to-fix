import { useState, type ReactNode } from "react";
import { useApp, type TabId } from "./store";
import { ReworkTab } from "./modules/rework/ReworkTab";
import { LogicTab } from "./modules/logic/LogicTab";
import { WriteTab } from "./screens/write/WriteTab";
import { VaultTab } from "./screens/vault/VaultTab";
import { DocsTab } from "./modules/docs/DocsTab";
import { HomeTab } from "./screens/home/HomeTab";
import { useWorkspace } from "./workspace/useWorkspace";
import { PortScene, icons } from "./components/infographics";
import { ExportDialog } from "./export/ExportDialog";
import { currentTheme, saveTheme, type Theme } from "./theme";

interface TabDef {
  id: TabId;
  label: string;
  icon: (c?: string) => ReactNode;
}

/** 위 줄: 보고서 작성 흐름 */
const MAIN_TABS: TabDef[] = [
  { id: "home", label: "오늘의 보고서", icon: icons.anchor },
  { id: "write", label: "작성", icon: icons.doc },
  { id: "vault", label: "근거 보관함", icon: icons.container },
  { id: "docs", label: "동일 내용 문서", icon: icons.layers },
];

/** 아래 줄: 분석 도구(기존 상세 화면) */
const TOOL_TABS: TabDef[] = [
  { id: "rework", label: "재작업 역추적", icon: icons.route },
  { id: "logic", label: "논리 역추적", icon: icons.layers },
];

/** 첫 화면 요약: 항만 일러스트 + 상단 지표 4개(코드 계산, 계산식은 홈에서 펼침) */
function Hero() {
  const m = useWorkspace().metrics;
  const setTab = useApp((s) => s.setTab);
  const setFocus = useApp((s) => s.setFocus);
  /** 누르면 해당 화면에서 그 목록을 펼친다 */
  const open = (tab: TabId, focus: "dueThisWeek" | "weak") => () => {
    setTab(tab);
    setFocus(focus);
  };
  const kpis: { icon: (c?: string) => ReactNode; label: string; value: string; onClick?: () => void; hint?: string }[] = [
    { icon: icons.doc, label: "이번 주 마감 보고서", value: `${m.dueThisWeek}건`, onClick: open("home", "dueThisWeek"), hint: "이번 주 마감 보고서 목록 보기" },
    { icon: icons.shield, label: "근거 준비도", value: `${m.readinessPct}%` },
    { icon: icons.hourglass, label: "약한 근거", value: `${m.weak}건`, onClick: open("vault", "weak"), hint: "약한 근거 목록 보기" },
    { icon: icons.container, label: "자동 통과 근거", value: `${m.autoPass}건` },
  ];
  return (
    <section className="hero relative overflow-hidden rounded-[2rem] text-white">
      <div className="grid items-end gap-4 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/85 ring-1 ring-white/15">
            {icons.anchor("size-3.5")}
            포워딩·물류 보고서 도우미
          </span>
          <h1 className="font-display mt-4 text-[2.1rem] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[2.9rem]">
            REPORT
            <br />
            SUPPORTER<span className="text-[#f2a65a]">.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/75">근거는 한 번 저장하고, 필요한 만큼만 끌어옵니다.</p>
        </div>
        <PortScene className="hidden w-full lg:block" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-xs text-white/65">
                {k.icon("size-4")}
                {k.label}
                {k.onClick && <span className="ml-auto text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white">→</span>}
              </span>
              <span className="mt-1 block text-lg font-bold tabular-nums tracking-tight">{k.value}</span>
            </>
          );
          const cls = "bg-[color-mix(in_srgb,var(--hero-from)_70%,transparent)] px-5 py-4 text-left backdrop-blur-sm";
          return k.onClick ? (
            <button
              key={k.label}
              type="button"
              onClick={k.onClick}
              title={k.hint}
              aria-label={`${k.label} ${k.value} — ${k.hint}`}
              className={`${cls} group transition hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white`}
            >
              {body}
            </button>
          ) : (
            <div key={k.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function App() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [exportOpen, setExportOpen] = useState(false);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };

  return (
    <div className="gutter min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pt-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent">{icons.container("size-5")}</span>
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-ink">보고서 도우미</div>
            <div className="font-display text-[0.7rem] font-bold tracking-[0.14em] text-ink-3">REPORT SUPPORTER</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 원칙 2: 개인명은 저장도 표시도 하지 않으므로 끌 수 없는 고정 표시로 둔다 */}
          <span className="hidden items-center gap-1.5 rounded-full border border-ok/30 bg-ok-soft px-3 py-1 text-xs text-ok sm:inline-flex">
            <span className="size-1.5 rounded-full bg-ok" />
            개인명 비표시 · 항상 켜짐
          </span>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {icons.download("size-4")}
            보고서 내보내기
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="grid size-9 place-items-center rounded-full border border-line text-ink-2 transition hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={theme === "dark" ? "밝은 화면으로 전환" : "어두운 화면으로 전환"}
          >
            {theme === "dark" ? icons.sun("size-4") : icons.moon("size-4")}
          </button>
        </div>
      </header>

      <div className="mx-auto mt-5 max-w-6xl">
        <Hero />
      </div>

      <nav className="sticky top-0 z-30 mx-auto mt-5 max-w-6xl bg-bg/85 py-2 backdrop-blur-md" aria-label="모듈">
        {/* 위 줄: 작성 흐름 4개를 한 줄에 같은 폭으로 */}
        <div role="tablist" aria-label="보고서 작성" className="grid grid-cols-4 gap-1 rounded-full border border-line bg-surface p-1 shadow-card">
          {MAIN_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-2 text-xs transition focus-visible:outline-2 focus-visible:outline-accent sm:px-4 sm:text-sm ${
                  active ? "bg-accent font-semibold text-on-accent shadow-sm" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="hidden sm:inline">{t.icon("size-4")}</span>
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
        {/* 아래 줄: 분석 도구(기존 상세 화면) */}
        <div role="tablist" aria-label="분석 도구" className="no-scrollbar mt-2 flex items-center gap-1 overflow-x-auto px-1">
          <span className="mr-1 shrink-0 text-xs text-ink-3">분석 도구</span>
          {TOOL_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "border-accent bg-info-soft font-semibold text-accent" : "border-line text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {t.icon("size-3.5")}
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl pb-16 pt-4">
        {tab === "home" && <HomeTab />}
        {tab === "write" && <WriteTab />}
        {tab === "vault" && <VaultTab />}
        {tab === "rework" && <ReworkTab />}
        {tab === "logic" && <LogicTab />}
        {tab === "docs" && <DocsTab />}
      </main>

      <footer className="mx-auto max-w-6xl border-t border-line py-6 text-xs text-ink-3">
        논리 역추적 참고 지표: 대한무역투자진흥공사(KOTRA) 권역별 경제 지표, 공공데이터포털. 모든 추정·점검 결과는 담당자 확인이 필요합니다.
      </footer>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
