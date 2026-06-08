// 아쿠 의도 모델 (WI-148 / DR-102) — 편집 의도를 직교 3축으로 표현한다.
//
// 요청된 ~9개 의도(추가/수정/삭제/교체/팔레트변경/톤유지추가/톤무시추가/톤맞춤…)는
// 평면 enum이 아니라 Operation × Target × TonePolicy 의 조합이다. 이렇게 분해해야
// 신규 의도가 조합 폭발 없이 표현되고, 라우팅이 `switch(operation)` 없이 레지스트리
// (routes.ts)로 처리된다(루트 CLAUDE.md Rule 6 / OCP).

/** 동사 — 라우팅 레지스트리의 키. 하나의 operation = 하나의 라우트(routes.ts). */
export type Operation =
  | "create" // 빈 캔버스/콘텐츠로 새 덱 저작
  | "add" // 기존 덱에 새 슬라이드/아이템 추가
  | "edit" // 대상 아이템의 내용/속성 수정
  | "delete" // 대상 아이템 삭제
  | "replace" // 대상 아이템을 같은 자리에 다른 것으로 교체
  | "recolor" // 색상 팔레트만 변경(구조/내용 불변)
  | "retone"; // 대상의 시각 톤을 덱 톤에 맞춤

/** 범위 — 어떤 대상에 작용하는가. */
export type Target =
  | "none" // 덱 전체 / 신규(특정 대상 없음)
  | "selected" // 현재 선택된 아이템
  | "referenced" // 자연어로 지칭한 아이템("그 제목", "두 번째 차트")
  | "deck"; // 모든 슬라이드(팔레트 전역 변경 등)

/** 톤 정책 — 주로 add/retone 의 수식자. */
export type TonePolicy =
  | "inherit" // 기존 덱 톤 유지
  | "ignore" // 기존 디자인 무시, 새로 시작
  | "match"; // 대상을 덱 톤에 맞춰 변경

export interface IntentPlan {
  readonly operation: Operation;
  readonly target: Target;
  readonly tonePolicy: TonePolicy;
  /** target === "referenced" 일 때 사용자가 지칭한 표현(에이전트가 스냅샷에서 해소). */
  readonly referencePhrase?: string;
}

/** 분류 위치(클라이언트 설정 intentSource)와 무관한, 안정 시임의 의도값. */
export const ALL_OPERATIONS: readonly Operation[] = [
  "create",
  "add",
  "edit",
  "delete",
  "replace",
  "recolor",
  "retone",
];

/** 사람이 읽는 한국어 라벨(보정칩·슬래시·디버그용). 레코드 — 신규 op = 항목 하나. */
export const OPERATION_LABELS: Readonly<Record<Operation, string>> = {
  create: "새로 만들기",
  add: "추가",
  edit: "수정",
  delete: "삭제",
  replace: "교체",
  recolor: "팔레트 변경",
  retone: "톤 맞춤",
};

export const TARGET_LABELS: Readonly<Record<Target, string>> = {
  none: "전체",
  selected: "선택 항목",
  referenced: "지칭 항목",
  deck: "덱 전체",
};

export const TONE_LABELS: Readonly<Record<TonePolicy, string>> = {
  inherit: "톤 유지",
  ignore: "톤 무시",
  match: "톤 맞춤",
};

/** 칩에 보일 한 줄 요약(예: "수정 · 선택 항목"). 톤 정책이 의미 있는 op에서만 톤을 덧붙인다. */
export function describeIntent(plan: IntentPlan): string {
  const head = `${OPERATION_LABELS[plan.operation]} · ${TARGET_LABELS[plan.target]}`;
  const toneRelevant = plan.operation === "add" || plan.operation === "retone";
  return toneRelevant ? `${head} · ${TONE_LABELS[plan.tonePolicy]}` : head;
}
