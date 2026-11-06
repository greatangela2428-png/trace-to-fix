// 근거 저장 화면: 입력하는 동안 저장 시점 점검(①)과 중복 점검(③)을 바로 보여 준다.
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardTitle } from "../../components/ui";
import { AS_OF } from "../../seed";
import { EVIDENCE_TYPES, EVIDENCE_TYPE_LABEL, type EvidenceInput, type EvidenceType } from "../../domain/workspace";
import { requiredFields } from "../../rules/save/requiredFields";
import { findDuplicates } from "../../domain/dedupe";
import { fieldLabel } from "../../domain/labels";
import { useApp } from "../../store";
import type { Workspace } from "../../workspace/useWorkspace";
import { requiredLabel } from "../../workspace/ui";

interface Row {
  key: string;
  value: string;
  unit: string;
}

/** 유형별 기본 입력 칸(저장할 때 무엇을 적어야 하는지 바로 보이게) */
const TEMPLATE: Partial<Record<EvidenceType, Row[]>> = {
  rate_table: [
    { key: "운임", value: "", unit: "USD/FEU" },
    { key: "포함 항목", value: "", unit: "" },
  ],
  quote_mail: [
    { key: "운임", value: "", unit: "USD/FEU" },
    { key: "포함 항목", value: "", unit: "" },
  ],
  booking_record: [
    { key: "consigneeAddress", value: "", unit: "" },
    { key: "hsCode", value: "", unit: "" },
    { key: "portOfDischarge", value: "", unit: "" },
    { key: "grossWeight", value: "", unit: "kg" },
  ],
};

const input =
  "w-full rounded-xl border border-line bg-surface-2/50 px-3 py-1.5 text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent";

