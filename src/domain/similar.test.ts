// 시연 시나리오 3: '11월 유럽 운임 견적서' ↔ '로테르담 항로 단가표 v2'(복사 후 분기, BAF 215 vs 198),
// 경쟁 B 선사 견적서는 기준자료가 달라 병합 거부, 이력 없는 문서는 원인 추정 불가
import { describe, expect, it } from "vitest";
import { analyzePair, cosine, findCandidates, termDifferences, verify } from "./similar";
import { seed } from "../seed";

const docs = seed.docs;
const doc = (id: string) => docs.find((d) => d.id === id)!;
const pair = (a: string, b: string, threshold = 0.95) => findCandidates(docs, threshold).candidates.find((c) => c.key === `${a}|${b}`)!;

describe("1단계: 후보 찾기", () => {
  it("코사인 유사도: 같은 벡터 1, 직교 0", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("임계값 0.95: 유럽 견적 계열 4개 문서끼리 6쌍, 동남아 안내문은 후보가 아니다", () => {
    const { candidates } = findCandidates(docs, 0.95);
    expect(candidates).toHaveLength(6);
    expect(candidates.some((c) => c.a.id === "D4" || c.b.id === "D4")).toBe(false);
  });

  it("임계값을 올리면 후보가 줄어든다(0.995 → B 선사 견적서가 빠진 3쌍)", () => {
    expect(findCandidates(docs, 0.995).candidates.map((c) => c.key).sort()).toEqual(["D1|D2", "D1|D5", "D2|D5"]);
  });

  it("열람 권한 밖 부서의 문서는 비교에서 빠진다", () => {
    const { candidates, excluded } = findCandidates(docs, 0.95, ["영업팀"]);
    expect(excluded.map((d) => d.id).sort()).toEqual(["D2", "D4"]);
    expect(candidates.every((c) => c.a.dept === "영업팀" && c.b.dept === "영업팀")).toBe(true);
  });
});

describe("2단계: 검증", () => {
  it("B 선사 견적서는 유사도가 높아도 기준자료가 달라 별개 문서(병합 안 함)", () => {
    const v = verify(doc("D1"), doc("D3"));
    expect(v.sameContent).toBe(false);
    expect(v.coreMismatches.map((m) => m.key)).toEqual(["기준자료"]);
    expect(analyzePair(pair("D1", "D3")).suggestions).toEqual([]); // 병합 제안 없음
  });

  it("견적서 ↔ 단가표 v2는 같은 내용, BAF만 215 vs 198", () => {
    const v = verify(doc("D1"), doc("D2"));
    expect(v.sameContent).toBe(true);
    expect(v.valueMismatches).toEqual([{ key: "BAF", a: "215", b: "198" }]);
  });
});

describe("3·4단계: 이력 역추적과 원인", () => {
  it("D2는 D1에서 복사된 뒤 분기 → 원인 '복사 후 분기', 값 확인 → 원본 연결 → 제목 규칙 순으로 제안", () => {
    const a = analyzePair(pair("D1", "D2"));
    expect(a.history.branch).toMatchObject({ from: "D1", to: "D2" });
    expect(a.causes.map((c) => c.code)).toEqual(["COPY_DIVERGED", "NO_NAMING_RULE", "TERM_DIFF"]);
    expect(a.suggestions.map((s) => s.code)).toEqual(["CHECK_VALUE", "SINGLE_SOURCE", "NAMING_RULE", "GLOSSARY"]);
    expect(a.history.timeline.find((e) => e.isBranch)?.docId).toBe("D2");
  });

  it("D5는 이력이 없어 '유사함'까지만: 원인은 추정 불가, 제목·용어 차이는 관찰로만 표시", () => {
    const a = analyzePair(pair("D1", "D5"));
    expect(a.causes.map((c) => c.code)).toEqual(["UNKNOWN"]);
    expect(a.observations.map((o) => o.code)).toEqual(["NO_NAMING_RULE", "TERM_DIFF"]);
    expect(a.verification.valueMismatches).toEqual([]);
  });

  it("약어 정규화: D5는 '유류할증료·터미널 조작료', D1은 'BAF·THC'를 쓴다", () => {
    const t = termDifferences(doc("D1"), doc("D5"));
    expect(t.map((x) => x.concept)).toEqual(["BAF", "THC"]);
    expect(t[0]!.b).toEqual(["유류할증료"]);
  });
});
