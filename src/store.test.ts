// 스토어가 실제로 만들어지고(초기화 순서 오류 없음), 피로도 집계·초기화가 동작하는지
import { beforeEach, describe, expect, it } from "vitest";
import { useApp } from "./store";

describe("피로도 집계", () => {
  beforeEach(() => {
    useApp.getState().resetWorkspace();
    useApp.getState().resetFatigue();
  });

  it("확인함·수정할게요는 수용, 문제없음은 무시로 센다", () => {
    const { respondCheck } = useApp.getState();
    respondCheck("a", "ack");
    respondCheck("b", "fix");
    respondCheck("c", "dismiss");
    expect(useApp.getState().fatigue).toMatchObject({ accepted: 2, ignored: 1 });
  });

  it("같은 항목에 다시 응답하면 이전 응답을 빼고 센다(두 번 세지 않음)", () => {
    const { respondCheck } = useApp.getState();
    respondCheck("a", "dismiss");
    respondCheck("a", "ack");
    expect(useApp.getState().fatigue).toMatchObject({ accepted: 1, ignored: 0 });
  });
});

describe("샘플 상태로 되돌리기", () => {
  it("승인·응답·기준일을 처음 상태로", () => {
    const s = useApp.getState();
    s.approveRequired("report|포함 항목");
    s.shiftClock(2);
    s.respondCheck("x", "ack");
    useApp.getState().resetWorkspace();
    const after = useApp.getState();
    expect(after.ws.approvedRequired).toEqual([]);
    expect(after.ws.clockOffsetDays).toBe(0);
    expect(after.checkLog).toEqual({});
  });
});