export function EvidenceForm({ ws, onDone }: { ws: Workspace; onDone: () => void }) {
  const save = useApp((s) => s.saveEvidence);
  const [type, setType] = useState<EvidenceType>("booking_record");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState<Row[]>(TEMPLATE.booking_record ?? []);
  const [id] = useState(() => `E-NEW-${Date.now().toString(36)}`);

  const draft: EvidenceInput = useMemo(
    () => ({
      id,
      type,
      title: title.trim() || "(제목 없음)",
      source: source.trim(),
      capturedAt: AS_OF,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      scope: scope.split(",").map((s) => s.trim()).filter(Boolean),
      fields: rows
        .filter((r) => r.key.trim())
        .map((r) => {
          const n = Number(r.value.replace(/,/g, ""));
          const value = r.value.trim() !== "" && !Number.isNaN(n) && /^[\d,.\s-]+$/.test(r.value) ? n : r.value.trim();
          return { key: r.key.trim(), value, ...(r.unit.trim() ? { unit: r.unit.trim() } : {}) };
        }),
    }),
    [id, type, title, source, validFrom, validTo, scope, rows],
  );

  const missing = requiredFields.check(draft, ws.specs);
  const approvedMissing = missing.filter((f) => ws.specs.some((s) => s.type === type && s.field === f && s.origin === "approved"));
  // 보고서 반려에서 도출한 후보(승인 전): 기본 권장 경고 대신 데이터 근거를 보여 준다
  const reportPending = ws.reportCandidates.filter((c) => c.types.includes(type) && !approvedMissing.includes(c.field) && missing.includes(c.field));
  const baselineMissing = missing.filter((f) => !approvedMissing.includes(f) && !reportPending.some((c) => c.field === f));
  // 승인 전 후보: 비어 있어도 경고만, 양식에는 반영하지 않는다(원칙 5)
  const pendingCandidates =
    type === "booking_record"
      ? ws.candidates.filter((c) => !ws.specs.some((s) => s.origin === "approved" && s.field === c.field)).filter((c) => !draft.fields.find((f) => f.key === c.field && f.value !== ""))
      : [];
  const dup = findDuplicates([...ws.evidence, draft]).find((g) => g.canonicalId === id || g.memberIds.includes(id));
  const dupTarget = dup ? ws.byId.get(dup.canonicalId === id ? dup.memberIds[0]! : dup.canonicalId) : undefined;

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Card className="border-accent/40">
      <CardTitle aside={<Button onClick={onDone}>닫기</Button>}>근거 저장</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-ink-3">
          유형
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as EvidenceType;
              setType(t);
              setRows(TEMPLATE[t] ?? [{ key: "", value: "", unit: "" }]);
            }}
            className={input}
          >
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVIDENCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-3">
          제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="예: BK-261110 부킹 접수 기록" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-3">
          출처(파일·시스템·발신 부서, 개인명 제외)
          <input value={source} onChange={(e) => setSource(e.target.value)} className={input} placeholder="예: 부킹 시스템" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-3">
          적용 범위(쉼표로 구분)
          <input value={scope} onChange={(e) => setScope(e.target.value)} className={input} placeholder="예: 부산-로테르담" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-3">
          유효 시작
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-3">
          유효 끝
          <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className={input} />
        </label>
      </div>

      <div className="mt-4 text-sm text-ink-3">값</div>
      <ul className="mt-1 space-y-2">
        {rows.map((r, i) => {
          const flagged = missing.includes(r.key) || pendingCandidates.some((c) => c.field === r.key);
          return (
            <li key={i} className="grid grid-cols-[1fr_1.4fr_0.7fr] gap-2">
              <input value={r.key} onChange={(e) => setRow(i, { key: e.target.value })} className={input} aria-label="항목" placeholder="항목" />
              <input
                value={r.value}
                onChange={(e) => setRow(i, { value: e.target.value })}
                className={`${input} ${flagged ? "ring-1 ring-warn/60" : ""}`}
                aria-label={`${fieldLabel(r.key)} 값`}
                placeholder={fieldLabel(r.key)}
              />
              <input value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className={input} aria-label="단위" placeholder="단위" />
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <Button onClick={() => setRows((rs) => [...rs, { key: "", value: "", unit: "" }])}>값 추가</Button>
      </div>

      <div className="mt-4 space-y-2" aria-live="polite">
        {approvedMissing.length > 0 && (
          <p className="text-sm text-danger">
            승인된 필수 항목이 비어 있습니다: {approvedMissing.map((f) => fieldLabel(requiredLabel(f))).join(", ")}
          </p>
        )}
        {baselineMissing.length > 0 && (
          <p className="text-sm text-warn">기본 권장 항목이 비어 있습니다: {baselineMissing.map(requiredLabel).join(", ")} (작성 중 점검이 판단하려면 필요합니다)</p>
        )}
        {reportPending.map((c) => (
          <p key={c.key} className="text-sm text-ink-3">
            <Badge tone="info">필수 후보 · 승인 전</Badge> {requiredLabel(c.field)}이(가) 비어 있습니다. 보고서 반려 {c.preventable.length}건이 저장 단계에서 이 항목이 비어 있어 생겼습니다. 재작업 역추적에서 승인하기 전에는 양식에 반영되지 않습니다.
          </p>
        ))}
        {pendingCandidates.map((c) => (
          <p key={c.field} className="text-sm text-ink-3">
            <Badge tone="info">필수 후보 · 승인 전</Badge> {c.label}이(가) 비어 있습니다. {c.rationale} 재작업 역추적에서 승인하기 전에는 양식에 반영되지 않습니다.
          </p>
        ))}
        {dup && dupTarget && (
          <p className="text-sm text-warn">
            {dup.kind === "duplicate" ? "같은 내용의 근거가 이미 있습니다" : "복사본으로 보이는데 값이 다릅니다"}: '{dupTarget.title}'. 새로 저장하기보다 기존 근거를 연결하는 것이 좋은지 확인해 주세요.
          </p>
        )}
        {missing.length === 0 && pendingCandidates.length === 0 && !dup && <p className="text-sm text-ok">저장 시점 점검 항목이 없습니다.</p>}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          disabled={!title.trim()}
          onClick={() => {
            save(draft);
            onDone();
          }}
        >
          보관함에 저장
        </Button>
        <span className="self-center text-xs text-ink-3">비어 있는 항목이 있어도 저장은 됩니다(경고만 표시).</span>
      </div>
    </Card>
  );
}
