// 입력란 안내: 무엇이 미리 준비된 샘플이고, 무엇을 코드 규칙이 판정하는지 + [규칙 목록 보기]
import { useState, type ReactNode } from "react";
import { CODE_RULE_COUNT } from "../../rules";
import { RulesDialog } from "./InfoDialogs";

export function RulesNotice({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
      <span>{children}</span>
      <span>
        코드 규칙 <b className="tabular-nums text-ink-2">{CODE_RULE_COUNT}</b>개 동작 중
      </span>
      <button type="button" onClick={() => setOpen(true)} className="text-accent underline-offset-2 hover:underline">
        규칙 목록 보기
      </button>
      <RulesDialog open={open} onClose={() => setOpen(false)} />
    </p>
  );
}
