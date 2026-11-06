// ⑤ 수출 사전 점검: 서류를 쓰기 전에 KOTRA 수입규제 데이터로 목적국 규제 대상인지 확인한다.
// 반려·재작업이 생기는 '입구'(부킹 단계)에서 막는 것이 목적이다.
import { useEffect, useMemo, useState } from "react";
import {
  PORT_COUNTRY,
  findRegulations,
  isActive,
  normalizeHs,
  summarizeHits,
  type DataSource,
  type RegulationFile,
  type RegulationHit,
} from "../../domain/kotra";
import { countryName, loadRegulations } from "../../data/kotra";
import { seed } from "../../seed";
import { useApp } from "../../store";
import { Badge, Button, Card, CardTitle, Intro, NeedsReview, Stat } from "../../components/ui";
import { icons } from "../../components/infographics";

const PRESETS = [
  { label: "전기강판 → 독일", hs: "7225.11", country: "DE" },
  { label: "PC 강선 → 미국", hs: "7312.10", country: "US" },
  { label: "ESBR 고무 → 미국", hs: "4002.19", country: "US" },
  { label: "철강 와이어 로프 → 네덜란드", hs: "7312.10", country: "NL" },
];

const LEVEL_LABEL: Record<RegulationHit["level"], string> = {
  SAME_6: "6단위 일치",
  BROADER: "규제가 더 넓은 분류(4단위)",
  NARROWER: "입력한 4단위의 하위 품목",
};

const PAGE = 20;

/** 시드 예약 중 HS 코드가 있는 건: 부킹 단계에 입력된 HS 코드 + 양하항 국가 */
export const seedBookings = seed.cases.flatMap((c) => {
  const hs = seed.snapshots.find((s) => s.caseId === c.id && s.field === "hsCode" && s.stage === "BOOKING")?.value;
  const port = c.label.split("→")[1]?.trim();
  const country = port ? PORT_COUNTRY[port] : undefined;
  return hs && country ? [{ caseId: c.id, label: c.label, hs, country }] : [];
});

