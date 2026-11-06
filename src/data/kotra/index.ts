// KOTRA 데이터 불러오기. 작은 파일(경제 지표·국가명)은 번들에 넣고,
// 큰 수입규제 파일(약 1.6MB)은 ⑤ 탭을 열 때 public/kotra/에서 한 번만 받아 온다.
// 데이터 갱신: npm run data:kotra
import { z } from "zod";
import { DataSourceSchema, EconFileSchema, RegulationFileSchema, type RegulationFile } from "../../domain/kotra";
import econJson from "./econ.json";
import countriesJson from "./countries.json";
import metaJson from "./meta.json";

export const econ = EconFileSchema.parse(econJson);

const CountriesFileSchema = z.object({
  source: DataSourceSchema,
  countries: z.record(z.string(), z.object({ ko: z.string(), en: z.string() })),
});
export const countryFile = CountriesFileSchema.parse(countriesJson);
export const countryName = (iso2: string) => countryFile.countries[iso2]?.ko ?? iso2;

let regulations: Promise<RegulationFile> | null = null;

export function loadRegulations(): Promise<RegulationFile> {
  regulations ??= fetch("/kotra/import-regulations.json")
    .then((r) => {
      if (!r.ok) throw new Error(`수입규제 데이터를 불러오지 못했습니다(${r.status}).`);
      return r.json();
    })
    .then((j) => RegulationFileSchema.parse(j))
    .catch((e) => {
      regulations = null; // 실패하면 다음에 다시 시도
      throw e;
    });
  return regulations;
}

/** 수입규제 건수 등 요약(큰 파일을 받지 않고 첫 화면에 보여 준다) */
export const kotraMeta = metaJson as { regulations: { count: number; countries: number; fetchedAt: string } };
