// 금액 민감도 박스: 충돌한 운임 값마다 할인율·연 절감액을 코드로 계산하고, 슬라이더로 다른 운임을 넣어 본다.
import { useState } from "react";
import { Badge, Card, CardTitle } from "../../components/ui";
import { discountOf, savingOf, type Sensitivity } from "../../domain/sensitivity";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const eok = (n: number) => `${(n / 1e8).toFixed(2)}억 원`;

export function SensitivityBox({ s }: { s: Sensitivity }) {
  const min = Math.floor((Math.min(...s.rows.map((r) => r.rate)) - 200) / 10) * 10;
  const [rate, setRate] = useState(s.rows[0]!.rate);
  const saving = savingOf(s.base.rate, rate, s.volume.value, s.fxKrwPerUsd);

  return (
    <Card className="border-danger/30">
      <CardTitle aside={<Badge tone="danger">충돌 · 금액 민감도</Badge>}>{s.field} 값에 따라 결론의 크기가 달라집니다</CardTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="py-1 pr-2 font-normal">값(출처)</th>
            <th className="py-1 pr-2 text-right font-normal">{s.base.label.replace(/ 계약 운임표$/, "")} 대비</th>
            <th className="py-1 text-right font-normal">연 절감</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.rate} className="border-t border-line">
              <td className="py-1.5 pr-2">
                <div className="tabular-nums font-semibold text-ink">
                  {r.rate.toLocaleString("ko-KR")} {s.unit}
                </div>
                <div className="text-xs text-ink-3">{r.label}</div>
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{r.discountPct.toFixed(1)}% 저렴</td>
              <td className="py-1.5 text-right tabular-nums text-ink">
                {eok(r.annualSavingKrw)}
                <div className="text-xs text-ink-3">{won(r.annualSavingKrw)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-ink">
        어느 값을 쓰느냐에 따라 연 절감액이 <b className="font-semibold text-danger">약 {s.changePct.toFixed(0)}%</b> 달라집니다.
      </p>
      {s.asserted && (
        <p className="mt-1 text-xs text-ink-3">
          보고서 본문의 절감액 {won(s.asserted.value)}은 가장 유리한 값({s.rows[0]!.rate.toLocaleString("ko-KR")}) 기준 계산과 {Math.abs(s.asserted.diffPct).toFixed(1)}% 차이입니다.
        </p>
      )}

      <label className="mt-4 block">
        <span className="flex items-center justify-between text-sm text-ink-3">
          다른 운임으로 넣어 보기
          <span className="tabular-nums font-semibold text-ink">
            {rate.toLocaleString("ko-KR")} {s.unit}
          </span>
        </span>
        <input
          type="range"
          min={min}
          max={s.base.rate}
          step={10}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--accent)]"
          aria-label="운임 슬라이더"
        />
        <span className="mt-1 block text-sm tabular-nums text-ink">
          {discountOf(s.base.rate, rate).toFixed(1)}% 저렴 · 연 절감 {eok(saving)}
        </span>
      </label>

      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        가정: 기준 {s.base.label} {s.base.rate.toLocaleString("ko-KR")} {s.unit}, 물동량 {s.volume.value.toLocaleString("ko-KR")} {s.volume.unit}({s.volume.label}), 환율{" "}
        {s.fxKrwPerUsd.toLocaleString("ko-KR")}원(보고서 기재값), 전량 같은 요율 적용. 계산식: (기준 − 값) × 물동량 × 환율.
      </p>
    </Card>
  );
}
