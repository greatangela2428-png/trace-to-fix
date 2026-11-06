// 재작업 역추적(보고서 단위): 반려된 보고서에서 재작업이 필요했던 부분이
// 근거 저장 → 근거 끌어오기 → 본문 작성 → 제출본 중 어디서 처음 틀렸는지 거꾸로 찾고, 그 입구를 고치는 안을 승인받는다.
import { useState } from "react";
import { Badge, Button, Card, CardTitle, ConfirmButton, Intro, NeedsReview, Stat } from "../../components/ui";
import { icons } from "../../components/infographics";
import { REASON_LABEL } from "../../domain/ai";
import { formatKRW } from "../../domain/labels";
import { HOURLY_COST_KRW, ITEM_RULE, R_STAGES, R_STAGE_LABEL, simulateRequired, type RPattern, type RStage } from "../../domain/reportRework";
import { REPORT_TYPE_LABEL } from "../../domain/workspace";
import { rPatterns, rTraces } from "../../data";
import { seed } from "../../seed";
import { useApp } from "../../store";
import { useWorkspace } from "../../workspace/useWorkspace";
import { SampleNotice } from "../../workspace/ui";
import { ReasonClassifier } from "./ReasonClassifier";

const KIND_LABEL = { MISSING: "누락", WRONG: "틀린 값" } as const;
const caseById = new Map(seed.reportRework.map((c) => [c.id, c]));
const traceById = new Map(rTraces.map((t) => [t.caseId, t]));
const totalCost = rTraces.reduce((s, t) => s + t.cost, 0);
const totalHours = seed.reportRework.reduce((s, c) => s + c.hours, 0);
const byStage = (s: RStage) => rTraces.filter((t) => t.origin === s);

export function ReworkTab() {
  const [selected, setSelected] = useState(rTraces[0]?.caseId ?? "");
  const top = [...R_STAGES].sort((a, b) => byStage(b).length - byStage(a).length)[0]!;

  return (
    <div className="space-y-6">
      <Intro icon={icons.route("size-5")} title="재작업 역추적 · 보고서">
        반려된 보고서에서 다시 써야 했던 부분이 <b className="font-semibold text-ink">근거 저장 → 근거 끌어오기 → 본문 작성 → 제출본</b> 중 어디서 처음 틀렸는지
        거꾸로 찾습니다. 같은 입구에서 반복되면 그 입구(저장 필수 항목·끌어오기 경고·작성 중 점검)를 고치는 안을 내고, 사람이 승인하면 보관함 저장 화면에 반영됩니다.
      </Intro>
      <SampleNotice>
        반려 보고서 {rTraces.length}건 표본이라 경향을 단정할 수 없습니다. 재작업 비용 = 재작업 시간 × 시간당 {HOURLY_COST_KRW.toLocaleString("ko-KR")}원(가정).
      </SampleNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="반려된 보고서" value={`${rTraces.length}건`} />
        <Stat label="재작업 시간" value={`${totalHours}시간`} sub={formatKRW(totalCost)} />
        <Stat label="가장 많은 최초 원인" value={R_STAGE_LABEL[top]} sub={`${rTraces.length}건 중 ${byStage(top).length}건`} />
        <Stat label="기록상 사유가 비어 있던 반려" value={`${seed.reportRework.filter((c) => !c.recordedReason).length}건`} sub="AI 사유 분류로 채울 수 있음" />
      </div>

      <StageFlow />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CaseList selected={selected} onSelect={setSelected} />
        <CaseDetail id={selected} />
      </div>

      <PatternTable />
      <Improvements />
    </div>
  );
}

