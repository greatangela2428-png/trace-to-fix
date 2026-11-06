// PDF 내보내기: 인쇄 전용 A4 보고서를 그리고 브라우저 인쇄 창을 연다("PDF로 저장" 선택).
// 화면에는 보이지 않고(@media screen), 인쇄할 때만 앱 대신 이 문서가 찍힌다(index.css).
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PRINT_PALETTE, PortScene } from "../components/infographics";
import type { Column, ReportDoc } from "./report";
import { reportFileName } from "./report";

const fmt = (c: Column, v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "number") return c.type === "krw" ? `${v.toLocaleString("ko-KR")}원` : v.toLocaleString("ko-KR");
  return v;
};

/** 숫자는 오른쪽 정렬, 좁게 잡은 열(유형·상태·날짜 등)은 줄바꿈하지 않아 글자가 세로로 쪼개지지 않게 한다 */
const cellClass = (c: Column, i: number) =>
  [c.type === "number" || c.type === "krw" ? "num" : "", (c.width ?? 99) <= 14 || c.type === "date" ? "nowrap" : "", i === 0 ? "first" : ""]
    .filter(Boolean)
    .join(" ");

/** 표지 목차용 짧은 요약: 기간·결론처럼 긴 값은 빼고 20자 이하만 */
const tocSummary = (s: ReportDoc["sections"][number]) =>
  s.summary
    .filter((x) => x.label !== "기간" && x.value.length <= 20)
    .map((x) => x.value)
    .join(" · ");

export function PrintReport({ doc, onDone }: { doc: ReportDoc; onDone: () => void }) {
  useEffect(() => {
    const prevTitle = document.title;
    // 저장 창의 기본 파일 이름이 문서 제목을 따른다
    document.title = reportFileName(doc, "pdf").replace(/\.pdf$/, "");
    const done = () => {
      document.title = prevTitle;
      onDone();
    };
    window.addEventListener("afterprint", done, { once: true });
    // 포털이 그려진 다음 프레임에 인쇄
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.title = prevTitle;
    };
  }, [doc, onDone]);

  return createPortal(
    <div className="print-root">
      <section className="pr-cover">
        <div className="pr-brand">TRACE-TO-FIX · 업무 역추적 시스템</div>
        <h1>{doc.title}</h1>
        <p className="pr-sub">오류를 고치는 대신, 오류가 생기는 입구를 고칩니다.</p>
        <PortScene palette={PRINT_PALETTE} className="pr-scene" />
        <dl className="pr-meta">
          <div>
            <dt>기준일</dt>
            <dd>{doc.asOf}</dd>
          </div>
          <div>
            <dt>기간</dt>
            <dd>{doc.periodLabel}</dd>
          </div>
          <div>
            <dt>작성</dt>
            <dd>{doc.generatedAt.replace("T", " ").slice(0, 16)}</dd>
          </div>
        </dl>
        <ol className="pr-toc">
          {doc.sections.map((s, i) => (
            <li key={s.id}>
              <span className="pr-toc-no">{String(i + 1).padStart(2, "0")}</span>
              <span>{s.title}</span>
              <span className="pr-toc-sum">{tocSummary(s)}</span>
            </li>
          ))}
        </ol>
        <p className="pr-foot">모든 추정·점검 결과는 담당자 확인이 필요합니다. 개인명은 저장·표시하지 않습니다.</p>
      </section>

      {doc.sections.map((s, i) => (
        <section key={s.id} className="pr-section">
          <h2>
            <span className="pr-no">{String(i + 1).padStart(2, "0")}</span>
            {s.title}
          </h2>
          <div className="pr-kpis">
            {s.summary.map((x) => (
              <div key={x.label} className="pr-kpi">
                <div className="pr-kpi-label">{x.label}</div>
                <div className="pr-kpi-value">{x.value}</div>
              </div>
            ))}
          </div>
          {s.tables.map((t, ti) => (
            <div key={ti} className="pr-table-wrap">
              {t.title && <h3>{t.title}</h3>}
              {t.rows.length === 0 ? (
                <p className="pr-empty">해당 기간 데이터가 없습니다.</p>
              ) : (
                <table className={t.columns.length > 9 ? "dense" : undefined}>
                  <thead>
                    <tr>
                      {t.columns.map((c, ci) => (
                        <th key={c.key} className={cellClass(c, ci)}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, ri) => (
                      <tr key={ri}>
                        {t.columns.map((c, ci) => (
                          <td key={c.key} className={cellClass(c, ci)}>
                            {fmt(c, r[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {s.notes.map((n) => (
            <p key={n} className="pr-note">
              ※ {n}
            </p>
          ))}
        </section>
      ))}
    </div>,
    document.body,
  );
}
