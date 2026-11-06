// ③ 동일 내용 문서: 제목은 다르지만 내용이 같은 문서를 찾고, 왜 갈라졌는지 이력으로 거꾸로 따라간다.
// 4단계(후보 → 검증 → 이력 → 원인·제안), 단계마다 사람이 확인할 수 있다. 병합(원본 연결)은 승인해야 반영된다.
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardTitle, ConfirmButton, Intro, NeedsReview, Stat } from "../../components/ui";
import { icons } from "../../components/infographics";
import { CAUSE_LABEL, SUGGESTION_LABEL, analyzePair, findCandidates, type PairAnalysis } from "../../domain/similar";
import { seed } from "../../seed";
import { useApp } from "../../store";
import { SampleNotice } from "../../workspace/ui";

const DEPTS = [...new Set(seed.docs.map((d) => d.dept))];
const ACCESS = [{ id: "all", label: "전체 부서", depts: [] as string[] }, ...DEPTS.map((d) => ({ id: d, label: `${d}만`, depts: [d] }))];

export function DocsTab() {
  const [threshold, setThreshold] = useState(0.95);
  const [access, setAccess] = useState("all");
  const decisions = useApp((s) => s.docDecisions);
  const allowed = ACCESS.find((a) => a.id === access)?.depts ?? [];

  const { candidates, excluded } = useMemo(() => findCandidates(seed.docs, threshold, allowed), [threshold, allowed]);
  const analyses = useMemo(() => candidates.map(analyzePair), [candidates]);
  const same = analyses.filter((a) => a.verification.sameContent);
  const separate = analyses.filter((a) => !a.verification.sameContent);
  const branched = same.filter((a) => a.history.branch);
  const linked = Object.values(decisions).filter((d) => d.decision === "LINK_APPROVED").length;

  return (
    <div className="space-y-6">
      <Intro icon={icons.doc("size-5")} title="동일 내용 문서">
        제목은 다르지만 <b className="font-semibold text-ink">내용이 같은 문서</b>를 찾아, 언제 어디서 갈라졌는지 이력으로 거꾸로 따라갑니다. 비슷해 보여도
        <b className="font-semibold text-ink"> 기준자료·거래처·항로</b>가 다르면 병합하지 않습니다(경쟁사 견적 오탐 방지). 이력이 없으면 '유사함'까지만 말합니다.
      </Intro>
      <SampleNotice>유사도는 시드에 넣어 둔 8차원 샘플 임베딩으로 계산합니다(실제 문서 임베딩 아님).</SampleNotice>

      <Card>
        <CardTitle>조건</CardTitle>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="block">
            <span className="flex items-center justify-between text-sm text-ink-3">
              유사도 임계값 <span className="tabular-nums font-semibold text-ink">{threshold.toFixed(3)}</span>
            </span>
            <input
              type="range"
              min={0.8}
              max={1}
              step={0.005}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
              aria-label="유사도 임계값"
            />
            <span className="mt-1 block text-xs text-ink-3">낮추면 후보가 늘고(오탐 증가), 높이면 줄어듭니다. 후보는 2단계 검증을 통과해야 같은 내용으로 봅니다.</span>
          </label>
          <label className="block text-sm text-ink-3">
            열람 권한
            <select
              value={access}
              onChange={(e) => setAccess(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              {ACCESS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            {excluded.length > 0 && <span className="mt-1 block text-xs">권한 밖 문서 {excluded.length}건은 비교에서 제외했습니다.</span>}
          </label>
        </div>
      </Card>

      <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="처리 단계">
        <li>
          <Stat label="1 · 후보 찾기" value={`${candidates.length}쌍`} sub={`유사도 ${threshold.toFixed(3)} 이상`} />
        </li>
        <li>
          <Stat label="2 · 검증" value={`같은 내용 ${same.length}쌍`} sub={`별개 문서(병합 안 함) ${separate.length}쌍`} />
        </li>
        <li>
          <Stat label="3 · 이력 역추적" value={`분기 확인 ${branched.length}쌍`} sub={`추정 불가 ${same.length - branched.length}쌍`} />
        </li>
        <li>
          <Stat label="4 · 원인·제안" value={`원본 연결 승인 ${linked}건`} sub="승인해야 반영" />
        </li>
      </ol>

      {analyses.length === 0 ? (
        <Card>
          <p className="text-ink-2">이 조건에서 후보가 없습니다. 임계값을 낮추거나 열람 권한을 넓혀 보세요.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...same, ...separate].map((a) => (
            <PairCard key={a.candidate.key} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function PairCard({ a }: { a: PairAnalysis }) {
  const { candidate: c, verification: v, history: h } = a;
  const decision = useApp((s) => s.docDecisions[c.key]);
  const decide = useApp((s) => s.decideDoc);
  const undo = useApp((s) => s.undoDoc);
  const docTitle = (id: string) => (id === c.a.id ? c.a.title : c.b.title);
  const vaultIds = useApp((s) => s.ws.evidence.map((e) => e.id).join(","));
  // 이 문서들이 근거 보관함에 있으면(E-D1…) 병합을 보관함·보고서 링크에 실제로 반영한다
  const inVault = vaultIds.split(",").includes(evidenceIdOf(c.a.id)) && vaultIds.split(",").includes(evidenceIdOf(c.b.id));

  return (
    <Card className={v.sameContent ? "" : "opacity-90"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="info">유사도 {(c.similarity * 100).toFixed(1)}%</Badge>
        {v.sameContent ? <Badge tone="warn">같은 내용</Badge> : <Badge>별개 문서 · 병합 안 함</Badge>}
        {v.sameContent && <NeedsReview />}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[c.a, c.b].map((d) => (
          <div key={d.id} className="rounded-2xl bg-surface-2/60 p-3">
            <div className="font-semibold text-ink">{d.title}</div>
            <div className="text-sm text-ink-3">
              {d.dept} · {d.id}
            </div>
            <p className="mt-1 text-sm text-ink-2">{d.text}</p>
          </div>
        ))}
      </div>

      {/* 2단계 */}
      <section className="mt-4">
        <h3 className="text-sm font-semibold text-ink-2">2 · 검증(핵심 항목: 기준자료·거래처·항로)</h3>
        {!v.sameContent ? (
          <p className="mt-1 text-sm text-ink-2">
            {v.coreMismatches.map((m) => `${m.key}가 다릅니다('${m.a ?? "–"}' vs '${m.b ?? "–"}')`).join(", ")}. 비슷해 보여도 다른 자료라 병합하지 않습니다.
          </p>
        ) : v.valueMismatches.length ? (
          <table className="mt-1 text-sm">
            <tbody>
              {v.valueMismatches.map((m) => (
                <tr key={m.key}>
                  <td className="pr-3 text-ink-3">{m.key}</td>
                  <td className="pr-3 tabular-nums text-danger">{m.a ?? "–"}</td>
                  <td className="pr-3 text-ink-3">vs</td>
                  <td className="tabular-nums text-danger">{m.b ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-sm text-ok">핵심 항목과 값이 모두 같습니다.</p>
        )}
      </section>

      {v.sameContent && (
        <>
          {/* 3단계 */}
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-ink-2">3 · 이력 역추적</h3>
            {h.timeline.length === 0 ? (
              <p className="mt-1 text-sm text-ink-3">두 문서 모두 이력이 없습니다.</p>
            ) : (
              <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-4">
                {h.timeline.map((e, i) => (
                  <li key={i} className={`text-sm ${e.isBranch ? "font-semibold text-warn" : "text-ink-2"}`}>
                    <span className="tabular-nums text-ink-3">{e.at.slice(0, 16).replace("T", " ")}</span> · {docTitle(e.docId)} · {e.event}
                    {e.isBranch && <Badge tone="warn">분기 지점</Badge>}
                  </li>
                ))}
              </ol>
            )}
            {h.missingHistory.length > 0 && (
              <p className="mt-1 text-sm text-ink-3">이력 없음: {h.missingHistory.map(docTitle).join(", ")}</p>
            )}
          </section>

          {/* 4단계 */}
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-ink-2">4 · 원인 분류·개선 제안</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {a.causes.map((x) => (
                <li key={x.code}>
                  <Badge tone={x.code === "UNKNOWN" ? "neutral" : "warn"}>{CAUSE_LABEL[x.code]}</Badge> <span className="text-ink-2">{x.detail}</span>
                </li>
              ))}
              {a.observations.map((x) => (
                <li key={x.code}>
                  <Badge>관찰 · {CAUSE_LABEL[x.code]}</Badge> <span className="text-ink-3">{x.detail}</span>
                </li>
              ))}
            </ul>
            <ol className="mt-3 space-y-1 text-sm">
              {a.suggestions.map((s, i) => (
                <li key={s.code} className="text-ink-2">
                  <span className="font-medium text-ink">
                    {i + 1}. {SUGGESTION_LABEL[s.code]}
                  </span>{" "}
                  — {s.detail}
                </li>
              ))}
            </ol>
            {inVault && <MergeDecision a={a} />}
            {!inVault && !decision && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ConfirmButton label="원본 하나로 연결(참조만)" confirmLabel={`'${c.a.title}'을 원본으로 승인`} onConfirm={() => decide(c.key, "LINK_APPROVED")} />
                <Button onClick={() => decide(c.key, "KEEP_SEPARATE")}>별개로 유지</Button>
              </div>
            )}
            {!inVault && decision && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={decision.decision === "LINK_APPROVED" ? "ok" : "neutral"}>{decision.decision === "LINK_APPROVED" ? "원본 연결 승인" : "별개로 유지"}</Badge>
                <Button onClick={() => undo(c.key)}>되돌리기</Button>
              </div>
            )}
          </section>
        </>
      )}
    </Card>
  );
}

/** 동일 내용 문서 ↔ 근거 보관함 항목 */
const evidenceIdOf = (docId: string) => `E-${docId}`;

/**
 * 병합 결정(보관함 반영): 값이 다른 항목은 맞는 값을 먼저 고른다 → 두 번 눌러 승인 →
 * 구성원은 대표를 가리키고, 모든 보고서의 링크가 대표로 옮겨진다. 되돌릴 수 있다.
 */
function MergeDecision({ a }: { a: PairAnalysis }) {
  const { candidate: c, verification: v } = a;
  const decision = useApp((s) => s.docDecisions[c.key]);
  const log = useApp((s) => s.mergeLog[c.key]);
  const merge = useApp((s) => s.mergeEvidence);
  const decide = useApp((s) => s.decideDoc);
  const undo = useApp((s) => s.undoDoc);
  const reports = useApp((s) => s.ws.reports);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const canonicalId = evidenceIdOf(c.a.id);
  const memberId = evidenceIdOf(c.b.id);
  const ready = v.valueMismatches.every((m) => chosen[m.key] !== undefined);
  const title = (id: string) => reports.find((r) => r.id === id)?.title ?? id;
  const evidence = useApp((s) => s.ws.evidence);
  // 다른 쌍에서 이미 병합된 근거면 다시 병합하지 않는다(대표가 둘이 되는 것 방지)
  const merged = evidence.find((e) => (e.id === memberId || e.id === canonicalId) && e.canonicalId);

  if (!decision && merged)
    return (
      <p className="mt-3 text-sm text-ink-3">
        이미 병합됨: '{merged.title}'은 '{evidence.find((e) => e.id === merged.canonicalId)?.title ?? merged.canonicalId}'을 가리킵니다. 다른 쌍의 병합을 되돌리면 다시 결정할 수 있습니다.
      </p>
    );

  if (decision)
    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={decision.decision === "LINK_APPROVED" ? "ok" : "neutral"}>
            {decision.decision === "LINK_APPROVED" ? `병합 승인 · '${c.b.title}' → 대표 '${c.a.title}'` : "별개로 유지"}
          </Badge>
          <Button onClick={() => undo(c.key)}>되돌리기</Button>
        </div>
        {log && (
          <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">
            근거 보관함에 반영했습니다. 보고서 링크 {log.repointed.length}건이 대표 근거를 가리키도록 바뀌었습니다
            {log.repointed.length ? `: ${log.repointed.map((x) => `${title(x.reportId)}(${x.claimId})`).join(", ")}` : "(이 근거를 쓰던 보고서 없음)"}.
          </p>
        )}
      </div>
    );

  return (
    <div className="mt-3 space-y-2">
      {v.valueMismatches.map((m) => (
        <fieldset key={m.key} className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">{m.key} 맞는 값</legend>
          <span className="text-ink-3">{m.key} 맞는 값</span>
          {[m.a, m.b].map((val, i) =>
            val === undefined ? null : (
              <label key={i} className={`cursor-pointer rounded-full border px-3 py-1 ${chosen[m.key] === val ? "border-accent bg-info-soft text-ink" : "border-line text-ink-2"}`}>
                <input type="radio" name={`${c.key}-${m.key}`} className="sr-only" checked={chosen[m.key] === val} onChange={() => setChosen((x) => ({ ...x, [m.key]: val }))} />
                {val} <span className="text-xs text-ink-3">({i === 0 ? c.a.title : c.b.title})</span>
              </label>
            ),
          )}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {ready ? (
          <ConfirmButton
            label="대표로 병합(보관함 반영)"
            confirmLabel={`'${c.a.title}'을 대표로 병합 승인`}
            onConfirm={() =>
              merge(
                c.key,
                canonicalId,
                memberId,
                Object.fromEntries(Object.entries(chosen).map(([k, val]) => [k, Number.isNaN(Number(val)) ? val : Number(val)])),
              )
            }
          />
        ) : (
          <Button disabled>맞는 값을 먼저 고르세요</Button>
        )}
        <Button onClick={() => decide(c.key, "KEEP_SEPARATE")}>별개로 유지</Button>
      </div>
      <p className="text-xs text-ink-3">병합하면 '{c.b.title}'은 대표를 가리키고, 이 근거를 쓰던 모든 보고서의 링크가 대표로 옮겨집니다. 점검·우선순위·TODO가 바로 다시 계산됩니다.</p>
    </div>
  );
}
