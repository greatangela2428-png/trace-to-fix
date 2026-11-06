// KOTRA 권역별 경제 지표(② 논리 역추적의 참고 지표). 작은 파일이라 번들에 넣는다.
// 데이터 갱신: npm run data:kotra
import { EconFileSchema } from "../../domain/kotra";
import econJson from "./econ.json";

export const econ = EconFileSchema.parse(econJson);
