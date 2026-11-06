// 화면 하나에서 오류가 나도 앱 전체가 하얗게 멈추지 않게 한다(오류 상태)
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onReset?: () => void;
  resetKey?: string; // 탭이 바뀌면 오류 상태를 풀어 다른 화면은 쓸 수 있게
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[화면 오류]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" className="rounded-3xl border border-danger/40 bg-danger-soft p-6">
        <h2 className="font-semibold text-danger">이 화면을 그리는 중 문제가 생겼습니다</h2>
        <p className="mt-1 text-sm text-ink-2">다른 탭은 계속 쓸 수 있습니다. 샘플 상태로 되돌리면 대부분 해결됩니다.</p>
        <p className="mt-2 break-all font-mono text-xs text-ink-3">{this.state.error.message}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => this.setState({ error: null })} className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
            다시 그리기
          </button>
          {this.props.onReset && (
            <button
              type="button"
              onClick={() => {
                this.props.onReset?.();
                this.setState({ error: null });
              }}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent"
            >
              샘플 상태로 되돌리기
            </button>
          )}
        </div>
      </section>
    );
  }
}
