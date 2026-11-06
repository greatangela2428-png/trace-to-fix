// 근거 끌어오기: 주장을 고르면 연결된 근거와 보관함 추천 후보를 보여 준다. 끌어오는 순간 상태를 코드로 계산한다.
import { useState } from "react";
import { Badge, Button, Card, CardTitle } from "../../components/ui";
import { recommendEvidence } from "../../domain/recommend";
import type { ClaimInput, EvidenceInput, ImpactType, WorkReportInput } from "../../domain/workspace";
import { useApp } from "../../store";
import type { EvaluatedClaim, EvaluatedLink } from "../../rules";
import { previewLink, type Workspace } from "../../workspace/useWorkspace";
import { EvidenceMeta, StatusBadge, fmtField } from "../../workspace/ui";

export function PullPanel({ ws, report, ec }: { ws: Workspace; report: WorkReportInput; ec: EvaluatedClaim }) {
  const unlink = useApp((s) => s.unlinkEvidence);
  const recs = recommendEvidence(ec.claim, ws.evidence, report.title);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle aside={<span className="text-sm text-ink-3">{ec.links.length}건</span>}>끌어온 근거</CardTitle>
        <p className="mb-3 text-ink">“{ec.claim.text}”</p>
        {ec.claimFindings.map((f) => (
          <p key={f.ruleId} className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            <StatusBadge status={f.status} finding={f} /> {f.message}
          </p>
        ))}
        {ec.links.length === 0 ? (
          <p className="text-sm text-ink-3">아직 연결된 근거가 없습니다. 아래 추천 후보에서 끌어오세요.</p>
        ) : (
          <ul className="space-y-3">
            {ec.links.map((l) => (
              <LinkedCard key={`${l.evidenceId}-${l.field ?? ""}`} l={l} onUnlink={() => unlink(report.id, ec.claim.id, l.evidenceId)} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle aside={<Badge>코드 매칭 추천</Badge>}>보관함에서 끌어오기</CardTitle>
        <p className="mb-3 text-xs text-ink-3">
          추천은 AI가 아니라 코드 매칭(값 항목 이름·적용 범위·낱말·보고서 제목)으로 고릅니다. 같은 입력이면 항상 같은 결과가 나옵니다. 병합된 중복본은 대표 근거만 보입니다.
        </p>
        {recs.length === 0 ? (
          <p className="text-sm text-ink-3">이 주장과 맞는 근거 후보가 없습니다. 근거 보관함에서 새로 저장해 주세요.</p>
        ) : (
          <ul className="space-y-3">
            {recs.map((r) => (
              <Candidate key={r.evidence.id} ws={ws} report={report} claim={ec.claim} rec={r} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** 끌어온 근거의 값·유효기간을 바로 고친다. 보관함의 근거를 고치므로 이 근거를 쓰는 모든 보고서가 다시 계산된다 */
function EvidenceEditor({ e, field, onDone }: { e: EvidenceInput; field?: string; onDone: () => void }) {
  const save = useApp((s) => s.saveEvidence);
  const current = field ? e.fields.find((f) => f.key === field) : undefined;
  const [value, setValue] = useState(current ? String(current.value) : "");
  const [validTo, setValidTo] = useState(e.validTo ?? "");
  const [incl, setIncl] = useState(String(e.fields.find((f) => f.key === "포함 항목")?.value ?? ""));
  const cls = "rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent";
  const apply = () => {
    const num = Number(value.replace(/,/g, ""));
    const fields = e.fields.map((f) => (f.key === field ? { ...f, value: value.trim() !== "" && !Number.isNaN(num) ? num : value } : f));
    const withIncl =
      incl.trim() === ""
        ? fields.filter((f) => f.key !== "포함 항목")
        : fields.some((f) => f.key === "포함 항목")
          ? fields.map((f) => (f.key === "포함 항목" ? { ...f, value: incl.trim() } : f))
          : [...fields, { key: "포함 항목", value: incl.trim() }];
    save({ ...e, fields: withIncl, validTo: validTo || undefined });
    onDone();
  };
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-surface-2/60 p-3">
      <p className="text-xs text-ink-3">보관함의 근거를 고칩니다. 이 근거를 쓰는 모든 보고서의 점검과 우선순위가 다시 계산됩니다.</p>
      <div className="flex flex-wrap items-end gap-2 text-sm text-ink-3">
        {field && (
          <label className="flex flex-col gap-1">
            {field}
            <input value={value} onChange={(x) => setValue(x.target.value)} className={`${cls} w-28 tabular-nums`} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          유효 끝
          <input type="date" value={validTo} onChange={(x) => setValidTo(x.target.value)} className={cls} />
        </label>
        <label className="flex flex-col gap-1">
          포함 항목
          <input value={incl} onChange={(x) => setIncl(x.target.value)} placeholder="예: 해상운임" className={`${cls} w-32`} />
        </label>
        <Button variant="primary" onClick={apply}>
          적용
        </Button>
        <Button onClick={onDone}>취소</Button>
      </div>
    </div>
  );
}

function LinkedCard({ l, onUnlink }: { l: EvaluatedLink; onUnlink: () => void }) {
  const e = l.evidence;
  const value = e && l.field ? e.fields.find((f) => f.key === l.field) : undefined;
  const editing = useApp((s) => s.editingEvidenceId === l.evidenceId);
  const setEditing = useApp((s) => s.setEditingEvidence);
  return (
    <li className={`rounded-2xl border p-3.5 ${l.status === "fresh" ? "border-line" : "border-warn/40"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={l.status} finding={l.findings[0]} />
        <Badge>{l.impactType === "direction" ? "방향 영향" : "크기 영향"}</Badge>
        <span className="font-medium text-ink">{e?.title ?? l.evidenceId}</span>
        {value && <span className="tabular-nums text-ink-2">{l.field} {fmtField(value.value, value.unit)}</span>}
      </div>
      {e && <EvidenceMeta e={e} />}
      {l.findings.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-ink-2">
          {l.findings.map((f) => (
            <li key={f.ruleId}>· {f.message}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-3">{l.impactLine}</p>
      {editing && e ? (
        <EvidenceEditor e={e} field={l.field} onDone={() => setEditing(null)} />
      ) : (
        <div className="mt-2 flex gap-1.5">
          {e && <Button onClick={() => setEditing(l.evidenceId)}>근거 고치기</Button>}
          <Button onClick={onUnlink}>연결 해제</Button>
        </div>
      )}
    </li>
  );
}

function Candidate({ ws, report, claim, rec }: { ws: Workspace; report: WorkReportInput; claim: ClaimInput; rec: ReturnType<typeof recommendEvidence>[number] }) {
  const linkEv = useApp((s) => s.linkEvidence);
  const [impact, setImpact] = useState<ImpactType>("magnitude");
  const link = { evidenceId: rec.evidence.id, field: rec.field, impactType: impact };
  const preview = previewLink(report, claim, link, ws.byId, ws.asOf);
  return (
    <li className="rounded-2xl border border-line p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-ink">{rec.evidence.title}</span>
        {preview && <StatusBadge status={preview.status} finding={preview.findings[0]} />}
      </div>
      <EvidenceMeta e={rec.evidence} />
      <p className="mt-1 text-xs text-ink-3">추천 이유: {rec.reasons.join(" · ")}</p>
      {preview && preview.findings.length > 0 && <p className="mt-1 text-sm text-warn">끌어오면: {preview.findings[0]!.message}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm text-ink-3">
          영향{" "}
          <select
            value={impact}
            onChange={(e) => setImpact(e.target.value as ImpactType)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="magnitude">크기에만 영향</option>
            <option value="direction">결론 방향에 영향</option>
          </select>
        </label>
        <Button variant="primary" onClick={() => linkEv(report.id, claim.id, link)}>
          끌어오기
        </Button>
      </div>
    </li>
  );
}
