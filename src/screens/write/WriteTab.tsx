// 작성: 좌) 보고서 본문(주장 문장 하이라이트) · 우) 확인 요청 상위 3개 + 금액 민감도 + 고른 주장의 끌어온 근거.
// 근거를 고치거나 연결하면 상태·점수가 즉시 다시 계산된다.
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, CardTitle, Intro } from "../../components/ui";
import { icons } from "../../components/infographics";
import { REPORT_TYPE_LABEL, type LinkStatus, type SectionInput } from "../../domain/workspace";
import { formatKRW } from "../../domain/labels";
import { buildSensitivity } from "../../domain/sensitivity";
import { STATUS_SEVERITY, type EvaluatedClaim } from "../../rules";
import { useApp } from "../../store";
import { useWorkspace } from "../../workspace/useWorkspace";
import { SampleNotice } from "../../workspace/ui";
import { CheckPanel } from "./CheckPanel";
import { PullPanel } from "./PullPanel";
import { SensitivityBox } from "./SensitivityBox";

/** 주장의 가장 나쁜 상태(연결 없음 포함) */
function claimStatus(ec: EvaluatedClaim | undefined): LinkStatus {
  if (!ec) return "fresh";
  const all = [...ec.claimFindings.map((f) => f.status), ...ec.links.map((l) => l.status)];
  return all.sort((a, b) => STATUS_SEVERITY.indexOf(a) - STATUS_SEVERITY.indexOf(b))[0] ?? "fresh";
}

const MARK: Record<"bad" | "warn" | "ok", string> = {
  bad: "bg-danger-soft decoration-danger/60",
  warn: "bg-warn-soft decoration-warn/60",
  ok: "bg-ok-soft decoration-ok/50",
};
const level = (s: LinkStatus): keyof typeof MARK =>
  s === "fresh" ? "ok" : s === "missing" || s === "expired_at_apply" || s === "conflict" ? "bad" : "warn";

