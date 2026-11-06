// 무역항 인포그래픽(인라인 SVG). 외부 이미지 없이 테마 색을 따른다.
// 화면은 CSS 변수, PDF(인쇄)는 고정 색을 넘겨 쓴다.
import { useId, type ReactNode } from "react";

export interface ScenePalette {
  crane: string;
  quay: string;
  sea: string;
  wave: string;
  hull: string;
  boxes: string[];
  route: string;
  label: string;
}

/** 히어로(어두운 그라데이션 위)용 기본 색 */
export const HERO_PALETTE: ScenePalette = {
  crane: "rgba(255,255,255,0.85)",
  quay: "rgba(255,255,255,0.18)",
  sea: "rgba(255,255,255,0.10)",
  wave: "rgba(255,255,255,0.35)",
  hull: "#0b1a2a",
  boxes: ["#f2a65a", "#5cc8d7", "#e86a5b", "#f4d58d", "#8fb8ff", "#7fd6a6"],
  route: "rgba(255,255,255,0.7)",
  label: "rgba(255,255,255,0.9)",
};

/** 인쇄(흰 종이)용 */
export const PRINT_PALETTE: ScenePalette = {
  crane: "#1f3a5f",
  quay: "#d9e2ec",
  sea: "#e8f1f8",
  wave: "#9fbfd9",
  hull: "#1f3a5f",
  boxes: ["#e8954a", "#3aa6b9", "#d65a4a", "#e9c46a", "#5b8def", "#52b788"],
  route: "#5b7a99",
  label: "#1f3a5f",
};

/** 컨테이너 한 줄: x부터 n개, 색은 팔레트를 순환 */
function Boxes({ x, y, n, w = 22, h = 11, colors, offset = 0 }: { x: number; y: number; n: number; w?: number; h?: number; colors: string[]; offset?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + i * (w + 2)} y={y} width={w} height={h} rx={1.5} fill={colors[(i + offset) % colors.length]} />
      ))}
    </>
  );
}

function Crane({ x, p }: { x: number; p: ScenePalette }) {
  // STS 크레인: 다리 둘, 가로 붐, 트롤리와 와이어
  return (
    <g stroke={p.crane} strokeWidth={2.2} strokeLinecap="round" fill="none">
      <path d={`M${x} 150 L${x + 6} 70 M${x + 30} 150 L${x + 24} 70`} />
      <path d={`M${x + 3} 110 L${x + 27} 110`} />
      <path d={`M${x - 40} 70 L${x + 62} 70`} strokeWidth={3} />
      <path d={`M${x + 15} 70 L${x + 15} 52 L${x - 30} 70 M${x + 15} 52 L${x + 55} 70`} strokeWidth={1.4} />
      <path d={`M${x - 20} 70 L${x - 20} 94`} strokeWidth={1.2} />
      <rect x={x - 26} y={66} width={12} height={6} rx={1} fill={p.crane} stroke="none" />
    </g>
  );
}

