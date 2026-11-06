// KOTRA 공공데이터(파일 데이터)를 내려받아 앱용 JSON으로 바꾼다. 서비스키 없이 동작한다.
//   npm run data:kotra
// 값은 바꾸지 않고 구조만 정리한다(수입규제 데이터는 공공누리 제3유형: 출처표시·변경금지).
// 결과 파일은 커밋한다. 배포 빌드가 data.go.kr 상태에 좌우되지 않게 하기 위해서다.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = "https://www.data.go.kr";

const DATASETS = {
  regulations: {
    pk: "15128187",
    name: "대한무역투자진흥공사_국별 대세계 수입규제 현황",
    license: "공공누리 제3유형(출처표시·변경금지)",
  },
  econ: {
    pk: "15128914",
    name: "대한무역투자진흥공사_권역별 연도별 주요 경제 지표",
    license: "공공데이터포털 이용허락범위에 따름",
  },
  countries: {
    pk: "15091117",
    name: "외교부_국가표준코드",
    license: "이용허락범위 제한 없음",
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
/** "ㅇ 부과기간 : 2024-8-20 ~ 2029-9-25" → "2024-8-20 ~ 2029-9-25".
 *  열 이름과 겹치는 머리말(부과기간·판정결과)과 글머리 'ㅇ'만 뗀다. "조사개시일" 같은 다른 표기는 뜻이 있어 남긴다. */
const stripLabel = (s) =>
  clean(s)
    .replace(/^ㅇ\s*(부과기간|판정결과)\s*[:：·]?\s*/, "")
    .replace(/^ㅇ\s*/, "");

function buildRegulations(text) {
  const [header, ...rows] = parseCsv(text);
  const col = (name) => header.findIndex((h) => clean(h).replace(/^﻿/, "").startsWith(name));
  const hsCols = header.map((h, i) => (h.includes("HS_코드") ? i : -1)).filter((i) => i >= 0);
  const idx = {
    id: col("연번"),
    country: col("규제시행국"),
    product: col("품목명"),
    measure: col("규제형태"),
    targets: col("규제대상국"),
    period: col("최종 판정결과(부과기간)"),
    duty: col("최종 판정결과(관세율)"),
    korea: col("한국대상여부"),
  };
  for (const [k, v] of Object.entries(idx)) if (v < 0) throw new Error(`수입규제: '${k}' 열을 찾지 못함`);

  return rows.map((r) => {
    const measureRaw = clean(r[idx.measure]);
    // 마지막 괄호가 진행 상황: "우회수출(반덤핑)(규제중)" → 형태 "우회수출(반덤핑)", 상황 "규제중"
    const m = measureRaw.match(/^(.*)\(([^()]*)\)$/);
    return {
      id: clean(r[idx.id]),
      country: clean(r[idx.country]).toUpperCase(),
      hs: [...new Set(hsCols.map((i) => (r[i] ?? "").replace(/\D/g, "")).filter((c) => c.length >= 4))],
      product: clean(r[idx.product]),
      measure: m ? clean(m[1]) : measureRaw,
      status: m ? clean(m[2]) : "",
      targets: clean(r[idx.targets])
        .split(/[,，]/)
        .map(clean)
        .filter(Boolean),
      period: stripLabel(r[idx.period]),
      duty: stripLabel(r[idx.duty]),
      korea: clean(r[idx.korea]).toUpperCase() === "Y",
    };
  });
}

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

function buildCountries(text) {
  const [header, ...rows] = parseCsv(text);
  const i2 = header.findIndex((h) => h.includes("2자리"));
  const iKo = header.findIndex((h) => h.includes("한글명"));
  const iEn = header.findIndex((h) => h.includes("영문명"));
  return Object.fromEntries(rows.map((r) => [clean(r[i2]).toUpperCase(), { ko: clean(r[iKo]), en: clean(r[iEn]) }]).filter(([k]) => k));
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
  const reg = await download(DATASETS.regulations.pk);
  const rows = buildRegulations(reg.text);
  // 1.5MB가 넘어 첫 화면 번들에 넣지 않고, ⑤ 탭을 열 때 public/에서 불러온다
  await write("public/kotra/import-regulations.json", { source: source("regulations", reg.fileName), rows });

  const econ = await download(DATASETS.econ.pk);
  await write("src/data/kotra/econ.json", { source: source("econ", econ.fileName), ...buildEcon(econ.text) });

  const cc = await download(DATASETS.countries.pk);
  const countries = buildCountries(cc.text);
  // 수입규제 데이터에 나오는 나라 코드만 남겨 용량을 줄인다(+ 한국)
  const used = new Set([...rows.map((r) => r.country), "KR"]);
  await write("src/data/kotra/countries.json", {
    source: source("countries", cc.fileName),
    countries: Object.fromEntries(Object.entries(countries).filter(([k]) => used.has(k))),
  });
  // 첫 화면 요약용(큰 파일을 미리 받지 않고 건수만 보여 준다)
  await write("src/data/kotra/meta.json", {
    regulations: { count: rows.length, countries: used.size - 1, fetchedAt: source("regulations", reg.fileName).fetchedAt },
  });
  const missing = [...used].filter((k) => !countries[k]);
  if (missing.length) console.warn(`! 국가명 없는 코드: ${missing.join(", ")}`);
  console.log(`수입규제 ${rows.length}건, 시행국 ${used.size - 1}개`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
