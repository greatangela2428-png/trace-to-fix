// KOTRA 공공데이터 연동(서비스키 없이 받는 파일 데이터). 순수 함수만 둔다.
// - (수출 사전 점검 탭은 2026-11-06 사용자 요청으로 삭제)
// - 권역별 경제 지표: 보고서의 근거 없는 가정 옆에 '참고 지표'로 제시(판정 아님)
import { z } from "zod";

export const DataSourceSchema = z.object({
  name: z.string(),
  url: z.string(),
  fileName: z.string(),
  license: z.string(),
  fetchedAt: z.string(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

const EconValueSchema = z.object({ value: z.number().nullable(), period: z.string().optional(), raw: z.string() });
export const EconIndicatorSchema = z.object({
  indicator: z.string(),
  unit: z.string(),
  values: z.record(z.string(), EconValueSchema),
});
export type EconIndicator = z.infer<typeof EconIndicatorSchema>;
export const EconFileSchema = z.object({
  source: DataSourceSchema,
  years: z.array(z.string()),
  regions: z.record(z.string(), z.array(EconIndicatorSchema)),
});
export type EconFile = z.infer<typeof EconFileSchema>;

// ── 권역별 경제 지표(가정 검증용 참고 자료) ─────────────

const REGION_KEYWORDS: Record<string, string[]> = {
  "유럽(EU)": ["유럽", "EU", "로테르담", "함부르크", "앤트워프", "르아브르", "제노바", "예테보리", "독일", "네덜란드", "프랑스", "벨기에", "이탈리아", "스웨덴"],
  북미: ["북미", "미국", "캐나다", "롱비치", "로스앤젤레스", "LA", "뉴욕", "밴쿠버"],
  중남미: ["중남미", "남미", "멕시코", "브라질", "칠레", "페루", "콜롬비아", "산투스", "만사니요"],
  CIS: ["CIS", "러시아", "카자흐", "우즈베크", "블라디보스토크", "벨라루스"],
};

/** 본문에 나온 권역(언급 횟수 많은 순). */
export function detectRegions(text: string): string[] {
  const score = Object.entries(REGION_KEYWORDS)
    .map(([region, words]) => [region, words.reduce((n, w) => n + (text.split(w).length - 1), 0)] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return score.map(([r]) => r);
}

interface Topic {
  id: string;
  label: string;
  words: string[];
  indicators: string[]; // 지표 이름에 이 문자열이 들어가면 연결
  note?: string;
}

/** 가정의 주제 → KOTRA 지표. 지표가 없는 주제는 note로 '다른 출처 필요'를 알린다. */
export const ASSUMPTION_TOPICS: Topic[] = [
  { id: "volume", label: "물동량·수요", words: ["물동량", "물량", "수요", "선적", "FEU", "TEU", "수입량"], indicators: ["총수입", "對韓 수입", "실질성장률"] },
  { id: "price", label: "물가·비용", words: ["물가", "비용", "가격", "인플레"], indicators: ["소비자물가상승률"] },
  { id: "growth", label: "경기", words: ["경기", "성장", "GDP", "경제"], indicators: ["실질성장률", "명목GDP"] },
  {
    id: "fx",
    label: "환율",
    words: ["환율", "원/달러", "달러", "유로화"],
    indicators: [],
    note: "KOTRA 파일 데이터에는 환율이 없습니다. 한국은행 경제통계시스템 등 다른 출처로 확인해 주세요.",
  },
  {
    id: "freight",
    label: "운임",
    words: ["운임", "BAF", "해상운임"],
    indicators: [],
    note: "KOTRA 파일 데이터에는 해상운임이 없습니다. 선사 운임표·운임지수로 확인해 주세요.",
  },
];

export const topicsOf = (text: string) => ASSUMPTION_TOPICS.filter((t) => t.words.some((w) => text.includes(w)));

export const indicatorsFor = (all: EconIndicator[], topic: Topic) =>
  all.filter((i) => topic.indicators.some((name) => i.indicator.includes(name)));

/**
 * 원자료 이상치 표시: 비율(%) 단위가 아닌데 전년 대비 5배 이상 커지거나 1/5 이하로 줄면 표시한다.
 * 값을 고치지 않고 "원자료 확인 필요"만 알린다(공공누리 변경금지 + 원칙 3).
 */
export function suspiciousYears(ind: EconIndicator, years: string[]): string[] {
  if (ind.unit.includes("%")) return [];
  const out: string[] = [];
  for (let i = 1; i < years.length; i++) {
    const prev = ind.values[years[i - 1]!]?.value;
    const cur = ind.values[years[i]!]?.value;
    if (prev == null || cur == null || prev === 0) continue;
    const ratio = cur / prev;
    if (ratio > 5 || (ratio > 0 && ratio < 0.2)) out.push(years[i]!);
  }
  return out;
}
