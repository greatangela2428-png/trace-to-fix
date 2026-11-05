// 테마: 사용자가 고르지 않았으면 보는 사람의 시스템 설정(prefers-color-scheme)을 따른다.
// 고르면 이 브라우저에만 기억한다.
export type Theme = "dark" | "light";
const KEY = "ttf-theme";

const isTheme = (v: unknown): v is Theme => v === "dark" || v === "light";

/** 명시적으로 고른 테마. 없으면 null(시스템 설정을 따름). */
export function readSavedTheme(): Theme | null {
  const q = new URLSearchParams(location.search).get("theme"); // 로컬 시연용 ?theme=light
  if (isTheme(q)) return q;
  try {
    const t = localStorage.getItem(KEY);
    if (isTheme(t)) return t;
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
  return null;
}

export function applyTheme(t: Theme | null) {
  if (t) document.documentElement.dataset.theme = t;
}

/** 지금 화면에 적용된 테마. */
export function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (isTheme(attr)) return attr;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function saveTheme(t: Theme) {
  applyTheme(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* 무시 */
  }
}
