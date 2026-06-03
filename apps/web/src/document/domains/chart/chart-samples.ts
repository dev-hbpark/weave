// WI-086 — per-type sample data. When the current dataset can't satisfy a chart
// type's required channels (→ placeholder), the panel offers a "샘플 데이터" button
// that loads a fitting typed dataset + encoding for that type, so every one of
// the 14 families is immediately demoable. The encoding is explicit (not just
// autoEncode) so multi-channel types like radar show a full example.

import type { DatasetColumn, DatasetPayload, DatasetRow } from "../../dataset/dataset-store.js";
import type { ChartEncoding, ChartType } from "./chart-model.js";

export interface ChartSample {
  readonly dataset: DatasetPayload;
  readonly encoding: ChartEncoding;
}

function ds(
  name: string,
  columns: ReadonlyArray<DatasetColumn>,
  rows: ReadonlyArray<DatasetRow>,
): DatasetPayload {
  return { name, columns, rows };
}
const nom = (name: string): DatasetColumn => ({ name, type: "nominal" });
const num = (name: string): DatasetColumn => ({ name, type: "quantitative" });
const tmp = (name: string): DatasetColumn => ({ name, type: "temporal" });
const f = (field: string): { field: string } => ({ field });

// ── shared samples by encoding shape ───────────────────────────────────────

const CATEGORY_VALUE: ChartSample = {
  dataset: ds(
    "샘플",
    [nom("항목"), num("값")],
    [
      { 항목: "A", 값: 30 },
      { 항목: "B", 값: 80 },
      { 항목: "C", 값: 45 },
      { 항목: "D", 값: 60 },
    ],
  ),
  encoding: { category: f("항목"), value: [f("값")] },
};

const XY: ChartSample = {
  dataset: ds(
    "샘플",
    [num("키"), num("몸무게"), num("나이")],
    [
      { 키: 165, 몸무게: 60, 나이: 25 },
      { 키: 172, 몸무게: 68, 나이: 31 },
      { 키: 180, 몸무게: 80, 나이: 45 },
      { 키: 158, 몸무게: 52, 나이: 22 },
    ],
  ),
  encoding: { x: f("키"), y: f("몸무게") },
};

const CHART_SAMPLES: Partial<Record<ChartType, ChartSample>> = {
  bar: CATEGORY_VALUE,
  line: CATEGORY_VALUE,
  area: CATEGORY_VALUE,
  pie: CATEGORY_VALUE,
  funnel: {
    dataset: ds(
      "샘플",
      [nom("단계"), num("수")],
      [
        { 단계: "방문", 수: 1000 },
        { 단계: "가입", 수: 420 },
        { 단계: "구매", 수: 160 },
        { 단계: "재구매", 수: 60 },
      ],
    ),
    encoding: { category: f("단계"), value: [f("수")] },
  },
  gauge: {
    dataset: ds("샘플", [num("달성률")], [{ 달성률: 72 }]),
    encoding: { value: [f("달성률")] },
  },
  scatter: XY,
  bubble: { dataset: XY.dataset, encoding: { x: f("키"), y: f("몸무게"), size: f("나이") } },
  radar: {
    dataset: ds(
      "샘플",
      [nom("지표"), num("팀A"), num("팀B")],
      [
        { 지표: "속도", 팀A: 80, 팀B: 60 },
        { 지표: "힘", 팀A: 70, 팀B: 90 },
        { 지표: "기술", 팀A: 90, 팀B: 75 },
        { 지표: "체력", 팀A: 65, 팀B: 85 },
      ],
    ),
    encoding: { category: f("지표"), value: [f("팀A"), f("팀B")] },
  },
  heatmap: {
    dataset: ds(
      "샘플",
      [nom("요일"), nom("시간"), num("활동")],
      [
        { 요일: "월", 시간: "오전", 활동: 3 },
        { 요일: "월", 시간: "오후", 활동: 7 },
        { 요일: "화", 시간: "오전", 활동: 5 },
        { 요일: "화", 시간: "오후", 활동: 9 },
        { 요일: "수", 시간: "오전", 활동: 2 },
        { 요일: "수", 시간: "오후", 활동: 8 },
      ],
    ),
    encoding: { x: f("요일"), y: f("시간"), value: f("활동") },
  },
  candlestick: {
    dataset: ds(
      "샘플",
      [tmp("날짜"), num("시가"), num("고가"), num("저가"), num("종가")],
      [
        { 날짜: "2026-01-02", 시가: 100, 고가: 112, 저가: 96, 종가: 108 },
        { 날짜: "2026-01-03", 시가: 108, 고가: 115, 저가: 104, 종가: 106 },
        { 날짜: "2026-01-04", 시가: 106, 고가: 109, 저가: 98, 종가: 101 },
        { 날짜: "2026-01-05", 시가: 101, 고가: 118, 저가: 100, 종가: 116 },
      ],
    ),
    encoding: {
      category: f("날짜"),
      open: f("시가"),
      high: f("고가"),
      low: f("저가"),
      close: f("종가"),
    },
  },
  boxplot: {
    dataset: ds(
      "샘플",
      [nom("그룹"), num("최소"), num("Q1"), num("중앙값"), num("Q3"), num("최대")],
      [
        { 그룹: "A", 최소: 5, Q1: 18, 중앙값: 32, Q3: 48, 최대: 70 },
        { 그룹: "B", 최소: 10, Q1: 25, 중앙값: 40, Q3: 55, 최대: 80 },
        { 그룹: "C", 최소: 2, Q1: 12, 중앙값: 22, Q3: 35, 최대: 52 },
      ],
    ),
    encoding: {
      category: f("그룹"),
      lower: f("최소"),
      q1: f("Q1"),
      median: f("중앙값"),
      q3: f("Q3"),
      upper: f("최대"),
    },
  },
  treemap: {
    dataset: ds(
      "샘플",
      [nom("항목"), nom("상위"), num("값")],
      [
        { 항목: "엔지니어링", 상위: "", 값: 0 },
        { 항목: "프론트엔드", 상위: "엔지니어링", 값: 40 },
        { 항목: "백엔드", 상위: "엔지니어링", 값: 35 },
        { 항목: "인프라", 상위: "엔지니어링", 값: 25 },
      ],
    ),
    encoding: { id: f("항목"), parent: f("상위"), value: f("값") },
  },
  sankey: {
    dataset: ds(
      "샘플",
      [nom("원천"), nom("대상"), num("값")],
      [
        { 원천: "방문", 대상: "장바구니", 값: 60 },
        { 원천: "방문", 대상: "이탈", 값: 40 },
        { 원천: "장바구니", 대상: "구매", 값: 35 },
        { 원천: "장바구니", 대상: "이탈", 값: 25 },
      ],
    ),
    encoding: { source: f("원천"), target: f("대상"), value: f("값") },
  },
};

/** A fitting sample (typed dataset + encoding) for `type`, or undefined. */
export function chartSample(type: ChartType): ChartSample | undefined {
  return CHART_SAMPLES[type];
}
