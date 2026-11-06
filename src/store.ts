// 화면 상태(Zustand). 규칙·절차 변경은 사람이 '승인'해야만 상태가 바뀐다.
import { create } from "zustand";
import type { ReasonCode, Report, Suggestion } from "./domain/schemas";
import type { ClassifyResponse } from "./domain/ai";
import { classifyReasonApi, decomposeReportApi } from "./api";
import { simulate, type SimResult } from "./domain/patterns";
import { initialSuggestions, patterns, traces } from "./data";
import { seed } from "./seed";
import { workspaceSeed } from "./seed/workspace";
import type { EvidenceInput, EvidenceLinkInput, WorkReportInput } from "./domain/workspace";
import { DEFAULT_WEIGHTS, type Weights } from "./domain/priority";
import { applyMerge } from "./domain/dedupe";

export type TabId = "home" | "write" | "vault" | "rework" | "logic" | "docs";

/** 보고서 작성 도구 상태: 근거 보관함 + 보고서. 파생값(상태·점수)은 저장하지 않고 화면에서 계산한다 */
export interface WorkspaceState {
  evidence: EvidenceInput[];
  reports: WorkReportInput[];
  approvedRequired: string[]; // 승인된 저장 필수 항목 키("report|포함 항목", "booking|consigneeAddress") — 재작업 역추적에서 승인
  clockOffsetDays: number; // 시연용: 기준일을 며칠 넘겨 근거 만료·마감 임박을 보여 준다
  weights: Weights; // 우선순위 가중치(초기 가정, 홈에서 조정)
}

/** 보고서를 열면 첫 주장을 바로 골라 둔다(근거 패널이 비어 보이지 않게) */
const firstClaimId = (r: WorkReportInput | undefined) => r?.sections.flatMap((s) => s.claims)[0]?.id ?? null;

const mapClaim = (
  reports: WorkReportInput[],
  reportId: string,
  claimId: string,
  fn: (links: EvidenceLinkInput[]) => EvidenceLinkInput[],
): WorkReportInput[] =>
  reports.map((r) =>
    r.id !== reportId
      ? r
      : {
          ...r,
          sections: r.sections.map((s) => ({
            ...s,
            claims: s.claims.map((c) => (c.id === claimId ? { ...c, evidenceLinks: fn(c.evidenceLinks) } : c)),
          })),
        },
  );
/** 읽히지 않는 보고서·항목 결정: 유지 / 3개월 시범 중단(수신자 확인 후) / 표본 감사(유지하되 일부만 점검) */
export type ZombieDecision = "PAUSE_APPROVED" | "KEEP" | "SAMPLE_AUDIT";
export const ZOMBIE_DECISION_LABEL: Record<ZombieDecision, string> = { PAUSE_APPROVED: "3개월 시범 중단", KEEP: "유지", SAMPLE_AUDIT: "표본 감사" };
export type DocDecision = "LINK_APPROVED" | "KEEP_SEPARATE";
/** 확인 요청 응답: 확인함 / 수정할게요 / 문제없음(무시, 로그에만) */
export type CheckAction = "ack" | "fix" | "dismiss";

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

  // 논리 역추적: 샘플(미리 분해된 시드) 또는 AI가 분해한 보고서를 점검한다
  logic: LogicState;
  analyzeReport: (text: string) => Promise<void>;
  loadSampleReport: () => void;

  zombieDecisions: Record<string, { decision: ZombieDecision; at: string }>;
  decideZombie: (procedureId: string, decision: ZombieDecision) => void;
  undoZombie: (procedureId: string) => void;

  // ③ 동일 내용 문서: 원본 연결(참조만)은 사람이 승인해야 반영된다
  docDecisions: Record<string, { decision: DocDecision; at: string }>;
  decideDoc: (pairKey: string, decision: DocDecision) => void;
  undoDoc: (pairKey: string) => void;
  /** 병합 승인: 보관함 근거를 대표로 묶고 모든 보고서 링크를 대표로 바꾼다. 되돌릴 수 있게 직전 상태를 남긴다 */
  mergeEvidence: (pairKey: string, canonicalId: string, memberId: string, chosen: Record<string, string | number>) => void;
  mergeLog: Record<string, { before: Pick<WorkspaceState, "evidence" | "reports">; repointed: { reportId: string; claimId: string }[] }>;

  // 보고서 작성 도구
  ws: WorkspaceState;
  saveEvidence: (e: EvidenceInput) => void;
  updateSectionText: (reportId: string, sectionId: string, text: string) => void;
  updateDeadline: (reportId: string, deadline: string) => void;
  shiftClock: (days: number) => void;
  setWeights: (w: Partial<Weights>) => void;
  approveRequired: (key: string) => void;
  revokeRequired: (key: string) => void;
  linkEvidence: (reportId: string, claimId: string, link: EvidenceLinkInput) => void;
  unlinkEvidence: (reportId: string, claimId: string, evidenceId: string) => void;
  selected: { reportId: string; claimId: string | null };
  checkLog: Record<string, { action: CheckAction; at: string }>;
  respondCheck: (itemKey: string, action: CheckAction) => void;
  undoCheck: (itemKey: string) => void;
  editingEvidenceId: string | null;
  // 상단 지표를 누르면 해당 화면에서 그 목록을 펼친다
  focus: "dueThisWeek" | "weak" | null;
  // 피로도: 확인 요청에 사람이 어떻게 응답했나(이 브라우저에 저장)
  fatigue: Fatigue;
  resetFatigue: () => void;
  // 3분 데모 모드
  demo: { active: boolean; step: number };
  setDemo: (d: Partial<{ active: boolean; step: number }>) => void;
  /** 보관함·보고서·응답·결정을 처음 샘플 상태로 */
  resetWorkspace: () => void;
  setFocus: (f: "dueThisWeek" | "weak" | null) => void;
  setEditingEvidence: (id: string | null) => void;
  selectReport: (reportId: string) => void;
  selectClaim: (claimId: string | null) => void;

}

