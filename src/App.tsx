import { useState, type ReactNode } from "react";
import { useApp, type TabId } from "./store";
import { ReworkTab } from "./modules/rework/ReworkTab";
import { ZombieTab } from "./modules/zombie/ZombieTab";
import { LogicTab } from "./modules/logic/LogicTab";
import { PrecheckTab } from "./modules/precheck/PrecheckTab";
import { Card } from "./components/ui";
import { PortScene, icons } from "./components/infographics";
import { ExportDialog } from "./export/ExportDialog";
import { traces, zombieFindings } from "./data";
import { kotraMeta } from "./data/kotra";
import { seed } from "./seed";
import { formatKRW } from "./domain/labels";
import { currentTheme, saveTheme, type Theme } from "./theme";

const TABS: { id: TabId; no: string; label: string; icon: (c?: string) => ReactNode }[] = [
  { id: "rework", no: "01", label: "재작업 역추적", icon: icons.route },
  { id: "logic", no: "02", label: "논리 역추적", icon: icons.layers },
  { id: "docs", no: "03", label: "동일 내용 문서", icon: icons.doc },
  { id: "zombie", no: "04", label: "업무 관성 탐지", icon: icons.hourglass },
  { id: "precheck", no: "05", label: "수출 사전 점검", icon: icons.shield },
];

function Placeholder({ step }: { step: string }) {
  return (
    <Card>
      <p className="text-ink-2">{step}에서 구현합니다.</p>
    </Card>
  );
}

/** 첫 화면 요약: 항만 일러스트 + 핵심 숫자 4개 */
function Hero() {
  const cost = seed.cases.reduce((s, c) => s + c.cost, 0);
  const candidates = zombieFindings.filter((f) => f.status === "CANDIDATE").length;
  const kpis = [
    { icon: icons.container, label: "재작업·반려", value: `${traces.length}건` },
    { icon: icons.ship, label: "누적 수정비용", value: formatKRW(cost) },
    { icon: icons.hourglass, label: "폐지 후보 절차", value: `${candidates}개` },
    { icon: icons.shield, label: "KOTRA 수입규제", value: `${kotraMeta.regulations.count.toLocaleString("ko-KR")}건` },
  ];
  return (
    <section className="hero relative overflow-hidden rounded-[2rem] text-white">
      <div className="grid items-end gap-4 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/85 ring-1 ring-white/15">
            {icons.anchor("size-3.5")}
            포워딩·물류 업무 역추적
          </span>
          <h1 className="mt-4 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-[2.15rem]">
            오류를 고치는 대신,
            <br />
            오류가 생기는 <span className="text-[#f2a65a]">입구</span>를 고칩니다.
          </h1>
          <p className="mt-3 max-w-md text-white/70">
            부킹부터 B/L까지 필드 이력을 거꾸로 따라가 최초 원인을 찾고, 보고서의 약한 고리와 쓰이지 않는 절차를 드러냅니다.
          </p>
        </div>
        <PortScene className="hidden w-full lg:block" />
      </div>
      <dl className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[color-mix(in_srgb,var(--hero-from)_70%,transparent)] px-5 py-4 backdrop-blur-sm">
            <dt className="flex items-center gap-1.5 text-xs text-white/65">
              {k.icon("size-4")}
              {k.label}
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums tracking-tight">{k.value}</dd>
          </div>
        ))}
      </dl>
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
            <div className="font-bold tracking-tight text-ink">업무 역추적 시스템</div>
            <div className="text-xs tracking-wider text-ink-3">TRACE-TO-FIX</div>
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
        <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-card">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "bg-accent font-semibold text-on-accent shadow-sm" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {t.icon("size-4")}
                <span className={`tabular-nums ${active ? "opacity-70" : "opacity-60"}`}>{t.no}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl pb-16 pt-4">
        {tab === "rework" && <ReworkTab />}
        {tab === "logic" && <LogicTab />}
        {tab === "docs" && <Placeholder step="4단계" />}
        {tab === "zombie" && <ZombieTab />}
        {tab === "precheck" && <PrecheckTab />}
      </main>

      <footer className="mx-auto max-w-6xl border-t border-line py-6 text-xs text-ink-3">
        수출 사전 점검·참고 지표 데이터: 대한무역투자진흥공사(KOTRA)·외교부, 공공데이터포털. 모든 추정·점검 결과는 담당자 확인이 필요합니다.
      </footer>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
