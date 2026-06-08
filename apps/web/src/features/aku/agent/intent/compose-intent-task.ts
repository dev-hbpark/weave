// 의도 → task 증강 블록 (WI-148 / DR-102 D2·D3, intentSource: "client").
//
// IntentPlan과 현재 문서로부터 task에 덧붙일 `[의도] … [덱 톤]/[현재 팔레트]` 블록을 만든다.
// create(빈 지시문)는 기본 경로이므로 빈 문자열을 반환해 현재 동작을 그대로 둔다.
// 이 블록이 runTurn의 라인 조립(primer/design/style/selection…)에 합류한다.

import type { SigDocument } from "../../diversity/diversity-metric.js";
import { INTENT_ROUTES } from "./routes.js";
import { currentPaletteLine, deckToneLine } from "./tone-profile.js";
import type { IntentPlan } from "./types.js";

/** 톤 컨텍스트 종류 → 라인 빌더. 레코드 — switch 금지(Rule 6). */
const TONE_LINE: Readonly<
  Record<"none" | "deck-tone" | "current-palette", (doc: SigDocument) => string>
> = {
  none: () => "",
  "deck-tone": deckToneLine,
  "current-palette": currentPaletteLine,
};

/** plan + 문서 → task에 합류할 의도 블록(앞에 빈 줄 포함). create/빈 지시문 → "". */
export function composeIntentTask(plan: IntentPlan, doc: SigDocument): string {
  const route = INTENT_ROUTES[plan.operation];
  const directive = route.directive(plan);
  if (directive === "") return "";
  const tone = TONE_LINE[route.toneNeed(plan.tonePolicy)](doc);
  return `\n\n${directive}${tone}`;
}
