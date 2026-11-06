// 근거 보관함: 근거를 한 번 저장하고, 어느 보고서가 쓰는지·중복인지·필수 항목이 비었는지를 한눈에 본다.
import { useState } from "react";
import { Badge, Button, Card, CardTitle, Intro, Stat } from "../../components/ui";
import { icons } from "../../components/infographics";
import { EVIDENCE_TYPES, EVIDENCE_TYPE_LABEL, type EvidenceItem, type EvidenceType } from "../../domain/workspace";
import { fieldLabel, formatKRW } from "../../domain/labels";
import { groupOf, useWorkspace, type Workspace } from "../../workspace/useWorkspace";
import { EvidenceMeta, SampleNotice, fmtField, requiredLabel } from "../../workspace/ui";
import { EvidenceForm } from "./EvidenceForm";
import { WeakPanel } from "./WeakPanel";
import { useApp } from "../../store";

export function VaultTab() {
  const ws = useWorkspace();
  const [filter, setFilter] = useState<EvidenceType | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const focus = useApp((s) => s.focus);
  const list = ws.evidence.filter((e) => filter === "all" || e.type === filter);
  const used = ws.evidence.filter((e) => e.usedByReportIds.length > 0).length;
  const missingCount = ws.evidence.filter((e) => e.requiredFieldsMissing.length > 0).length;

  return (
    <div className="space-y-6">
      <Intro icon={icons.container("size-5")} title="근거 보관함">
        운임표·견적 메일·계약·실적·규제 같은 근거를 <b className="font-semibold text-ink">한 번만 저장</b>하고, 보고서는 여기서 필요한 근거만 끌어옵니다.
        같은 내용은 하나로 묶어 모든 보고서가 같은 출처를 가리키게 하고, 저장할 때 비어 있으면 반려로 이어지는 항목을 바로 알려 줍니다.
      </Intro>
      <SampleNotice />
      {focus === "weak" && <WeakPanel ws={ws} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="저장된 근거" value={`${ws.evidence.length}건`} />
        <Stat label="보고서에서 사용 중" value={`${used}건`} sub={`${ws.reports.length}개 보고서 기준`} />
        <Stat label="중복·분기 묶음" value={`${ws.duplicates.length}개`} sub="병합은 개선 탭에서 승인" />
        <Stat label="필수 항목 비어 있음" value={`${missingCount}건`} sub="승인된 규칙 + 기본 권장" />
      </div>

      <RequiredPanel ws={ws} />

      {formOpen ? (
        <EvidenceForm ws={ws} onDone={() => setFormOpen(false)} />
      ) : (
        <div>
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            + 근거 저장
          </Button>
        </div>
      )}

      <Card>
        <CardTitle aside={<span className="text-sm text-ink-3">{list.length}건</span>}>근거 목록</CardTitle>
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="유형 필터">
          {(["all", ...EVIDENCE_TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-3 py-1 text-sm transition ${filter === t ? "bg-accent text-on-accent" : "border border-line text-ink-3 hover:text-ink"}`}
            >
              {t === "all" ? "전체" : EVIDENCE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="text-ink-3">이 유형의 근거가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((e) => (
              <EvidenceRow key={e.id} e={e} ws={ws} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EvidenceRow({ e, ws }: { e: EvidenceItem; ws: Workspace }) {
  const [open, setOpen] = useState(false);
  const g = groupOf(ws.duplicates, e.id);
  const canonical = e.canonicalId ? ws.byId.get(e.canonicalId) : undefined;
  const reportTitle = (id: string) => ws.reportById.get(id)?.report.title ?? id;

  return (
    <li className="rounded-2xl border border-line p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-ink">{e.title}</span>
          {canonical && <Badge tone="info">병합됨 → {canonical.title}</Badge>}
          {g?.kind === "duplicate" && g.memberIds.includes(e.id) && <Badge tone="warn">중복 후보 · '{ws.byId.get(g.canonicalId)?.title}'과 같은 내용</Badge>}
          {g?.kind === "duplicate" && g.canonicalId === e.id && <Badge>대표 후보</Badge>}
          {g?.kind === "diverged" && g.memberIds.includes(e.id) && (
            <Badge tone="warn">분기 · {g.differences.map((d) => d.key).join(", ")} 값이 다름</Badge>
          )}
          {e.requiredFieldsMissing.length > 0 && (
            <Badge tone="warn">비어 있음: {e.requiredFieldsMissing.map((f) => fieldLabel(requiredLabel(f))).join(", ")}</Badge>
          )}
        </div>
        <EvidenceMeta e={e} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-ink-3">사용된 보고서</span>
          {e.usedByReportIds.length ? e.usedByReportIds.map((id) => <Badge key={id}>{reportTitle(id)}</Badge>) : <span className="text-ink-3">없음</span>}
        </div>
      </button>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <table className="w-full text-sm">
            <tbody>
              {e.fields.map((f) => (
                <tr key={f.key} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pr-3 text-ink-3">{fieldLabel(f.key)}</td>
                  <td className="py-1.5 tabular-nums text-ink">{f.value === "" ? <span className="text-warn">비어 있음</span> : fmtField(f.value, f.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g?.branchNote && g.memberIds.includes(e.id) && <p className="mt-2 text-sm text-warn">{g.branchNote}</p>}
          {e.history && e.history.length > 0 && (
            <ol className="mt-2 space-y-0.5 text-sm text-ink-3">
              {e.history.map((h) => (
                <li key={h.at}>
                  {h.at.slice(0, 16).replace("T", " ")} · {h.event}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

/** 저장 필수 항목: 승인된 규칙 / 반려 데이터에서 도출한 후보(승인 전) / 기본 권장 */
function RequiredPanel({ ws }: { ws: Workspace }) {
  const keys = useApp((s) => s.ws.approvedRequired);
  const setTab = useApp((s) => s.setTab);
  const approvedSpecs = ws.specs.filter((s) => s.origin === "approved");
  // 승인된 필수 항목을 필드별로 묶어 "운임표·견적 메일·계약 · 포함 항목"처럼 보여 준다
  const approvedByField = [...new Set(approvedSpecs.map((s) => s.field))].map((field) => ({
    field,
    label: approvedSpecs.find((s) => s.field === field)!.label,
    types: approvedSpecs.filter((s) => s.field === field).map((s) => EVIDENCE_TYPE_LABEL[s.type]),
  }));
  const pendingReport = ws.reportCandidates.filter((c) => !keys.includes(c.key));
  const pendingBooking = ws.candidates.filter((c) => !keys.includes(c.key));
  return (
    <Card>
      <CardTitle aside={<Badge tone="info">저장 시점 점검</Badge>}>저장 필수 항목</CardTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-2">승인된 필수 항목</h3>
          {approvedByField.length === 0 ? (
            <p className="mt-1 text-sm text-ink-3">아직 없습니다. 오른쪽 후보를 재작업 역추적에서 승인하면 저장 화면에 반영됩니다.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {approvedByField.map((s) => (
                <li key={s.field}>
                  <Badge tone="ok">필수</Badge> {s.types.join("·")} · {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-2">반려 데이터에서 도출한 후보(승인 전)</h3>
          <ul className="mt-1 space-y-2 text-sm">
            {pendingReport.map((c) => (
              <li key={c.key} className="text-ink-2">
                <span className="font-medium text-ink">운임표·견적 메일·계약 · {c.label}</span>
                <br />
                <span className="text-ink-3">
                  보고서 반려 {c.preventable.length}건({formatKRW(c.preventableCost)})이 저장 단계에서 비어 있었음
                </span>
              </li>
            ))}
            {pendingBooking.map((c) => (
              <li key={c.key} className="text-ink-2">
                <span className="font-medium text-ink">부킹 기록 · {c.label}</span>
                <br />
                <span className="text-ink-3">
                  필수였다면 {c.preventable.length}건({formatKRW(c.preventableCost)}) 방지 · 선적 서류 재작업 {c.totalCases}건 중
                </span>
              </li>
            ))}
            {pendingReport.length + pendingBooking.length === 0 && <li className="text-ink-3">모두 승인되었습니다.</li>}
          </ul>
          {pendingReport.length + pendingBooking.length > 0 && (
            <button type="button" onClick={() => setTab("rework")} className="mt-2 text-xs text-accent underline-offset-2 hover:underline">
              재작업 역추적에서 효과·부담 보고 승인하기 →
            </button>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-2">기본 권장(데이터 도출 아님)</h3>
          <p className="mt-1 text-sm text-ink-3">운임표·견적 메일·계약: 포함 항목, 유효기간, 적용 구간. 작성 중 점검이 판단하려면 필요한 값이라 비어 있으면 알려 줍니다.</p>
        </div>
      </div>
    </Card>
  );
}
