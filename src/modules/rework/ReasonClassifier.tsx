// 반려 메일 → 사유 코드(AI 제안) → 사람이 한 번에 확인·수정
import { useState } from "react";
import { REASON_CODES, type ReasonCode } from "../../domain/schemas";
import { REASON_LABEL } from "../../domain/ai";
import { useApp } from "../../store";
import { Badge, Button, NeedsReview } from "../../components/ui";

export function ReasonClassifier({ caseId, text, existing }: { caseId: string; text: string; existing?: ReasonCode }) {
  const st = useApp((s) => s.aiReasons[caseId]);
  const classify = useApp((s) => s.classifyReason);
  const confirm = useApp((s) => s.confirmReason);
  const reset = useApp((s) => s.resetReason);
  const [picked, setPicked] = useState<ReasonCode | null>(null);
  const selectId = `reason-${caseId}`;

  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
      <div>
        <div className="text-sm text-ink-3">반려 의견</div>
        <blockquote className="mt-1 border-l-2 border-line pl-3 text-ink-2">“{text}”</blockquote>
        {existing && (
          <div className="mt-1.5 text-sm text-ink-3">
            등록된 사유: <span className="text-ink-2">{REASON_LABEL[existing]}</span>
          </div>
        )}
      </div>

      {!st && (
        <Button variant="primary" onClick={() => classify(caseId, text)}>
          AI로 사유 분류
        </Button>
      )}

      {st?.status === "loading" && (
        <p className="text-ink-2" role="status">
          AI가 반려 의견을 읽고 있어요…
        </p>
      )}

      {st?.status === "error" && (
        <div className="space-y-2" role="alert">
          <p className="text-danger">AI 분류에 실패했어요. {st.message}</p>
          <Button onClick={() => classify(caseId, text)}>다시 시도</Button>
        </div>
      )}

      {st?.status === "done" && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-3">AI 제안</span>
            <Badge tone={st.result.needsHuman ? "warn" : "info"}>{REASON_LABEL[st.result.code]}</Badge>
            <span className="text-sm tabular-nums text-ink-3">신뢰도 {Math.round(st.result.confidence * 100)}%</span>
            <NeedsReview />
          </div>

          {st.result.evidence && (
            <p className="text-sm text-ink-2">
              근거 인용: “{st.result.evidence}”{" "}
              {st.result.evidenceVerified ? (
                <span className="text-ok">· 원문에서 확인됨</span>
              ) : (
                <span className="text-warn">· 원문에서 찾을 수 없음</span>
              )}
            </p>
          )}
          {st.result.note && (
            <p className="text-sm text-warn">
              {st.result.note} (AI가 처음 고른 사유: {REASON_LABEL[st.result.suggestedCode]})
            </p>
          )}

          {st.confirmed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok">확정: {REASON_LABEL[st.confirmed.code]}</Badge>
              <span className="text-sm text-ink-3">
                {st.confirmed.by === "AI_ACCEPTED" ? "AI 제안을 확인함" : "사람이 수정함"}
              </span>
              <Button
                onClick={() => {
                  setPicked(null);
                  reset(caseId);
                }}
              >
                다시 분류
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={selectId} className="sr-only">
                확정할 반려 사유
              </label>
              <select
                id={selectId}
                value={picked ?? st.result.code}
                onChange={(e) => setPicked(e.target.value as ReasonCode)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                {REASON_CODES.map((c) => (
                  <option key={c} value={c}>
                    {REASON_LABEL[c]}
                  </option>
                ))}
              </select>
              <Button variant="primary" onClick={() => confirm(caseId, picked ?? st.result.code)}>
                이 사유로 확정
              </Button>
            </div>
          )}
          <p className="text-xs text-ink-3">모델 {st.result.model} · 이메일·전화번호는 가린 뒤 보냈어요.</p>
        </div>
      )}
    </div>
  );
}