export function PrecheckTab() {
  const [file, setFile] = useState<RegulationFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { hs, country } = useApp((s) => s.precheckQuery);
  const setQuery = useApp((s) => s.setPrecheckQuery);
  const setHs = (v: string) => setQuery({ hs: v });
  const setCountry = (v: string) => setQuery({ country: v });
  const [shown, setShown] = useState(PAGE);

  const load = () => {
    setLoadError(null);
    loadRegulations()
      .then(setFile)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "알 수 없는 오류"));
  };
  useEffect(load, []);

  const countries = useMemo(() => {
    if (!file) return [];
    const codes = [...new Set(file.rows.map((r) => r.country))];
    return codes.map((c) => ({ code: c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [file]);

  const hits = useMemo(() => (file ? findRegulations(file.rows, { hs, country: country || undefined }) : []), [file, hs, country]);
  const sum = summarizeHits(hits);
  const hsValid = normalizeHs(hs).length >= 4;

  const pick = (h: string, c: string) => {
    setHs(h);
    setCountry(c);
    setShown(PAGE);
  };

  return (
    <div className="space-y-6">
      <Intro icon={icons.shield("size-5")} title="수출 사전 점검 · KOTRA 수입규제">
        서류를 쓰기 <b className="font-semibold text-ink">전에</b> 품목의 HS 코드와 목적국으로{" "}
        <b className="font-semibold text-ink">KOTRA 수입규제 데이터</b>를 조회합니다. 반덤핑·상계관세·세이프가드·우회수출
        규제 대상이면 부킹 단계에서 확인 질문을 띄워, 통관 보류나 서류 반려로 이어지기 전에 막습니다.
      </Intro>

      {seedBookings.length > 0 && file && (
        <Card>
          <CardTitle aside={<Badge>예약 데이터 자동 점검</Badge>}>진행 중인 예약</CardTitle>
          <ul className="divide-y divide-line">
            {seedBookings.map((b) => {
              const s = summarizeHits(findRegulations(file.rows, { hs: b.hs, country: b.country }));
              return (
                <li key={b.caseId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                  <span className="text-ink">{b.label}</span>
                  <span className="text-sm text-ink-3">
                    HS {b.hs} · {countryName(b.country)}
                  </span>
                  {s.active ? (
                    <Badge tone="danger">규제중 {s.active}건</Badge>
                  ) : s.total ? (
                    <Badge tone="warn">조사·기타 {s.total}건</Badge>
                  ) : (
                    <Badge tone="ok">KOTRA 목록 해당 없음</Badge>
                  )}
                  <span className="ml-auto">
                    <Button onClick={() => pick(b.hs, b.country)}>자세히</Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>HS 코드·목적국으로 조회</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-3">HS 코드 (4자리 이상)</span>
            <input
              value={hs}
              onChange={(e) => {
                setHs(e.target.value);
                setShown(PAGE);
              }}
              inputMode="numeric"
              placeholder="예: 7225.11"
              aria-invalid={!hsValid}
              className="w-40 rounded-lg border border-line bg-surface-2/50 px-3 py-1.5 tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-3">목적국 (규제 시행국)</span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setShown(PAGE);
              }}
              disabled={!file}
              className="w-52 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="">전체 국가</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-ink-3">예시</span>
          {PRESETS.map((p) => (
            <Button key={p.label} onClick={() => pick(p.hs, p.country)}>
              {p.label}
            </Button>
          ))}
        </div>
        {!hsValid && <p className="mt-2 text-sm text-warn">HS 코드는 숫자 4자리 이상 입력해 주세요.</p>}
      </Card>

      {loadError && (
        <Card>
          <p className="text-danger" role="alert">
            {loadError}
          </p>
          <div className="mt-2">
            <Button onClick={load}>다시 불러오기</Button>
          </div>
        </Card>
      )}
      {!file && !loadError && (
        <p className="text-ink-3" role="status">
          KOTRA 수입규제 데이터를 불러오는 중…
        </p>
      )}

      {file && hsValid && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="규제중" value={`${sum.active}건`} />
            <Stat label="그중 한국 대상" value={`${sum.activeKorea}건`} />
            <Stat label="조사중" value={`${sum.investigating}건`} sub="향후 규제 가능" />
            <Stat label="조회 범위" value={country ? countryName(country) : "전체 국가"} sub={`KOTRA 수록 ${file.rows.length.toLocaleString("ko-KR")}건`} />
          </div>

          <Card>
            <CardTitle aside={hits.length > 0 ? <NeedsReview /> : undefined}>
              조회 결과 {hits.length}건
            </CardTitle>
            {hits.length === 0 ? (
              <p className="leading-relaxed text-ink-2">
                KOTRA 수입규제 목록에 해당하는 건이 없습니다. 다만 규제가 <b className="font-semibold text-ink">없다는 확인은 아닙니다</b>.
                인증·검역 같은 비관세 요건은 이 목록에 없으니 관세청·현지 무역관으로 확인해 주세요.
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {hits.slice(0, shown).map((h) => (
                    <HitCard key={`${h.reg.country}-${h.reg.id}`} h={h} />
                  ))}
                </ul>
                {hits.length > shown && (
                  <div className="mt-3">
                    <Button onClick={() => setShown((n) => n + PAGE)}>더 보기 ({hits.length - shown}건 남음)</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {file && <SourceNote source={file.source} />}
    </div>
  );
}

function HitCard({ h }: { h: RegulationHit }) {
  const r = h.reg;
  const active = isActive(r);
  return (
    <li className={`rounded-xl border p-4 ${active && r.korea ? "border-danger/50" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{countryName(r.country)}</Badge>
        <Badge tone={active ? "danger" : "warn"}>{r.measure || "규제"}</Badge>
        <Badge tone={active ? "danger" : "neutral"}>{r.status || "상태 미기재"}</Badge>
        {r.korea && <Badge tone="danger">한국 대상</Badge>}
      </div>
      <p className="mt-2 text-ink">{r.product}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-3">일치 코드</dt>
        <dd className="tabular-nums text-ink-2">
          {h.matchedCode} · {LEVEL_LABEL[h.level]}
        </dd>
        {r.targets.length > 0 && (
          <>
            <dt className="text-ink-3">대상국</dt>
            <dd className="text-ink-2">{r.targets.join(", ")}</dd>
          </>
        )}
        {r.period && (
          <>
            <dt className="text-ink-3">기간</dt>
            <dd className="text-ink-2">{r.period}</dd>
          </>
        )}
        {r.duty && (
          <>
            <dt className="text-ink-3">판정·세율</dt>
            <dd className="text-ink-2">{r.duty}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

export function SourceNote({ source }: { source: DataSource }) {
  return (
    <p className="text-xs leading-relaxed text-ink-3">
      출처:{" "}
      <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink-2">
        {source.name}
      </a>{" "}
      ({source.fileName}, 공공데이터포털) · {source.license} · {source.fetchedAt} 내려받음. 원자료 값은 바꾸지 않았습니다.
    </p>
  );
}
