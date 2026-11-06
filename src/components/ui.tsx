import { useState, type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6 ${className}`}>{children}</section>;
}

/** 탭 첫머리 소개: 아이콘 + 설명. 모든 탭이 같은 모양으로 시작한다. */
export function Intro({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-4 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info-soft text-accent">{icon}</div>
      <div className="min-w-0">
        <h2 className="font-semibold text-ink">{title}</h2>
        <div className="mt-1 leading-relaxed text-ink-2">{children}</div>
      </div>
    </section>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[1.05rem] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

type Tone = "neutral" | "danger" | "warn" | "ok" | "info";
const TONE: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-ink-2",
  danger: "border-danger/30 bg-danger-soft text-danger",
  warn: "border-warn/30 bg-warn-soft text-warn",
  ok: "border-ok/30 bg-ok-soft text-ok",
  info: "border-info/30 bg-info-soft text-info",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.8rem] leading-5 ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** 모든 AI·규칙 추정 옆에 붙이는 배지(원칙 3). */
export const NeedsReview = () => <Badge tone="warn">담당자 확인 필요</Badge>;

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-line bg-surface px-5 py-4 shadow-card">
      <div className="flex items-center gap-2 text-sm text-ink-3">
        {icon && <span className="text-accent">{icon}</span>}
        {label}
      </div>
      <div className="mt-1 text-[1.4rem] font-bold tracking-tight tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-3">{sub}</div>}
    </div>
  );
}

const BTN = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  ghost: "border border-line text-ink-2 hover:bg-surface-2 hover:text-ink",
};

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: keyof typeof BTN;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${BTN[variant]}`}
    >
      {children}
    </button>
  );
}

/** 두 번 눌러야 실행되는 버튼: 사람의 명시적 승인을 받기 위한 장치. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <Button variant="primary" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button onClick={() => setArmed(false)}>취소</Button>
    </span>
  );
}