export type AiReasonState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: ClassifyResponse; confirmed?: { code: ReasonCode; by: "AI_ACCEPTED" | "HUMAN_EDITED"; at: string } };

export interface LogicState {
  source: "sample" | "ai";
  report: Report;
  unverifiedClaimIds: string[];
  model?: string;
  status: "idle" | "loading" | "error";
  message?: string;
}

const SAMPLE_LOGIC: LogicState = { source: "sample", report: seed.report, unverifiedClaimIds: [], status: "idle" };

const now = () => new Date().toISOString();

const TAB_IDS: TabId[] = ["home", "write", "vault", "rework", "logic", "docs"];
const tabFromHash = (): TabId => {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  return (TAB_IDS as string[]).includes(h) ? (h as TabId) : "home";
};

// ── 피로도 집계 저장(이 브라우저에만, 실패해도 앱은 동작) ──────
export interface Fatigue {
  accepted: number; // [확인함]·[수정할게요]
  ignored: number; // [문제없음]
  since: string;
}
const FATIGUE_KEY = "rs-fatigue";
const EMPTY_FATIGUE: Fatigue = { accepted: 0, ignored: 0, since: new Date().toISOString() };
function loadFatigue(): Fatigue {
  try {
    const raw = localStorage.getItem(FATIGUE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Fatigue>) : null;
    if (v && typeof v.accepted === "number" && typeof v.ignored === "number" && typeof v.since === "string") return v as Fatigue;
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
  return EMPTY_FATIGUE;
}
function saveFatigue(f: Fatigue) {
  try {
    localStorage.setItem(FATIGUE_KEY, JSON.stringify(f));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export const useApp = create<AppState>()((set, get) => ({
  tab: tabFromHash(), // #write 처럼 주소로 탭을 바로 열 수 있다
  setTab: (tab) => {
    if (typeof history !== "undefined") history.replaceState(null, "", `#${tab}`);
    set({ tab, focus: null }); // 탭을 옮기면 지표 상세 목록은 닫는다(지표 버튼은 옮긴 뒤 다시 연다)
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

  logic: SAMPLE_LOGIC,
  analyzeReport: async (text) => {
    if (get().logic.status === "loading") return;
    set((st) => ({ logic: { ...st.logic, status: "loading", message: undefined } }));
    try {
      const r = await decomposeReportApi(text);
      set({ logic: { source: "ai", report: r.report, unverifiedClaimIds: r.unverifiedClaimIds, model: r.model, status: "idle" } });
    } catch (e) {
      // 실패해도 직전 결과는 그대로 보여 준다
      set((st) => ({ logic: { ...st.logic, status: "error", message: e instanceof Error ? e.message : "알 수 없는 오류" } }));
    }
  },
  loadSampleReport: () => set({ logic: SAMPLE_LOGIC }),

  docDecisions: {},
  decideDoc: (pairKey, decision) => set((st) => ({ docDecisions: { ...st.docDecisions, [pairKey]: { decision, at: now() } } })),
  undoDoc: (pairKey) =>
    set((st) => {
      const next = { ...st.docDecisions };
      delete next[pairKey];
      const log = st.mergeLog[pairKey];
      if (!log) return { docDecisions: next };
      const restLog = { ...st.mergeLog };
      delete restLog[pairKey];
      // 병합을 되돌리면 보관함·링크를 직전 상태로
      return { docDecisions: next, mergeLog: restLog, ws: { ...st.ws, evidence: log.before.evidence, reports: log.before.reports } };
    }),
  mergeLog: {},
  mergeEvidence: (pairKey, canonicalId, memberId, chosen) =>
    set((st) => {
      const m = applyMerge(st.ws.evidence, st.ws.reports, canonicalId, memberId, chosen);
      return {
        ws: { ...st.ws, evidence: m.evidence, reports: m.reports },
        docDecisions: { ...st.docDecisions, [pairKey]: { decision: "LINK_APPROVED", at: now() } },
        mergeLog: { ...st.mergeLog, [pairKey]: { before: { evidence: st.ws.evidence, reports: st.ws.reports }, repointed: m.repointed } },
      };
    }),

  ws: { evidence: workspaceSeed.evidenceInputs, reports: workspaceSeed.reportInputs, approvedRequired: [], clockOffsetDays: 0, weights: DEFAULT_WEIGHTS },
  updateSectionText: (reportId, sectionId, text) =>
    set((st) => ({
      ws: {
        ...st.ws,
        reports: st.ws.reports.map((r) =>
          r.id !== reportId
            ? r
            : {
                ...r,
                sections: r.sections.map((s) =>
                  s.id !== sectionId ? s : { ...s, text, status: text.trim() === "" ? "empty" : s.status === "empty" ? "draft" : s.status },
                ),
              },
        ),
      },
    })),
  updateDeadline: (reportId, deadline) =>
    set((st) => ({ ws: { ...st.ws, reports: st.ws.reports.map((r) => (r.id === reportId ? { ...r, deadline } : r)) } })),
  shiftClock: (days) => set((st) => ({ ws: { ...st.ws, clockOffsetDays: Math.max(0, st.ws.clockOffsetDays + days) } })),
  setWeights: (w) => set((st) => ({ ws: { ...st.ws, weights: { ...st.ws.weights, ...w } } })),
  approveRequired: (key) =>
    set((st) => (st.ws.approvedRequired.includes(key) ? st : { ws: { ...st.ws, approvedRequired: [...st.ws.approvedRequired, key] } })),
  revokeRequired: (key) => set((st) => ({ ws: { ...st.ws, approvedRequired: st.ws.approvedRequired.filter((k) => k !== key) } })),
  saveEvidence: (e) =>
    set((st) => {
      const exists = st.ws.evidence.some((x) => x.id === e.id);
      return { ws: { ...st.ws, evidence: exists ? st.ws.evidence.map((x) => (x.id === e.id ? e : x)) : [...st.ws.evidence, e] } };
    }),
  linkEvidence: (reportId, claimId, link) =>
    set((st) => ({
      ws: {
        ...st.ws,
        reports: mapClaim(st.ws.reports, reportId, claimId, (ls) => (ls.some((l) => l.evidenceId === link.evidenceId && l.field === link.field) ? ls : [...ls, link])),
      },
    })),
  unlinkEvidence: (reportId, claimId, evidenceId) =>
    set((st) => ({ ws: { ...st.ws, reports: mapClaim(st.ws.reports, reportId, claimId, (ls) => ls.filter((l) => l.evidenceId !== evidenceId)) } })),
  selected: { reportId: workspaceSeed.reportInputs[0]?.id ?? "", claimId: firstClaimId(workspaceSeed.reportInputs[0]) },
  selectReport: (reportId) => set((st) => ({ selected: { reportId, claimId: firstClaimId(st.ws.reports.find((r) => r.id === reportId)) } })),
  selectClaim: (claimId) => set((st) => ({ selected: { ...st.selected, claimId } })),
  checkLog: {},
  respondCheck: (itemKey, action) =>
    set((st) => {
      // 같은 항목에 다시 응답하면 이전 응답은 빼고 센다
      const prev = st.checkLog[itemKey]?.action;
      const f = { ...st.fatigue };
      if (prev === "dismiss") f.ignored--;
      else if (prev) f.accepted--;
      if (action === "dismiss") f.ignored++;
      else f.accepted++;
      saveFatigue(f);
      return { checkLog: { ...st.checkLog, [itemKey]: { action, at: now() } }, fatigue: f };
    }),
  undoCheck: (itemKey) =>
    set((st) => {
      const next = { ...st.checkLog };
      delete next[itemKey];
      return { checkLog: next };
    }),
  editingEvidenceId: null,
  focus: null,
  fatigue: loadFatigue(),
  resetFatigue: () => {
    saveFatigue(EMPTY_FATIGUE);
    set({ fatigue: EMPTY_FATIGUE });
  },
  demo: { active: false, step: 0 },
  setDemo: (d) => set((st) => ({ demo: { ...st.demo, ...d } })),
  resetWorkspace: () =>
    set({
      ws: { evidence: workspaceSeed.evidenceInputs, reports: workspaceSeed.reportInputs, approvedRequired: [], clockOffsetDays: 0, weights: DEFAULT_WEIGHTS },
      checkLog: {},
      docDecisions: {},
      mergeLog: {},
      zombieDecisions: {},
      aiReasons: {},
      focus: null,
      editingEvidenceId: null,
      selected: { reportId: workspaceSeed.reportInputs[0]?.id ?? "", claimId: firstClaimId(workspaceSeed.reportInputs[0]) },
    }),
  setFocus: (focus) => set({ focus }),
  setEditingEvidence: (editingEvidenceId) => set({ editingEvidenceId }),


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
