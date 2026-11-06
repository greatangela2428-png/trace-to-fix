// 보고서 내보내기 창: 기간·포함할 내용을 고르고 엑셀 또는 PDF로 받는다.
import { useCallback, useEffect, useRef, useState } from "react";
import { icons } from "../components/infographics";
import { DATED_SECTIONS, PERIODS, SECTION_IDS, SECTION_LABEL, buildReport, type ReportDoc, type SectionId } from "./report";
import { collectReportInput } from "./collect";
import { downloadExcel } from "./excel";
import { PrintReport } from "./PrintReport";

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [months, setMonths] = useState<number>(3);
  const [sections, setSections] = useState<SectionId[]>([...SECTION_IDS]);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<ReportDoc | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggle = (id: SectionId) => setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const build = async () => {
    const input = await collectReportInput();
    return buildReport(input, { months, sections });
  };

  const run = async (kind: "xlsx" | "pdf") => {
    setBusy(kind);
    setError(null);
    try {
      const doc = await build();
      if (kind === "xlsx") await downloadExcel(doc);
      else setPrintDoc(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const donePrint = useCallback(() => setPrintDoc(null), []);

  return (
    <>
      {printDoc && <PrintReport doc={printDoc} onDone={donePrint} />}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl outline-none sm:max-w-lg sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="export-title" className="text-lg font-semibold text-ink">
                  보고서 내보내기
                </h2>
                <p className="mt-0.5 text-sm text-ink-3">과거 기록을 골라 엑셀이나 PDF로 받습니다.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                {icons.close("size-5")}
              </button>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-ink-2">기간</legend>
              <div className="mt-2 grid grid-cols-4 gap-1 rounded-full bg-surface-2 p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.months}
                    type="button"
                    aria-pressed={months === p.months}
                    onClick={() => setMonths(p.months)}
                    className={`rounded-full px-2 py-1.5 text-sm transition ${months === p.months ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"}`}
                  >
                    {p.label.replace("최근 ", "")}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-ink-2">포함할 내용</legend>
              <ul className="mt-2 space-y-1">
                {SECTION_IDS.map((id) => (
                  <li key={id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" checked={sections.includes(id)} onChange={() => toggle(id)} className="size-4 accent-[var(--accent)]" />
                      <span className="text-ink">{SECTION_LABEL[id]}</span>
                      {DATED_SECTIONS.includes(id) && <span className="ml-auto text-xs text-ink-3">기간 적용</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            {error && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!sections.length || busy !== null}
                onClick={() => run("xlsx")}
                className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-40"
              >
                {icons.download("size-4")}
                {busy === "xlsx" ? "만드는 중…" : "엑셀 (.xlsx)"}
              </button>
              <button
                type="button"
                disabled={!sections.length || busy !== null}
                onClick={() => run("pdf")}
                className="flex items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-40"
              >
                {icons.doc("size-4")}
                {busy === "pdf" ? "준비 중…" : "PDF"}
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              PDF는 인쇄 창이 열리면 대상(프린터)을 <b className="font-semibold text-ink-2">"PDF로 저장"</b>으로 골라 주세요. 한글이 선명하고 글자를 복사할 수 있는 PDF가 만들어집니다.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
