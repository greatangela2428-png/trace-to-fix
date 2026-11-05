// 시드 데이터: JSON을 스키마로 검증한 뒤 내보낸다. 검증 실패 시 앱 시작 시점에 바로 드러난다.
import { z } from "zod";
import {
  DocSchema,
  FieldSnapshotSchema,
  ProcedureSchema,
  ReportSchema,
  ReworkCaseSchema,
} from "../domain/schemas";
import casesJson from "./cases.json";
import snapshotsJson from "./snapshots.json";
import reportJson from "./report.json";
import docsJson from "./docs.json";
import proceduresJson from "./procedures.json";

/** 시연 기준일. 시드가 2025-11~2026-10 기록이라 고정한다. 실데이터 연동 시 오늘 날짜로 바꾼다. */
export const AS_OF = "2026-11-05";

export const seed = {
  procedures: z.array(ProcedureSchema).parse(proceduresJson),
  cases: z.array(ReworkCaseSchema).parse(casesJson),
  snapshots: z.array(FieldSnapshotSchema).parse(snapshotsJson),
  report: ReportSchema.parse(reportJson),
  docs: z.array(DocSchema).parse(docsJson),
};
