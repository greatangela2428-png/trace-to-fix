// KOTRA 공공데이터(파일 데이터)를 내려받아 앱용 JSON으로 바꾼다. 서비스키 없이 동작한다.
//   npm run data:kotra
// 값은 바꾸지 않고 구조만 정리한다. (수입규제·국가코드 연동은 수출 사전 점검 탭 삭제와 함께 제거, 2026-11-06)
// 결과 파일은 커밋한다. 배포 빌드가 data.go.kr 상태에 좌우되지 않게 하기 위해서다.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = "https://www.data.go.kr";

const DATASETS = {
  econ: {
    pk: "15128914",
    name: "대한무역투자진흥공사_권역별 연도별 주요 경제 지표",
    license: "공공데이터포털 이용허락범위에 따름",
  },
};

/** data.go.kr 파일 데이터: 메타 조회 → 첨부파일 다운로드(로그인 불필요). */
async function download(pk) {
  const metaRes = await fetch(`${PORTAL}/tcs/dss/selectFileDataDownload.do?publicDataPk=${pk}&fileDetailSn=1&dataNm=x`);
  if (!metaRes.ok) throw new Error(`메타 조회 실패 ${pk}: ${metaRes.status}`);
  const meta = await metaRes.json();
  const info = meta.fileDataRegistVO ?? meta.dataSetFileDetailInfo ?? {};
  const atchFileId = info.atchFileId ?? JSON.stringify(meta).match(/"atchFileId":"([^"]+)"/)?.[1];
  const fileName = info.orginlFileNm || JSON.stringify(meta).match(/"orginlFileNm":"([^"]+)"/)?.[1] || "";
  if (!atchFileId) throw new Error(`첨부파일 ID를 찾지 못함 ${pk}`);
  const fileRes = await fetch(`${PORTAL}/cmm/cmm/fileDownload.do?atchFileId=${atchFileId}&fileDetailSn=1&dataNm=x`);
  if (!fileRes.ok) throw new Error(`다운로드 실패 ${pk}: ${fileRes.status}`);
  const buf = Buffer.from(await fileRes.arrayBuffer());
  // UTF-8(BOM) 또는 EUC-KR(CP949) 둘 다 온다
  const isUtf8Bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let text;
  if (isUtf8Bom) text = buf.subarray(3).toString("utf8");
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder("euc-kr").decode(buf);
    }
  }
  return { text, fileName };
}

/** 따옴표 안의 쉼표·줄바꿈을 처리하는 CSV 파서. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
function buildEcon(text) {
  const [header, ...rows] = parseCsv(text);
  const years = header.slice(3).map((h) => clean(h).replace(/년$/, ""));
  const regions = {};
  for (const r of rows) {
    const region = clean(r[0]);
    if (!region) continue;
    const values = {};
    years.forEach((y, i) => {
      const raw = clean(r[3 + i]);
      if (!raw) return;
      // "2196(2025-01-01~2025-07-31)" → 값 2196, 기간 표기는 따로 보관
      const mm = raw.match(/^(-?[\d.,]+)\s*(?:\((.+)\))?$/);
      values[y] = mm ? { value: Number(mm[1].replace(/,/g, "")), period: mm[2] ? clean(mm[2]) : undefined, raw } : { value: null, raw };
    });
    (regions[region] ??= []).push({ indicator: clean(r[1]), unit: clean(r[2]), values });
  }
  return { years, regions };
}

const source = (key, fileName) => ({
  name: DATASETS[key].name,
  url: `${PORTAL}/data/${DATASETS[key].pk}/fileData.do`,
  fileName,
  license: DATASETS[key].license,
  fetchedAt: new Date().toISOString().slice(0, 10),
});

async function write(path, data) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(data) + "\n", "utf8");
  console.log(`✓ ${path} (${(JSON.stringify(data).length / 1024).toFixed(0)}KB)`);
}

async function main() {
  const econ = await download(DATASETS.econ.pk);
  await write("src/data/kotra/econ.json", { source: source("econ", econ.fileName), ...buildEcon(econ.text) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
