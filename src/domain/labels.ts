// 화면 표시용 라벨과 한국어 조사 처리.

export const FIELD_LABEL: Record<string, string> = {
  consigneeAddress: "수하인 주소",
  grossWeight: "총중량",
  measurement: "용적",
  portOfDischarge: "양하항",
  hsCode: "HS 코드",
  notifyParty: "통지처",
  shipperFax: "화주 팩스번호",
};

export const fieldLabel = (field: string) => FIELD_LABEL[field] ?? field;

/** 마지막 글자 받침 유무로 조사를 붙인다. 한글이 아니면 받침 없음으로 본다. */
export function josa(word: string, pair: "을/를" | "이/가" | "은/는" | "과/와"): string {
  const [withFinal, noFinal] = pair.split("/") as [string, string];
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return word + noFinal;
  return word + ((code - 0xac00) % 28 ? withFinal : noFinal);
}

export const formatKRW = (n: number) => `${new Intl.NumberFormat("ko-KR").format(n)}원`;
