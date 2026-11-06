// ② 논리 역추적 보조: 보고서 가정 옆에 KOTRA 권역별 경제 지표를 '참고 자료'로 붙인다.
// 지표가 가정을 증명하지는 않는다. 담당자가 근거를 찾을 출발점만 제시한다.
import { useState } from "react";
import { detectRegions, indicatorsFor, suspiciousYears, topicsOf, type EconIndicator } from "../../domain/kotra";
import type { Report } from "../../domain/schemas";
import { econ } from "../../data/kotra";
import { Badge, Card, CardTitle, NeedsReview } from "../../components/ui";
import { SourceNote } from "../precheck/PrecheckTab";

const RECENT = 3; // 최근 몇 해를 보여 줄지

export function KotraEvidence({ report }: { report: Report }) {
  const detected = detectRegions(`${report.title}\n${report.text}`);
  const regions = Object.keys(econ.regions);
  const [picked, setPicked] = useState<string | null>(null);
  const region = picked ?? detected[0] ?? null;

  // 근거 없는 가정 먼저, 주제가 잡히는 가정만
  const items = report.claims
    .flatMap((c, ci) => c.assumptions.map((a) => ({ claimNo: ci + 1, ...a, topics: topicsOf(a.text) })))
    .filter((a) => a.topics.length > 0)
    .sort((a, b) => Number(a.grounded) - Number(b.grounded));

  const all = region ? econ.regions[region] ?? [] : [];
  const years = econ.years.slice(-RECENT);

  return (
    <Card>
      <CardTitle
        aside={
          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            권역
            <select
              value={region ?? ""}
              onChange={(e) => setPicked(e.target.value || null)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="">선택</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {detected[0] === r ? " (본문에서 찾음)" : ""}
                </option>
              ))}
            </select>
          </label>
        }
      >
        KOTRA 참고 지표: 가정 검증의 출발점
      </CardTitle>

      {!region ? (
        <p className="text-ink-2">보고서에서 권역(유럽·북미·중남미·CIS)을 찾지 못했습니다. 오른쪽 위에서 권역을 골라 주세요.</p>
      ) : items.length === 0 ? (
        <p className="text-ink-2">KOTRA 지표와 연결할 수 있는 가정(물동량·물가·경기·환율·운임)이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a, i) => (
            <li key={i} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-ink-3">주장 {a.claimNo}의 가정</span>
                {a.grounded ? <Badge tone="ok">근거 있음</Badge> : <Badge tone="warn">가정 근거 없음</Badge>}
                {a.topics.map((t) => (
                  <Badge key={t.id}>{t.label}</Badge>
                ))}
              </div>
              <p className="mt-1.5 text-ink">{a.text}</p>
              <div className="mt-2 space-y-2">
                {a.topics.map((t) => {
                  const inds = indicatorsFor(all, t);
                  if (t.note) return <p key={t.id} className="text-sm text-warn">{t.note}</p>;
                  if (!inds.length) return <p key={t.id} className="text-sm text-ink-3">{region}에 연결할 KOTRA 지표가 없습니다.</p>;
                  return <IndicatorTable key={t.id} inds={inds} years={years} />;
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <NeedsReview />
        <span className="text-sm text-ink-3">
          지표는 권역 전체 수치라 특정 항로·화주의 물동량을 증명하지 않습니다. 근거로 쓰려면 담당자가 보고서에 출처와 함께 붙여 주세요.
        </span>
      </div>
      <div className="mt-2">
        <SourceNote source={econ.source} />
      </div>
    </Card>
  );
}

function IndicatorTable({ inds, years }: { inds: EconIndicator[]; years: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="py-1 pr-3 font-normal">지표</th>
            {years.map((y) => (
              <th key={y} className="py-1 pr-3 text-right font-normal tabular-nums">
                {y}년
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inds.map((ind) => {
            const odd = suspiciousYears(ind, Object.keys(ind.values).sort());
            return (
              <tr key={ind.indicator} className="border-t border-line">
                <td className="py-1.5 pr-3 text-ink-2">
                  {ind.indicator} <span className="text-ink-3">({ind.unit})</span>
                </td>
                {years.map((y) => {
                  const v = ind.values[y];
                  return (
                    <td key={y} className="py-1.5 pr-3 text-right tabular-nums text-ink">
                      {v ? (v.value != null ? v.value.toLocaleString("ko-KR") : v.raw) : "–"}
                      {v?.period && <div className="text-xs text-ink-3">{v.period.replace(/^\d{4}-/, "").replace(/~\d{4}-/, "~")} 누계</div>}
                      {odd.includes(y) && <div className="text-xs text-warn">원자료 확인 필요</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
