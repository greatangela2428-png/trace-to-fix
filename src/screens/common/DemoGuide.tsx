// 3분 데모 모드: 말풍선 가이드 5단계. 단계마다 화면을 옮기고, 시연 동작은 버튼 하나로 실행한다.
import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { useApp } from "../../store";
import { useWorkspace } from "../../workspace/useWorkspace";

interface Step {
  title: string;
  seconds: number;
  say: string; // 발표자가 말할 내용
  enter: () => void; // 단계에 들어올 때 화면 이동
  action?: { label: string; run: () => void };
}

function useSteps(): Step[] {
  const s = useApp.getState;
  const ws = useWorkspace();
  const top = ws.ranked[0];
  return [
    {
      title: "오늘의 보고서",
      seconds: 30,
      say: `지금 가장 먼저 쓸 보고서 3건과 이유를 보여 줍니다. 1순위 '${top?.report.title ?? ""}' — ${top?.priority.reasonLines.slice(0, 3).join(" · ") ?? ""}. 점수 구성 막대와 가중치는 '초기 가정'으로 밝혀 둡니다.`,
      enter: () => s().setTab("home"),
    },
    {
      title: "작성: 근거가 따라오고, 빈틈은 3개만",
      seconds: 60,
      say: "주장을 누르면 근거가 출처·저장일·유효기간·범위와 함께 따라옵니다. 확인 요청은 상위 3개만: 현 선사 운임표가 결정 적용 시점(2027-01-01)에 만료, 견적 1,850 vs 1,920 충돌. 금액 민감도: 연 절감 1.20억 → 0.87억(약 28%).",
      enter: () => {
        s().selectReport("R-SWITCH");
        s().selectClaim("CL1");
        s().setTab("write");
      },
    },
    {
      title: "근거를 고치면 순위가 바뀐다",
      seconds: 30,
      say: "견적을 1,850으로 맞추고 현 선사 계약 연장을 반영하면, 준비 부족도가 내려가 1순위가 바뀌고(▲▼) 업무 TODO에서 해결된 일이 빠집니다.",
      enter: () => s().setTab("home"),
      action: {
        label: "근거 고치기 실행",
        run: () => {
          const { ws: cur, saveEvidence } = s();
          const mail = cur.evidence.find((e) => e.id === "E-MAIL-A");
          const contract = cur.evidence.find((e) => e.id === "E-CONTRACT-CUR");
          if (mail) saveEvidence({ ...mail, fields: mail.fields.map((f) => (f.key === "A 선사 40ft 운임" ? { ...f, value: 1850 } : f)) });
          if (contract) saveEvidence({ ...contract, validTo: "2027-12-31", scope: ["유럽 항로"] });
        },
      },
    },
    {
      title: "개선: 반려의 입구를 저장 단계에서 막는다",
      seconds: 30,
      say: "반려 13건 중 6건이 근거 저장 단계에서 시작됐습니다. '포함 항목'을 저장 필수로 하면 4건 방지, 부담은 저장마다 1항목. 승인하면 보관함 저장 화면에 반영됩니다. 홈의 '읽히지 않는 항목'에서 HS 코드는 열람 0건이어도 재작업 원인이라 보호됩니다.",
      enter: () => s().setTab("rework"),
      action: {
        label: "포함 항목 필수 승인 → 보관함 보기",
        run: () => {
          s().approveRequired("report|포함 항목");
          s().setTab("vault");
        },
      },
    },
    {
      title: "결함 없는 보고서는 조용하다",
      seconds: 30,
      say: "근거가 출처·범위·적용 시점 모두 맞는 '동남아 THC 안내'는 확인 요청 0건입니다. 규칙이 괜히 묻지 않는다는 증거입니다.",
      enter: () => {
        s().selectReport("R-THC");
        s().setTab("write");
      },
    },
  ];
}

export function DemoGuide() {
  const demo = useApp((s) => s.demo);
  const setDemo = useApp((s) => s.setDemo);
  const reset = useApp((s) => s.resetWorkspace);
  const steps = useSteps();
  const step = steps[demo.step];
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState<Record<number, boolean>>({});

  // 주소에 ?demo=1 이 있으면 바로 데모 시작(발표용 즐겨찾기)
  useEffect(() => {
    try {
      if (new URLSearchParams(location.search).get("demo") === "1") {
        reset();
        setDemo({ active: true, step: 0 });
      }
    } catch {
      /* 주소를 읽을 수 없는 환경 */
    }
    // 처음 한 번만
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!demo.active) return;
    const t = window.setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [demo.active]);

  // 단계가 바뀌면 그 단계 화면으로 이동
  useEffect(() => {
    if (demo.active) step?.enter();
    // step 객체는 렌더마다 새로 만들어지므로 단계 번호가 바뀔 때만 이동한다
  }, [demo.active, demo.step]);

  if (!demo.active || !step) return null;
  const go = (n: number) => setDemo({ step: Math.max(0, Math.min(steps.length - 1, n)) });
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const plan = steps.slice(0, demo.step + 1).reduce((x, st) => x + st.seconds, 0);

  return (
    <aside
      role="dialog"
      aria-label="3분 데모 가이드"
      className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border border-accent/50 bg-surface p-4 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[26rem]"
    >
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-on-accent">
          {demo.step + 1}/{steps.length}
        </span>
        <span>권장 {step.seconds}초</span>
        <span className="ml-auto tabular-nums">
          {mmss} / 계획 {Math.floor(plan / 60)}:{String(plan % 60).padStart(2, "0")}
        </span>
      </div>
      <h2 className="mt-2 font-bold text-ink">{step.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.say}</p>
      {step.action && (
        <div className="mt-3">
          <Button
            variant="primary"
            disabled={done[demo.step]}
            onClick={() => {
              step.action!.run();
              setDone((d) => ({ ...d, [demo.step]: true }));
            }}
          >
            {done[demo.step] ? "실행함" : step.action.label}
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button onClick={() => go(demo.step - 1)} disabled={demo.step === 0}>
          이전
        </Button>
        {demo.step < steps.length - 1 ? (
          <Button variant="primary" onClick={() => go(demo.step + 1)}>
            다음
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setDemo({ active: false })}>
            데모 끝내기
          </Button>
        )}
        <button
          type="button"
          onClick={() => {
            reset();
            setDone({});
            setElapsed(0);
            setDemo({ step: 0 });
          }}
          className="ml-auto text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          처음 상태로
        </button>
        <button type="button" onClick={() => setDemo({ active: false })} className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
          닫기
        </button>
      </div>
    </aside>
  );
}

/** 헤더의 '3분 데모' 버튼: 샘플 상태로 되돌린 뒤 1단계부터 */
export function DemoButton() {
  const setDemo = useApp((s) => s.setDemo);
  const reset = useApp((s) => s.resetWorkspace);
  return (
    <button
      type="button"
      onClick={() => {
        reset();
        setDemo({ active: true, step: 0 });
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink"
    >
      ▶ 3분 데모
    </button>
  );
}
