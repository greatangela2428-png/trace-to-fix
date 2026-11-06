// ReportDoc → .xlsx. 표지(요약) 시트 + 섹션별 시트. 라이브러리는 버튼을 누를 때만 불러온다.
import type { Column, ReportDoc, Section } from "./report";
import { reportFileName } from "./report";

type Cell = Record<string, unknown> | null;

const NAVY = "#1F3A5F";
const HEAD_BG = "#E8EEF5";

const title = (value: string): Cell => ({ value, fontWeight: "bold", fontSize: 14, textColor: NAVY });
const head = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: HEAD_BG, textColor: NAVY, bottomBorderStyle: "thin" });
const text = (value: string): Cell => ({ value, wrap: true });
const muted = (value: string): Cell => ({ value, textColor: "#666666", wrap: true });

function valueCell(c: Column, v: string | number | null | undefined): Cell {
  if (v === null || v === undefined || v === "") return null;
  if ((c.type === "number" || c.type === "krw") && typeof v === "number") {
    return { value: v, type: Number, format: c.type === "krw" ? '#,##0"원"' : "#,##0" };
  }
  return text(String(v));
}

/** 섹션 하나를 시트 데이터로: 제목 → 요약 → 표(들) → 주석 */
export function sectionRows(s: Section): Cell[][] {
  const rows: Cell[][] = [[title(s.title)], []];
  for (const it of s.summary) rows.push([head(it.label), text(it.value)]);
  for (const t of s.tables) {
    rows.push([]);
    if (t.title) rows.push([{ value: t.title, fontWeight: "bold" }]);
    rows.push(t.columns.map((c) => head(c.label)));
    if (t.rows.length === 0) rows.push([muted("해당 기간 데이터가 없습니다.")]);
    for (const r of t.rows) rows.push(t.columns.map((c) => valueCell(c, r[c.key])));
  }
  if (s.notes.length) {
    rows.push([]);
    for (const n of s.notes) rows.push([muted(`※ ${n}`)]);
  }
  return rows;
}

/** 시트 열 너비: 섹션 안 표들의 같은 위치 열 중 가장 넓은 값 */
function widths(s: Section) {
  const n = Math.max(2, ...s.tables.map((t) => t.columns.length));
  return Array.from({ length: n }, (_, i) => ({
    width: Math.max(i === 0 ? 16 : 10, ...s.tables.map((t) => t.columns[i]?.width ?? 0)),
  }));
}

/** 엑셀 시트 이름: 31자 이내, 금지 문자 제거 */
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

export function coverRows(doc: ReportDoc): Cell[][] {
  return [
    [title(doc.title)],
    [],
    [head("기준일"), text(doc.asOf)],
    [head("기간"), text(doc.periodLabel)],
    [head("작성 시각"), text(doc.generatedAt.replace("T", " ").slice(0, 16))],
    [],
    [head("포함 내용"), head("요약")],
    ...doc.sections.map((s) => [text(s.title), text(s.summary.map((x) => `${x.label} ${x.value}`).join(" · "))]),
    [],
    [muted("※ 모든 추정·점검 결과는 담당자 확인이 필요합니다. 개인명은 저장·표시하지 않습니다.")],
  ];
}

export async function downloadExcel(doc: ReportDoc) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const sheets = [
    { data: coverRows(doc), sheet: "요약", columns: [{ width: 24 }, { width: 80 }] },
    ...doc.sections.map((s) => ({ data: sectionRows(s), sheet: sheetName(s.title), columns: widths(s) })),
  ];
  // 라이브러리 타입이 셀 객체를 엄격하게 요구해 여기서만 넓혀 넘긴다
  await writeExcelFile(sheets as never, { fontFamily: "맑은 고딕", fontSize: 10 } as never).toFile(reportFileName(doc, "xlsx"));
}
