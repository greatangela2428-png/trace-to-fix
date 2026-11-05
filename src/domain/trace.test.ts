import { describe, expect, it } from "vitest";
import { traceCase, traceOrigin } from "./trace";
import type { FieldSnapshot, ReworkCase } from "./schemas";

const OK = "Hafenstrasse 12, 20457 Hamburg, DE";

describe("traceOrigin", () => {
  it("정상 건: 마지막 단계 값이 정답이면 null", () => {
    expect(traceOrigin([OK, OK, OK, OK], OK)).toBeNull();
  });

  it("중간에 틀렸다가 마지막에 바로잡힌 건도 재작업 원인 없음(null)", () => {
    expect(traceOrigin([OK, "", "", OK], OK)).toBeNull();
  });

  it("누락: 부킹부터 비어 있으면 0번 단계 MISSING", () => {
    expect(traceOrigin(["", "", "", ""], OK)).toEqual({ origin: 0, kind: "MISSING" });
  });

  it("오입력: 서류 작성 단계에서 오타가 들어가 끝까지 이어지면 1번 단계 WRONG", () => {
    expect(traceOrigin(["12,400 KG", "12,040 KG", "12,040 KG", "12,040 KG"], "12,400 KG")).toEqual({
      origin: 1,
      kind: "WRONG",
    });
  });

  it("중간 유실: 앞 단계는 정상, SI에서 비면 SI(2번)가 원인", () => {
    expect(traceOrigin([OK, OK, "", ""], OK)).toEqual({ origin: 2, kind: "MISSING" });
  });

  it("정상이었다가 다시 틀어진 경우: 앞쪽 오류가 아니라 다시 틀어진 지점이 원인", () => {
    // 부킹 오류 → 서류 작성에서 정정 → SI에서 다시 유실
    expect(traceOrigin(["WRONG", OK, "", ""], OK)).toEqual({ origin: 2, kind: "MISSING" });
  });

  it("틀린 값이 단계마다 달라도 이어져 있으면 가장 이른 단계, 유형은 그 단계 값 기준", () => {
    expect(traceOrigin([OK, "", "X", "X"], OK)).toEqual({ origin: 1, kind: "MISSING" });
    expect(traceOrigin([OK, "X", "", ""], OK)).toEqual({ origin: 1, kind: "WRONG" });
  });

  it("마지막 단계에서만 틀린 경우", () => {
    expect(traceOrigin([OK, OK, OK, ""], OK)).toEqual({ origin: 3, kind: "MISSING" });
  });

  it("빈 배열은 null", () => {
    expect(traceOrigin([], OK)).toBeNull();
  });
});

describe("traceCase", () => {
  const c: ReworkCase = {
    id: "T1",
    label: "테스트",
    field: "consigneeAddress",
    correctValue: OK,
    cost: 1000,
    detectedAt: "2026-10-10T00:00:00+09:00",
  };
  const snap = (stage: FieldSnapshot["stage"], value: string, at: string, extra: Partial<FieldSnapshot> = {}) =>
    ({ caseId: "T1", field: "consigneeAddress", stage, value, at, ...extra }) satisfies FieldSnapshot;

  it("입력 순서와 무관하게 단계 순으로 정렬하고 상태를 표시한다", () => {
    const t = traceCase(c, [
      snap("BL_DRAFT", "", "2026-10-04T00:00:00+09:00"),
      snap("BOOKING", OK, "2026-10-01T00:00:00+09:00"),
      snap("SI", "", "2026-10-03T00:00:00+09:00"),
      snap("DOC_PREP", OK, "2026-10-02T00:00:00+09:00"),
    ]);
    expect(t?.originStage).toBe("SI");
    expect(t?.kind).toBe("MISSING");
    expect(t?.steps.map((s) => s.status)).toEqual(["OK", "OK", "ORIGIN", "ERROR"]);
  });

  it("같은 단계 기록이 여러 개면 가장 늦은 값을 쓴다", () => {
    const t = traceCase(c, [
      snap("BOOKING", "", "2026-10-01T00:00:00+09:00"),
      snap("BOOKING", OK, "2026-10-01T05:00:00+09:00"), // 부킹 단계에서 보완됨
      snap("DOC_PREP", "", "2026-10-02T00:00:00+09:00"),
      snap("BL_DRAFT", "", "2026-10-04T00:00:00+09:00"),
    ]);
    expect(t?.originStage).toBe("DOC_PREP");
    expect(t?.steps).toHaveLength(3); // 기록 없는 SI 단계는 건너뜀
  });

  it("다른 사건·다른 필드 기록은 무시한다", () => {
    const t = traceCase(c, [
      snap("BOOKING", "", "2026-10-01T00:00:00+09:00", { caseId: "OTHER" }),
      snap("BOOKING", OK, "2026-10-01T00:00:00+09:00"),
      snap("BL_DRAFT", "x", "2026-10-04T00:00:00+09:00", { field: "grossWeight" }),
      snap("BL_DRAFT", OK, "2026-10-04T00:00:00+09:00"),
    ]);
    expect(t).toBeNull();
  });
});