/** 단계별 최초 원인 건수(인포그래픽) */
function StageFlow() {
  const max = Math.max(...R_STAGES.map((s) => byStage(s).length), 1);
  return (
    <Card>
      <CardTitle aside={<NeedsReview />}>어디서 처음 틀렸나</CardTitle>
      <ol className="grid gap-2 sm:grid-cols-4">
        {R_STAGES.map((s, i) => {
          const n = byStage(s).length;
          return (
            <li key={s} className="relative rounded-2xl border border-line p-4">
              <div className="text-xs text-ink-3">
                {i + 1}단계{i < R_STAGES.length - 1 && <span className="ml-1 hidden sm:inline">→</span>}
              </div>
              <div className="font-semibold text-ink">{R_STAGE_LABEL[s]}</div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-ink">{n}건</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${n ? "bg-danger" : ""}`} style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <div className="mt-1 text-xs text-ink-3">{formatKRW(byStage(s).reduce((x, t) => x + t.cost, 0))}</div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-ink-3">
        최초 원인(추정) 판정 규칙: 제출본부터 거꾸로 따라가, 틀린 값이 끊기지 않고 이어진 가장 이른 단계를 원인으로 봅니다. 중간에 맞았다가 다시 틀어지면 다시 틀어진 단계가 원인입니다.
      </p>
    </Card>
  );
}

function CaseList({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <Card>
      <CardTitle aside={<span className="text-sm text-ink-3">{rTraces.length}건</span>}>반려된 보고서</CardTitle>
      <ul className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
        {rTraces.map((t) => {
          const c = caseById.get(t.caseId)!;
          const active = t.caseId === selected;
          return (
            <li key={t.caseId}>
              <button
                type="button"
                onClick={() => onSelect(t.caseId)}
                aria-pressed={active}
                className={`w-full rounded-2xl border px-3.5 py-2.5 text-left transition ${active ? "border-accent/50 bg-info-soft" : "border-transparent hover:bg-surface-2"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">{c.report}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">{c.returnedAt.slice(5)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{t.item}</Badge>
                  <Badge tone={t.kind === "MISSING" ? "danger" : "warn"}>{KIND_LABEL[t.kind]}</Badge>
                  <Badge>원인: {R_STAGE_LABEL[t.origin]}</Badge>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CaseDetail({ id }: { id: string }) {
  const t = traceById.get(id);
  const c = caseById.get(id);
  if (!t || !c)
    return (
      <Card>
        <p className="text-ink-3">반려된 보고서를 고르세요.</p>
      </Card>
    );
  return (
    <Card>
      <CardTitle aside={<NeedsReview />}>{c.report}</CardTitle>
      <div className="-mt-2 mb-4 flex flex-wrap gap-x-3 text-sm text-ink-3">
        <span>{REPORT_TYPE_LABEL[c.reportType]}</span>
        <span>반려: {c.reviewer} · {c.returnedAt}</span>
        <span>
          재작업 {c.hours}시간 · {formatKRW(t.cost)}
        </span>
      </div>
      <p className="mb-4 text-ink-2">
        재작업 항목 <b className="font-semibold text-ink">{c.item}</b> · 맞는 값 <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-sm text-ink">{c.correct}</code>
      </p>
      <ol className="grid gap-3 sm:grid-cols-4">
        {t.steps.map((s, i) => (
          <li
            key={s.stage}
            className={`rounded-2xl border p-3.5 ${s.status === "ORIGIN" ? "border-danger/60 bg-danger-soft" : s.status === "ERROR" ? "border-warn/30 bg-warn-soft" : "border-line bg-surface-2"}`}
          >
            <div className="text-xs text-ink-3">
              {i + 1}. {R_STAGE_LABEL[s.stage]}
            </div>
            <div className={`mt-1 break-all ${s.value ? "text-ink" : "text-danger"}`}>{s.value || "(비어 있음)"}</div>
            {s.status === "ORIGIN" && <Badge tone="danger">최초 원인(추정)</Badge>}
            {s.status === "ERROR" && <Badge tone="warn">오류 이어짐</Badge>}
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-2 rounded-2xl bg-surface-2/60 p-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-ink-3">기록상 반려 사유</div>
          <div className="text-ink">{c.recordedReason ? REASON_LABEL[c.recordedReason] : "기록 없음"}</div>
        </div>
        <div>
          <div className="text-ink-3">실제 입구(역추적)</div>
          <div className="font-semibold text-ink">
            {R_STAGE_LABEL[t.origin]} · {KIND_LABEL[t.kind]}
          </div>
        </div>
      </div>
      <ReasonClassifier caseId={c.id} text={c.comment} existing={c.recordedReason} />
    </Card>
  );
}

function PatternTable() {
  const [byItem, setByItem] = useState(false);
  // 항목별 합계: 단계와 무관하게 같은 항목을 합친다
  const itemRows = [...new Set(rPatterns.map((p) => p.item))].map((item) => {
    const ps = rPatterns.filter((p) => p.item === item);
    return { item, n: ps.reduce((s, p) => s + p.caseIds.length, 0), hours: ps.reduce((s, p) => s + p.hours, 0), cost: ps.reduce((s, p) => s + p.cost, 0) };
  });
  return (
    <Card>
      <CardTitle
        aside={
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={byItem} onChange={(e) => setByItem(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            항목별 합계(단계 합산)
          </label>
        }
      >
        반려 패턴
      </CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-ink-3">
              {!byItem && <th className="py-1.5 pr-3 font-normal">최초 원인 단계</th>}
              <th className="py-1.5 pr-3 font-normal">항목</th>
              {!byItem && <th className="py-1.5 pr-3 font-normal">유형</th>}
              <th className="py-1.5 pr-3 text-right font-normal">건수</th>
              <th className="py-1.5 pr-3 text-right font-normal">재작업 시간</th>
              <th className="py-1.5 text-right font-normal">비용</th>
            </tr>
          </thead>
          <tbody>
            {byItem
              ? itemRows.map((r) => (
                  <tr key={r.item} className="border-t border-line">
                    <td className="py-2 pr-3 text-ink">{r.item}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.n}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.hours}시간</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatKRW(r.cost)} <span className="text-xs text-ink-3">({Math.round((r.cost / totalCost) * 100)}%)</span>
                    </td>
                  </tr>
                ))
              : rPatterns.map((p) => (
                  <tr key={p.key} className="border-t border-line">
                    <td className="py-2 pr-3 text-ink-2">{R_STAGE_LABEL[p.origin]}</td>
                    <td className="py-2 pr-3 text-ink">{p.item}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={p.kind === "MISSING" ? "danger" : "warn"}>{KIND_LABEL[p.kind]}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.caseIds.length}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.hours}시간</td>
                    <td className="py-2 text-right tabular-nums">{formatKRW(p.cost)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** 개선안: 저장 단계 → 저장 필수 항목(승인 시 보관함 반영) / 끌어오기·작성 단계 → 작성 중 점검 규칙과 연결 */
function Improvements() {
  const ws = useWorkspace();
  const approved = useApp((s) => s.ws.approvedRequired);
  const approve = useApp((s) => s.approveRequired);
  const revoke = useApp((s) => s.revokeRequired);
  const setTab = useApp((s) => s.setTab);
  const later = rPatterns.filter((p) => p.origin !== "SAVE");

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle aside={<Badge tone="info">근거 저장 입구</Badge>}>저장 필수 항목 제안</CardTitle>
        <ul className="space-y-4">
          {ws.reportCandidates.map((c) => {
            const sim = simulateRequired(c, rTraces);
            const isOn = approved.includes(c.key);
            return (
              <li key={c.key} className={`rounded-2xl border p-4 ${isOn ? "border-ok/50" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-ink">근거 저장 시 '{c.label}' 필수</span>
                  <Badge>운임표·견적 메일·계약</Badge>
                  {isOn ? <Badge tone="ok">승인됨 · 보관함 저장 화면에 반영</Badge> : <Badge tone="warn">승인 전 · 양식에 반영 안 됨</Badge>}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-ok-soft p-3">
                    <div className="text-xs text-ink-3">가상 재실행 효과</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-ink">
                      {sim.total}건 중 {sim.prevented}건 방지
                    </div>
                    <div className="text-xs text-ink-3">재작업 {formatKRW(sim.savedCost)} 절감(저장 단계에서 비어 있던 반려만 계산)</div>
                  </div>
                  <div className="rounded-xl bg-warn-soft p-3">
                    <div className="text-xs text-ink-3">입력 부담</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-ink">저장마다 +{c.burden.extraFieldsPerSave}항목</div>
                    <div className="text-xs text-ink-3">지금 보관함에서 채워야 할 근거 {c.burden.backfill.length}건{c.burden.backfill.length ? `: ${c.burden.backfill.map((id) => ws.byId.get(id)?.title ?? id).join(", ")}` : ""}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isOn ? (
                    <>
                      <Button onClick={() => setTab("vault")}>보관함에서 확인</Button>
                      <Button onClick={() => revoke(c.key)}>승인 취소</Button>
                    </>
                  ) : (
                    <ConfirmButton label="승인" confirmLabel={`'${c.label}' 저장 필수로 승인`} onConfirm={() => approve(c.key)} />
                  )}
                </div>
                {isOn && <Monitor field={c.field} types={c.types} label={c.label} />}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle aside={<Badge tone="info">끌어오기·작성 입구</Badge>}>작성 중 점검으로 막는 항목</CardTitle>
        <ul className="space-y-2">
          {later.map((p: RPattern) => {
            const rule = ITEM_RULE[p.item];
            return (
              <li key={p.key} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge>{R_STAGE_LABEL[p.origin]}</Badge>
                <span className="font-medium text-ink">{p.item}</span>
                <span className="text-ink-3">{p.caseIds.length}건</span>
                <span className="text-ink-3">→</span>
                {rule?.ruleId ? <Badge tone="ok">이미 동작 중: {rule.name}</Badge> : <Badge tone="warn">{rule?.name ?? "규칙 후보"}</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>

      <BookingCandidates />
    </div>
  );
}

/** 승인 후 재발 모니터링: 지금 보관함 상태를 바로 센다(재발 반려 데이터는 아직 없음) */
function Monitor({ field, types, label }: { field: string; types: string[]; label: string }) {
  const ws = useWorkspace();
  const scope = ws.evidence.filter((e) => types.includes(e.type) && !e.canonicalId);
  const missing = scope.filter((e) => e.requiredFieldsMissing.includes(field));
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-sm">
      <div className="font-semibold text-ink-2">승인 후 모니터링</div>
      <ul className="mt-1 space-y-0.5 text-ink-2">
        <li>
          대상 근거 {scope.length}건 중 '{label}' 비어 있음 {missing.length}건{missing.length ? ` (${missing.map((e) => e.title).join(", ")})` : " — 모두 채워짐"}
        </li>
        <li className="text-ink-3">승인 후 같은 사유의 반려 재발: 아직 기록 없음(샘플 — 실데이터 연동 시 반려 기록과 대조)</li>
      </ul>
    </div>
  );
}

/** 선적 서류(부킹 기록) 필수 후보: 선적 서류 재작업 기록에서 도출(HS 코드 교차 보호와 같은 데이터) */
function BookingCandidates() {
  const ws = useWorkspace();
  const approved = useApp((s) => s.ws.approvedRequired);
  const approve = useApp((s) => s.approveRequired);
  const revoke = useApp((s) => s.revokeRequired);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-sm font-semibold text-ink-2 hover:text-ink">
        {open ? "접기" : "부킹 기록 필수 후보 보기"} <span className="font-normal text-ink-3">(선적 서류 재작업 기록 {seed.cases.length}건에서 도출)</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {ws.candidates.map((c) => {
            const isOn = approved.includes(c.key);
            return (
              <li key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-ink">부킹 기록 · {c.label}</span>
                <span className="text-ink-3">
                  필수였다면 {c.preventable.length}건({formatKRW(c.preventableCost)}) 방지 · 재작업 {c.totalCases}건 중
                </span>
                {isOn ? (
                  <>
                    <Badge tone="ok">승인됨</Badge>
                    <Button onClick={() => revoke(c.key)}>취소</Button>
                  </>
                ) : (
                  <ConfirmButton label="승인" confirmLabel="필수로 승인" onConfirm={() => approve(c.key)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
