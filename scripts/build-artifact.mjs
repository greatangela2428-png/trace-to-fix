// vite build 결과(dist)를 HTML 파일 하나로 합쳐 claude.ai Artifact로 올릴 수 있게 만든다.
// Artifact는 문서 뼈대(<html><head><body>)를 자동으로 씌우므로 본문 조각만 쓴다.
// 사용: npm run build:artifact  →  artifact/trace-to-fix.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");

const jsFile = html.match(/src="\/assets\/([^"]+\.js)"/)?.[1];
const cssFile = html.match(/href="\/assets\/([^"]+\.css)"/)?.[1];
if (!jsFile || !cssFile) throw new Error("dist/index.html에서 JS/CSS 파일을 찾지 못했습니다. 먼저 vite build를 실행하세요.");

const js = readFileSync(new URL(`assets/${jsFile}`, dist), "utf8").replaceAll("</script", "<\\/script");
const css = readFileSync(new URL(`assets/${cssFile}`, dist), "utf8").replaceAll("</style", "<\\/style");

const out = `<title>업무 역추적 시스템</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

const outDir = new URL("../artifact/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("trace-to-fix.html", outDir), out);
console.log(`artifact/trace-to-fix.html (${(out.length / 1024).toFixed(0)} KB)`);