/** 섹션 본문에서 주장 인용 구절을 찾아 하이라이트 버튼으로 바꾼다 */
function HighlightedText({ section, evaluated, selected, onSelect }: { section: SectionInput; evaluated: EvaluatedClaim[]; selected: string | null; onSelect: (id: string) => void }) {
  const marks = section.claims
    .map((c) => ({ c, at: section.text.indexOf(c.quote) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const { c, at } of marks) {
    if (at < pos) continue; // 겹치는 인용은 건너뛴다
    if (at > pos) parts.push(section.text.slice(pos, at));
    const st = claimStatus(evaluated.find((x) => x.claim.id === c.id));
    parts.push(
      <button
        key={c.id}
        type="button"
        onClick={() => onSelect(c.id)}
        aria-pressed={selected === c.id}
        title="이 주장의 근거 보기"
        className={`rounded px-0.5 text-left underline decoration-2 underline-offset-4 transition ${MARK[level(st)]} ${selected === c.id ? "ring-2 ring-accent" : ""}`}
      >
        {c.quote}
      </button>,
    );
    pos = at + c.quote.length;
  }
  if (pos < section.text.length) parts.push(section.text.slice(pos));
  return <p className="mt-1 leading-loose text-ink-2">{parts}</p>;
}

/** 섹션 본문: 보기(하이라이트) ↔ 고치기. 고치면 섹션 상태와 우선순위가 다시 계산된다 */
function SectionBody({
  reportId,
  section,
  evaluated,
  selected,
  onSelect,
}: {
  reportId: string;
  section: SectionInput;
  evaluated: EvaluatedClaim[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const update = useApp((s) => s.updateSectionText);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.text);
  const lost = section.claims.filter((c) => !section.text.includes(c.quote)); // 고치다 인용 구절이 사라진 주장

  if (editing)
    return (
      <div className="mt-1 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-xl border border-line bg-surface-2/50 p-3 leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`${section.title} 본문`}
        />
        <div className="flex gap-1.5">
          <Button
            variant="primary"
            onClick={() => {
              update(reportId, section.id, draft);
              setEditing(false);
            }}
          >
            저장
          </Button>
          <Button
            onClick={() => {
              setDraft(section.text);
              setEditing(false);
            }}
          >
            취소
          </Button>
        </div>
      </div>
    );

  return (
    <div>
      {section.text ? (
        <HighlightedText section={section} evaluated={evaluated} selected={selected} onSelect={onSelect} />
      ) : (
        <p className="mt-1 text-sm text-ink-3">아직 쓰지 않은 섹션입니다.</p>
      )}
      {lost.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-warn">
          본문에서 찾을 수 없는 주장:
          {lost.map((c) => (
            <button key={c.id} type="button" onClick={() => onSelect(c.id)} className="underline">
              {c.text}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(section.text);
          setEditing(true);
        }}
        className="mt-1 text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
      >
        {section.text ? "문장 고치기" : "쓰기"}
      </button>
    </div>
  );
}

export function WriteTab() {
  const ws = useWorkspace();
  const { reportId, claimId } = useApp((s) => s.selected);
  const selectReport = useApp((s) => s.selectReport);
  const selectClaim = useApp((s) => s.selectClaim);
  const view = ws.reportById.get(reportId) ?? ws.reports[0];
  if (!view) return <p className="text-ink-3">보고서가 없습니다.</p>;
  const { report, evaluated, items } = view;
  const ec = evaluated.find((c) => c.claim.id === claimId);
  const autoPass = evaluated.flatMap((c) => c.links).filter((l) => l.status === "fresh").length;
  const sensitivity = buildSensitivity(report, evaluated, ws.byId);

  return (
    <div className="space-y-6">
      <Intro icon={icons.doc("size-5")} title="작성">
        본문의 밑줄 친 주장을 누르면 그 주장이 기댄 근거가 오른쪽에 나옵니다. 끌어온 근거는 출처·저장일·유효기간·적용 범위와 함께 따라오고, 만료·충돌·범위·포함 항목·연결 여부는
        코드 규칙이 결정 적용 시점 기준으로 바로 점검합니다. 확인 요청은 중요한 3개만 위에 보입니다.
      </Intro>
      <SampleNotice />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="보고서 선택">
        {ws.reports.map((v) => (
          <button
            key={v.report.id}
            type="button"
            aria-pressed={v.report.id === report.id}
            onClick={() => selectReport(v.report.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${v.report.id === report.id ? "bg-accent font-semibold text-on-accent" : "border border-line text-ink-2 hover:text-ink"}`}
          >
            {v.report.title} <span className="opacity-70">· 확인 {v.items.length}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-20">
          <CardTitle aside={<Badge>{REPORT_TYPE_LABEL[report.type]}</Badge>}>{report.title}</CardTitle>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
            <span>독자: {report.audience}</span>
            <span>마감: {report.deadline.slice(0, 16).replace("T", " ")}</span>
            {report.appliesFrom && <span>결정 적용 시점: {report.appliesFrom}</span>}
            {report.decisionImpactKrw !== undefined && (
              <span title={report.impactBasis?.label}>
                걸린 금액: {formatKRW(report.decisionImpactKrw)} ({report.impactBasis?.label})
              </span>
            )}
          </div>
          <div className="space-y-5">
            {report.sections.map((s) => (
              <section key={s.id}>
                <h3 className="flex items-center gap-2 font-semibold text-ink">
                  {s.title}
                  <Badge tone={s.status === "done" ? "ok" : s.status === "draft" ? "info" : "neutral"}>
                    {s.status === "done" ? "완료" : s.status === "draft" ? "작성 중" : "미작성"}
                  </Badge>
                </h3>
                <SectionBody reportId={report.id} section={s} evaluated={evaluated} selected={claimId} onSelect={selectClaim} />
              </section>
            ))}
          </div>
          <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
            <span><span className="rounded bg-danger-soft px-1">밑줄</span> 확인 필요(만료·충돌·연결 없음)</span>
            <span><span className="rounded bg-warn-soft px-1">밑줄</span> 확인 권장</span>
            <span><span className="rounded bg-ok-soft px-1">밑줄</span> 근거 이상 없음</span>
          </p>
        </Card>

        <div className="space-y-4">
          <CheckPanel ws={ws} items={items} autoPass={autoPass} />
          {sensitivity && <SensitivityBox key={`${report.id}-${sensitivity.rows.map((r) => r.rate).join()}`} s={sensitivity} />}
          {ec ? (
            <PullPanel ws={ws} report={report} ec={ec} />
          ) : (
            <Card>
              <p className="text-ink-3">본문의 밑줄 친 주장을 누르면 근거를 보고 끌어올 수 있습니다.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
