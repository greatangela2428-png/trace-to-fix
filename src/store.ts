// 화면 상태(Zustand). 규칙·절차 변경은 사람이 '승인'해야만 상태가 바뀐다.
import { create } from "zustand";
import type { ReasonCode, Suggestion } from "./domain/schemas";
import type { ClassifyResponse } from "./domain/ai";
import { classifyReasonApi } from "./api";
import { simulate, type SimResult } from "./domain/patterns";
import { initialSuggestions, patterns, traces } from "./data";
import { seed } from "./seed";

export type TabId = "rework" | "logic" | "docs" | "zombie";
export type ZombieDecision = "PAUSE_APPROVED" | "KEEP";

interface AppState {
  tab: TabId;
  setTab: (t: TabId) => void;

  selectedCaseId: string | null;
  selectCase: (id: string) => void;

  selectedPatternKey: string | null;
  selectPattern: (key: string) => void;

  suggestions: Record<string, Suggestion>;
  simulations: Record<string, SimResult>;
  runSimulation: (id: string) => void;
  approve: (id: string) => void;
  reject: (id: string) => void;

  // 반려 사유 AI 분류: 결과는 '제안'이고, 사람이 확인해야 사유로 확정된다
  aiReasons: Record<string, AiReasonState>;
  classifyReason: (caseId: string, text: string) => Promise<void>;
  confirmReason: (caseId: string, code: ReasonCode) => void;
  resetReason: (caseId: string) => void;

  zombieDecisions: Record<string, { decision: ZombieDecision; at: string }>;
  decideZombie: (procedureId: string, decision: ZombieDecision) => void;
  undoZombie: (procedureId: string) => void;
}

export type AiReasonState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: ClassifyResponse; confirmed?: { code: ReasonCode; by: "AI_ACCEPTED" | "HUMAN_EDITED"; at: string } };

const now = () => new Date().toISOString();

const TAB_IDS: TabId[] = ["rework", "logic", "docs", "zombie"];
const tabFromHash = (): TabId => {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  return (TAB_IDS as string[]).includes(h) ? (h as TabId) : "rework";
};

export const useApp = create<AppState>()((set, get) => ({
  tab: tabFromHash(), // #zombie 처럼 주소로 탭을 바로 열 수 있다
  setTab: (tab) => {
    if (typeof history !== "undefined") history.replaceState(null, "", `#${tab}`);
    set({ tab });
  },

  selectedCaseId: traces[0]?.caseId ?? null,
  selectCase: (selectedCaseId) => set({ selectedCaseId }),

  selectedPatternKey: patterns[0]?.key ?? null,
  selectPattern: (selectedPatternKey) => set({ selectedPatternKey }),

  suggestions: Object.fromEntries(initialSuggestions.map((s) => [s.id, s])),
  simulations: {},
  runSimulation: (id) => {
    const s = get().suggestions[id];
    if (!s) return;
    const result = simulate(s, traces, seed.cases);
    set((st) => ({
      simulations: { ...st.simulations, [id]: result },
      suggestions: { ...st.suggestions, [id]: { ...s, expectedPrevented: result.prevented.length } },
    }));
  },
  approve: (id) =>
    set((st) => {
      const s = st.suggestions[id];
      if (!s || s.status !== "PROPOSED") return st;
      return { suggestions: { ...st.suggestions, [id]: { ...s, status: "APPROVED", appliedAt: now() } } };
    }),
  reject: (id) =>
    set((st) => {
      const s = st.suggestions[id];
      if (!s || s.status !== "PROPOSED") return st;
      return { suggestions: { ...st.suggestions, [id]: { ...s, status: "REJECTED" } } };
    }),

  aiReasons: {},
  classifyReason: async (caseId, text) => {
    if (get().aiReasons[caseId]?.status === "loading") return;
    const put = (s: AiReasonState) => set((st) => ({ aiReasons: { ...st.aiReasons, [caseId]: s } }));
    put({ status: "loading" });
    try {
      put({ status: "done", result: await classifyReasonApi(text) });
    } catch (e) {
      put({ status: "error", message: e instanceof Error ? e.message : "알 수 없는 오류" });
    }
  },
  confirmReason: (caseId, code) =>
    set((st) => {
      const cur = st.aiReasons[caseId];
      if (cur?.status !== "done") return st;
      const by = code === cur.result.code ? "AI_ACCEPTED" : "HUMAN_EDITED";
      return { aiReasons: { ...st.aiReasons, [caseId]: { ...cur, confirmed: { code, by, at: now() } } } };
    }),
  resetReason: (caseId) =>
    set((st) => {
      const next = { ...st.aiReasons };
      delete next[caseId];
      return { aiReasons: next };
    }),

  zombieDecisions: {},
  decideZombie: (procedureId, decision) =>
    set((st) => ({ zombieDecisions: { ...st.zombieDecisions, [procedureId]: { decision, at: now() } } })),
  undoZombie: (procedureId) =>
    set((st) => {
      const next = { ...st.zombieDecisions };
      delete next[procedureId];
      return { zombieDecisions: next };
    }),
}));
