// 아쿠 의도 라우팅 레지스트리 (WI-148 / DR-102 D2).
//
// operation → 라우트(지시문 빌더 + 톤 컨텍스트 정책). 이것이 "의도별로 파이프라인을
// 다르게"의 클라이언트 측 실체다: 각 operation이 task에 덧붙는 제약 지시문과, 어떤 톤
// 컨텍스트(덱 톤 / 현재 팔레트 / 없음)를 주입할지를 결정한다. 분기는 레지스트리 조회이며
// `switch(operation)`이 아니다(Rule 6 / OCP — 신규 op = 항목 하나).
//
// 서버 측 pass 오버라이드(리뷰 파이프라인 튜닝)는 하니스 소유라 여기 없다(HANDOFF-027,
// Phase 2). Phase 1은 task 증강만으로 동작한다(서버 무변경).

import type { IntentPlan, Operation, Target, TonePolicy } from "./types.js";

/** 주입할 톤 컨텍스트의 종류 — 실제 텍스트는 compose-intent-task가 채운다. */
export type ToneContextNeed = "none" | "deck-tone" | "current-palette";

export interface RouteSpec {
  /** operation별 지시문 절을 만든다(target/tone 반영). 빈 문자열 = 기본 경로(create). */
  directive(plan: IntentPlan): string;
  /** (operation, tonePolicy) → 어떤 톤 컨텍스트가 필요한가. */
  toneNeed(tonePolicy: TonePolicy): ToneContextNeed;
}

/** target을 가리키는 지시문 조각. referenced는 지칭 표현을 스냅샷 해소하도록 안내한다. */
function targetClause(plan: IntentPlan): string {
  const byTarget: Readonly<Record<Target, string>> = {
    none: "",
    selected: "현재 선택된 아이템(아래 [컨텍스트]의 id)에만",
    referenced:
      plan.referencePhrase !== undefined && plan.referencePhrase !== ""
        ? `다음 표현이 가리키는 아이템을 스냅샷에서 먼저 찾아: "${plan.referencePhrase}" (모호하면 가장 그럴듯한 하나를 고르되, 확신이 없으면 질문) 그 아이템에만`
        : "사용자가 지칭한 아이템에만",
    deck: "모든 슬라이드에 걸쳐",
  };
  return byTarget[plan.target];
}

const COMMON_TAIL = " 그 외의 아이템·레이아웃·구조는 절대 바꾸지 마세요.";

/** operation → 라우트. 레코드 — switch 금지. */
export const INTENT_ROUTES: Readonly<Record<Operation, RouteSpec>> = {
  create: {
    directive: () => "",
    toneNeed: () => "none",
  },
  add: {
    directive: (plan) =>
      plan.tonePolicy === "ignore"
        ? "[의도] 기존 슬라이드는 그대로 두고 새 슬라이드/아이템만 추가하세요. 기존 디자인 톤에 얽매이지 말고, 이 콘텐츠에 가장 맞는 새 스타일로 자유롭게 디자인하세요. 새 슬라이드는 다음 filmstrip x 위치에 놓으세요."
        : "[의도] 기존 슬라이드는 그대로 두고 새 슬라이드/아이템만 추가하세요. 새 슬라이드는 기존 덱의 톤(아래 [덱 톤])을 유지하고, 다음 filmstrip x 위치에 놓으세요.",
    // inherit/match → 덱 톤 주입, ignore → 주입하지 않음(새로 시작).
    toneNeed: (tone) => (tone === "ignore" ? "none" : "deck-tone"),
  },
  edit: {
    directive: (plan) => `[의도] ${targetClause(plan)} 내용/속성을 수정하세요.${COMMON_TAIL}`,
    toneNeed: () => "none",
  },
  delete: {
    directive: (plan) =>
      `[의도] ${targetClause(plan)} 해당 아이템을 삭제하고, 남은 레이아웃만 자연스럽게 재정렬하세요.${COMMON_TAIL}`,
    toneNeed: () => "none",
  },
  replace: {
    directive: (plan) =>
      `[의도] ${targetClause(plan)} 해당 아이템을 제거하고, 같은 frame/위치/크기에 요청한 새 콘텐츠를 넣으세요. 주변 레이아웃과 다른 아이템은 그대로 두세요.`,
    // 교체물은 슬롯의 기존 톤을 잇는 게 자연스러우므로 덱 톤을 참고로 준다.
    toneNeed: () => "deck-tone",
  },
  recolor: {
    directive: (plan) =>
      `[의도] ${targetClause(plan)} 색상(팔레트·채움·강조색·그라데이션)만 변경하세요. 텍스트 내용, 레이아웃, 구조, 크기, 폰트는 절대 바꾸지 마세요.`,
    toneNeed: () => "current-palette",
  },
  retone: {
    directive: (plan) =>
      `[의도] ${targetClause(plan)} 시각 톤(팔레트·타이포·도형 언어·여백)을 덱 톤(아래 [덱 톤])에 맞추세요. 텍스트 내용과 구조는 그대로 두세요.`,
    toneNeed: () => "deck-tone",
  },
};