/** 항만 전경: 크레인·야적 컨테이너·컨테이너선·물결 + 부산→유럽 항로 */
export function PortScene({ palette = HERO_PALETTE, className = "", showRoute = true }: { palette?: ScenePalette; className?: string; showRoute?: boolean }) {
  const p = palette;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, ""); // url(#…)에 쓸 수 있는 글자만
  return (
    <svg viewBox="0 0 480 210" className={className} role="img" aria-label="컨테이너 항만 일러스트: 크레인과 컨테이너선, 부산에서 유럽으로 가는 항로">
      {showRoute && (
        <g>
          <path d="M40 40 C 160 -6, 320 -6, 440 40" fill="none" stroke={p.route} strokeWidth={1.5} strokeDasharray="3 5" />
          <circle cx={40} cy={40} r={4} fill={p.route} />
          <circle cx={440} cy={40} r={4} fill={p.route} />
          <text x={40} y={58} textAnchor="middle" fontSize={10} fontWeight={600} fill={p.label} letterSpacing="0.08em">BUSAN</text>
          <text x={440} y={58} textAnchor="middle" fontSize={10} fontWeight={600} fill={p.label} letterSpacing="0.08em">ROTTERDAM</text>
          {/* 항로 위의 작은 배 */}
          <path d="M232 14 l16 0 l-3 5 l-10 0 z" fill={p.route} />
        </g>
      )}

      {/* 부두 */}
      <rect x={0} y={150} width={300} height={10} fill={p.quay} />
      {/* 야적장 컨테이너 */}
      <Boxes x={8} y={137} n={5} colors={p.boxes} />
      <Boxes x={20} y={124} n={4} colors={p.boxes} offset={2} />
      <Boxes x={32} y={111} n={3} colors={p.boxes} offset={4} />
      <Boxes x={150} y={137} n={4} colors={p.boxes} offset={1} />
      <Boxes x={162} y={124} n={3} colors={p.boxes} offset={3} />

      <Crane x={250} p={p} />
      <Crane x={355} p={p} />

      {/* 컨테이너선 */}
      <g>
        <Boxes x={300} y={140} n={7} colors={p.boxes} offset={5} />
        <Boxes x={312} y={127} n={6} colors={p.boxes} offset={2} />
        <Boxes x={336} y={114} n={4} colors={p.boxes} />
        <rect x={442} y={118} width={14} height={34} rx={2} fill={p.hull} opacity={0.9} />
        <path d="M286 152 L470 152 L458 176 L300 176 Z" fill={p.hull} />
        <path d="M300 168 L458 168" stroke={p.boxes[0]} strokeWidth={2} />
      </g>

      {/* 바다·물결: 아래와 양옆으로 흐려지게 해서 상자처럼 보이지 않게 */}
      <defs>
        <linearGradient id={`sea-x-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.12" stopColor="white" stopOpacity="1" />
          <stop offset="0.88" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`sea-y-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={p.sea} />
          <stop offset="1" stopColor={p.sea} stopOpacity="0" />
        </linearGradient>
        <mask id={`sea-m-${uid}`}>
          <rect x={0} y={150} width={480} height={60} fill={`url(#sea-x-${uid})`} />
        </mask>
      </defs>
      <rect x={0} y={160} width={480} height={50} fill={`url(#sea-y-${uid})`} mask={`url(#sea-m-${uid})`} />
      <g fill="none" stroke={p.wave} strokeWidth={1.4} strokeLinecap="round">
        <path d="M10 186 q10 -6 20 0 t20 0 t20 0 t20 0" />
        <path d="M150 196 q10 -6 20 0 t20 0 t20 0" />
        <path d="M330 192 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0" />
      </g>
    </svg>
  );
}

// ── 작은 아이콘(24px 선 아이콘) ─────────────────────────
function Icon({ children, className = "size-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const icons = {
  anchor: (c?: string) => (
    <Icon className={c}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v14M5 12H3a9 9 0 0 0 18 0h-2M8 10h8" />
    </Icon>
  ),
  container: (c?: string) => (
    <Icon className={c}>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M7 9v6M11 9v6M15 9v6M19 9v6" />
    </Icon>
  ),
  ship: (c?: string) => (
    <Icon className={c}>
      <path d="M3 15l2 5h14l2-5H3z" />
      <path d="M6 15V9h12v6M10 9V5h4v4" />
    </Icon>
  ),
  route: (c?: string) => (
    <Icon className={c}>
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
      <path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6" strokeDasharray="2 2.5" />
    </Icon>
  ),
  doc: (c?: string) => (
    <Icon className={c}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  ),
  layers: (c?: string) => (
    <Icon className={c}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Icon>
  ),
  hourglass: (c?: string) => (
    <Icon className={c}>
      <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />
    </Icon>
  ),
  shield: (c?: string) => (
    <Icon className={c}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  ),
  download: (c?: string) => (
    <Icon className={c}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Icon>
  ),
  sun: (c?: string) => (
    <Icon className={c}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  ),
  moon: (c?: string) => (
    <Icon className={c}>
      <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
    </Icon>
  ),
  close: (c?: string) => (
    <Icon className={c}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  ),
};
