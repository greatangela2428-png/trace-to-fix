// ② 논리 역추적: 보고서를 결론 ← 주장 ← 가정·근거로 분해하고, 규칙으로 약한 고리를 찾는다.
import { useMemo, useState, type ReactNode } from "react";
import { REPORT_MAX_CHARS } from "../../domain/ai";
import { CHECK_KINDS, CHECK_LABEL, checkReport, compareStatus, refKey, weakLinks, type CheckKind } from "../../domain/logic";
import type { Claim, Evidence } from "../../domain/schemas";
import { AS_OF, seed } from "../../seed";
import { useApp } from "../../store";
import { Badge, Button, Card, CardTitle, Intro, NeedsReview, Stat } from "../../components/ui";
import { icons } from "../../components/infographics";
import { KotraEvidence } from "./KotraEvidence";

const KIND_TONE: Record<CheckKind, "danger" | "warn"> = {
  EXPIRED: "danger",
  FIGURE_CONFLICT: "danger",
  NO_SOURCE: "warn",
  UNGROUNDED: "warn",
  MISSING_COMPARE: "warn",
};

const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

export function LogicTab() {
  const logic = useApp((s) => s.logic);
  const analyze = useApp((s) => s.analyzeReport);
  const loadSample = useApp((s) => s.loadSampleReport);
  const [text, setText] = useState(logic.report.text);
  const [weakOnly, setWeakOnly] = useState(false);

  const { report } = logic;
  const findings = useMemo(() => checkReport(report, { asOf: AS_OF }), [report]);
  const weak = useMemo(() => weakLinks(findings), [findings]);
  const claimNo = new Map(report.claims.map((c, i) => [c.id, i + 1]));
  const claimIsWeak = (c: Claim) =>
    weak.has(c.id) ||
    c.evidence.some((_, i) => weak.has(`${c.id}:evidence:${i}`)) ||
    c.assumptions.some((_, i) => weak.has(`${c.id}:assumption:${i}`));
  const weakClaims = report.claims.filter(claimIsWeak).length;
  const loading = logic.status === "loading";
  const tooLong = text.length > REPORT_MAX_CHARS;

  return (
    <div className="space-y-6">
      <Intro icon={icons.layers("size-5")} title="논리 역추적">
        보고서의 결론이 <b className="font-semibold text-ink">어떤 주장·가정·근거 위에 서 있는지</b> 거꾸로 따라갑니다. AI는
        보고서를 <b className="font-semibold text-ink">결론 → 주장 → 근거 → 가정</b>으로 나누기만 하고, 약한 고리(만료된 근거,
        출처 불명확, 근거 없는 가정, 비교 대상 누락, 수치 충돌)는 <b className="font-semibold text-ink">코드 규칙</b>으로
        찾습니다. 결과는 판정이 아니라 담당자가 확인할 점검 항목입니다.
      </Intro>

      <Card>
        <CardTitle
          aside={
            logic.source === "sample" ? (
              <Badge>샘플 · 미리 분해된 데이터</Badge>
            ) : (
              <Badge tone="info">AI 분해 · {logic.model}</Badge>
            )
          }
        >
          보고서 입력
        </CardTitle>
        <label htmlFor="report-text" className="sr-only">
          점검할 보고서 본문
        </label>
        <textarea
          id="report-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full resize-y rounded-xl border border-line bg-surface-2/50 p-3 leading-relaxed text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent"
          placeholder="보고서 본문을 붙여넣으세요. 결론과 그 근거가 들어 있어야 합니다."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => analyze(text)} disabled={loading || tooLong || text.trim().length < 20}>
            {loading ? "AI가 보고서를 나누는 중…" : "AI로 분해·점검"}
          </Button>
          <Button
            onClick={() => {
              loadSample();
              setText(seed.report.text);
            }}
            disabled={loading}
          >
            샘플 보고서로 되돌리기
          </Button>
          <span className={`ml-auto text-sm tabular-nums ${tooLong ? "text-danger" : "text-ink-3"}`}>
            {fmt(text.length)} / {fmt(REPORT_MAX_CHARS)}자
          </span>
        </div>
        {loading && (
          <p className="mt-2 text-sm text-ink-3" role="status">
            보고서 길이에 따라 10~40초 걸립니다. 이메일·전화번호는 가린 뒤 보냅니다.
          </p>
        )}
        {logic.status === "error" && (
          <p className="mt-2 text-sm text-danger" role="alert">
            AI 분해에 실패했어요. {logic.message} 아래에는 직전 결과가 그대로 보입니다.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="점검 결과" value={`점검 항목 ${findings.length}개 발견`} />
        <Stat label="약한 고리가 있는 주장" value={`${weakClaims} / ${report.claims.length}개`} />
        <Stat label="근거 자료" value={`${report.claims.reduce((s, c) => s + c.evidence.length, 0)}개`} />
        <Stat label="점검 기준일" value={AS_OF} sub="유효기간 만료 판단 기준" />
      </div>

      <Card>
        <CardTitle
          aside={
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={weakOnly}
                onChange={(e) => setWeakOnly(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              약한 고리만 보기
            </label>
          }
        >
          역추적 경로: 결론 ← 주장 ← 가정·근거
        </CardTitle>

        <div className="rounded-xl border border-accent/40 bg-surface-2/60 p-4">
          <div className="text-sm text-ink-3">결론 · {report.title}</div>
          <p className="mt-1 font-semibold text-ink">{report.conclusion}</p>
        </div>

        <ol className="mt-3 space-y-3 border-l-2 border-line pl-4 sm:ml-4 sm:pl-6">
          {report.claims.map((c) => {
            if (weakOnly && !claimIsWeak(c)) return null;
            return (
              <li key={c.id}>
                <ClaimNode
                  claim={c}
                  no={claimNo.get(c.id)!}
                  weak={weak}
                  weakOnly={weakOnly}
                  unverified={logic.unverifiedClaimIds.includes(c.id)}
                />
              </li>
            );
          })}
        </ol>
        {report.claims.length === 0 && <p className="mt-3 text-ink-3">분해된 주장이 없습니다.</p>}
      </Card>

      <KotraEvidence report={report} />

      <Card>
        <CardTitle aside={<NeedsReview />}>점검 항목 {findings.length}개</CardTitle>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CHECK_KINDS.map((k) => {
            const n = findings.filter((f) => f.kind === k).length;
            return (
              <Badge key={k} tone={n ? KIND_TONE[k] : "neutral"}>
                {CHECK_LABEL[k]} {n}
              </Badge>
            );
          })}
        </div>
        {findings.length === 0 ? (
          <p className="text-ink-2">규칙으로 찾은 약한 고리가 없습니다. 그래도 결론의 타당성은 담당자가 판단해 주세요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {findings.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <Badge tone={KIND_TONE[f.kind]}>{CHECK_LABEL[f.kind]}</Badge>
                <span className="text-sm text-ink-3">
                  주장 {[...new Set(f.refs.map((r) => claimNo.get(r.claimId)))].join("·")}
                </span>
                <span className="min-w-0 flex-1 text-ink-2">{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ClaimNode({
  claim,
  no,
  weak,
  weakOnly,
  unverified,
}: {
  claim: Claim;
  no: number;
  weak: Map<string, CheckKind[]>;
  weakOnly: boolean;
  unverified: boolean;
}) {
  const claimKinds = weak.get(refKey({ claimId: claim.id, node: "claim" })) ?? [];
  const compares = compareStatus(claim.text, claim.compareTargets);

  return (
    <div className={`rounded-xl border p-4 ${claimKinds.length ? "border-warn/50" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-ink-3">주장 {no}</span>
        <Tags kinds={claimKinds} />
        {unverified && <Badge tone="warn">원문에서 문장 확인 안 됨</Badge>}
      </div>
      <p className="mt-1.5 text-ink">{claim.text}</p>

      {compares.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-ink-3">비교 대상</span>
          {compares.map((x) => (
            <Badge key={x.target} tone={x.compared ? "ok" : "warn"}>
              {x.target} {x.compared ? "비교함" : "비교 없음"}
            </Badge>
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {claim.assumptions.map((a, i) => {
          const kinds = weak.get(`${claim.id}:assumption:${i}`) ?? [];
          if (weakOnly && !kinds.length) return null;
          return (
            <Leaf key={`a${i}`} label="가정" kinds={kinds}>
              <span className="text-ink-2">{a.text}</span>
              {a.grounded && <span className="ml-2 text-sm text-ok">근거 있음</span>}
            </Leaf>
          );
        })}
        {claim.evidence.map((e, i) => {
          const kinds = weak.get(`${claim.id}:evidence:${i}`) ?? [];
          if (weakOnly && !kinds.length) return null;
          return (
            <Leaf key={`e${i}`} label="근거" kinds={kinds}>
              <EvidenceBody e={e} />
            </Leaf>
          );
        })}
        {claim.evidence.length === 0 && !weakOnly && (
          <Leaf label="근거" kinds={[]}>
            <span className="text-ink-3">보고서에 이 주장의 근거 자료가 없습니다.</span>
          </Leaf>
        )}
      </ul>
    </div>
  );
}

function Leaf({ label, kinds, children }: { label: string; kinds: CheckKind[]; children: ReactNode }) {
  const bad = kinds.length > 0;
  return (
    <li
      className={`flex gap-3 rounded-lg px-3 py-2 ${bad ? "bg-danger-soft/60 ring-1 ring-danger/30" : "bg-surface-2/50"}`}
    >
      <span className={`shrink-0 pt-0.5 text-sm font-medium ${bad ? "text-danger" : "text-ink-3"}`}>← {label}</span>
      <div className="min-w-0 flex-1">
        {children}
        {bad && (
          <div className="mt-1.5">
            <Tags kinds={kinds} />
          </div>
        )}
      </div>
    </li>
  );
}

function EvidenceBody({ e }: { e: Evidence }) {
  const figures = Object.entries(e.figures ?? {});
  return (
    <div>
      <div className="text-ink-2">{e.name}</div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3">
        <span>출처: {e.source ?? "없음"}</span>
        {e.validUntil && <span>유효기간: ~{e.validUntil}</span>}
        {figures.map(([k, v]) => (
          <span key={k} className="tabular-nums">
            {k} {fmt(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tags({ kinds }: { kinds: CheckKind[] }) {
  if (!kinds.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {kinds.map((k) => (
        <Badge key={k} tone={KIND_TONE[k]}>
          {CHECK_LABEL[k]}
        </Badge>
      ))}
      <NeedsReview />
    </span>
  );
}
