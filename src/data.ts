// 시드에서 한 번 계산해 두는 파생 데이터(순수 함수 결과). 실데이터 연동 시 API 응답으로 대체된다.
import { AS_OF, seed } from "./seed";
import { traceCase, type CaseTrace } from "./domain/trace";
import { aggregatePatterns, suggestFor } from "./domain/patterns";
import { findZombies, sortFindings } from "./domain/zombie";

export const traces: CaseTrace[] = seed.cases
  .map((c) => traceCase(c, seed.snapshots))
  .filter((t): t is CaseTrace => t !== null);

export const traceById = new Map(traces.map((t) => [t.caseId, t]));
export const caseById = new Map(seed.cases.map((c) => [c.id, c]));

export const patterns = aggregatePatterns(traces, seed.cases);
export const initialSuggestions = patterns.flatMap(suggestFor);

const reworkFieldCounts = traces.reduce<Record<string, number>>((acc, t) => {
  acc[t.field] = (acc[t.field] ?? 0) + 1;
  return acc;
}, {});

export const zombieFindings = sortFindings(
  findZombies(seed.procedures, { asOf: AS_OF, reworkFieldCounts }),
);
export const procedureById = new Map(seed.procedures.map((p) => [p.id, p]));
