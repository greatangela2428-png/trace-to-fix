// 공공데이터 출처 표기(이용조건·내려받은 날짜 포함)
import type { DataSource } from "../domain/kotra";

export function SourceNote({ source }: { source: DataSource }) {
  return (
    <p className="text-xs leading-relaxed text-ink-3">
      출처:{" "}
      <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink-2">
        {source.name}
      </a>{" "}
      ({source.fileName}, 공공데이터포털) · {source.license} · {source.fetchedAt} 내려받음. 원자료 값은 바꾸지 않았습니다.
    </p>
  );
}
