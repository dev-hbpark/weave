// 아쿠 클라이언트 측 휴리스틱 의도 분류기 (WI-148 / DR-102 D3, intentSource: "client").
//
// 모델 호출 0 — 키워드 + 선택 상태 규칙으로 IntentPlan을 추론한다. 자연어 의도 추론은
// 확률적이라 오분류가 0이 될 수 없으므로(FR-023 트레이드오프), 결과는 보정칩으로 노출되어
// 사용자가 교정한다(하이브리드). 명시 슬래시/칩 선택은 분류를 건너뛰고 직접 plan을 만든다.
//
// 규칙은 "우선순위 규칙 리스트(첫 매치)"이며 `switch`가 아니다(Rule 6). 신규 단서 = 행 하나.

import type { IntentPlan, Operation, Target, TonePolicy } from "./types.js";

export interface ClassifyContext {
  /** 현재 캔버스에 선택된 아이템이 있는가(getSelection().length > 0). */
  readonly hasSelection: boolean;
}

function has(text: string, words: readonly string[]): boolean {
  return words.some((w) => text.includes(w));
}

// ── 톤 정책 단서 ────────────────────────────────────────────────────────────────
const IGNORE_TONE = [
  "톤 무시",
  "톤무시",
  "기존 무시",
  "디자인 무시",
  "새 스타일",
  "새로운 스타일",
  "자유롭게",
];
const INHERIT_TONE = [
  "톤 유지",
  "톤유지",
  "같은 톤",
  "기존 톤",
  "같은 느낌",
  "톤 맞춰",
  "통일",
  "일관",
];

function detectTonePolicy(text: string, fallback: TonePolicy): TonePolicy {
  if (has(text, IGNORE_TONE)) return "ignore";
  if (has(text, INHERIT_TONE)) return "inherit";
  return fallback;
}

// ── target 단서 ────────────────────────────────────────────────────────────────
const WHOLE_DECK = ["전체", "모든", "모두", "전부", "덱 전체", "all"];
const REFERENCE_HINT = [
  "그 ",
  "저 ",
  "이 ",
  "번째",
  "제목",
  "타이틀",
  "차트",
  "이미지",
  "사진",
  "도형",
  "텍스트",
  "버튼",
  "표",
  "그래프",
];

/** target + (referenced일 때) 지칭 표현을 추론한다. recolor/deck-우선 op는 별도로 다룬다. */
export function resolveTarget(
  text: string,
  ctx: ClassifyContext,
): { target: IntentPlan["target"]; referencePhrase?: string } {
  if (has(text, WHOLE_DECK)) return { target: "deck" };
  if (ctx.hasSelection) return { target: "selected" };
  if (has(text, REFERENCE_HINT)) return { target: "referenced", referencePhrase: text.trim() };
  return { target: "none" };
}

/** operation별 완전-plan 빌더 — 레코드 기반(switch/if-chain 금지, Rule 6).
 *  아래 REOPERATE_TARGET과 같은 idiom. 세 동작군:
 *   - create/add: target 해석 없음(none).
 *   - recolor: 선택 없으면 덱 전역(deck), referencePhrase 미포함.
 *   - edit/delete/replace/retone: 선택/참조 기본, referencePhrase 보존, retone은 tone "match". */
type IntentBuilder = (
  operation: Operation,
  text: string,
  ctx: ClassifyContext,
  tone: TonePolicy,
) => IntentPlan;

const planNoTarget: IntentBuilder = (operation, _text, _ctx, tone) => ({
  operation,
  target: "none",
  tonePolicy: tone,
});

const planRecolor: IntentBuilder = (operation, text, ctx, tone) => {
  const t = resolveTarget(text, ctx);
  // 팔레트 변경은 선택이 없으면 덱 전역이 기본.
  return { operation, target: t.target === "none" ? "deck" : t.target, tonePolicy: tone };
};

const planSelectionTarget: IntentBuilder = (operation, text, ctx, tone) => {
  const t = resolveTarget(text, ctx);
  return {
    operation,
    target: t.target === "none" ? (ctx.hasSelection ? "selected" : "referenced") : t.target,
    tonePolicy: operation === "retone" ? "match" : tone,
    ...(t.referencePhrase !== undefined ? { referencePhrase: t.referencePhrase } : {}),
  };
};

const INTENT_FROM_OPERATION: Readonly<Record<Operation, IntentBuilder>> = {
  create: planNoTarget,
  add: planNoTarget,
  recolor: planRecolor,
  edit: planSelectionTarget,
  delete: planSelectionTarget,
  replace: planSelectionTarget,
  retone: planSelectionTarget,
};

/** 명시 op(슬래시/보정칩)로부터 target/tone을 채워 완전한 plan을 만든다. */
export function intentFromOperation(
  operation: Operation,
  text: string,
  ctx: ClassifyContext,
  tonePolicy?: TonePolicy,
): IntentPlan {
  const tone = tonePolicy ?? detectTonePolicy(text, "inherit");
  return INTENT_FROM_OPERATION[operation](operation, text, ctx, tone);
}

/** 보정칩에서 operation만 바꿀 때 target/tone 기본값을 새 operation에 맞춰 보정한다.
 *  레코드 기반 — switch 금지(Rule 6). 기존 plan의 referencePhrase는 유지한다. */
const REOPERATE_TARGET: Readonly<Record<Operation, (t: Target) => Target>> = {
  create: () => "none",
  add: () => "none",
  edit: (t) => (t === "none" ? "selected" : t),
  delete: (t) => (t === "none" ? "selected" : t),
  replace: (t) => (t === "none" ? "selected" : t),
  recolor: (t) => (t === "none" ? "deck" : t),
  retone: (t) => (t === "none" ? "selected" : t),
};

export function withOperation(plan: IntentPlan, operation: Operation): IntentPlan {
  return {
    ...plan,
    operation,
    target: REOPERATE_TARGET[operation](plan.target),
    tonePolicy: operation === "retone" ? "match" : plan.tonePolicy,
  };
}

// ── 우선순위 규칙 리스트(첫 매치) — operation 단서 ───────────────────────────────
interface Rule {
  readonly when: (text: string, ctx: ClassifyContext) => boolean;
  readonly operation: Operation;
}

const RULES: readonly Rule[] = [
  {
    when: (t) => has(t, ["삭제", "지워", "제거", "없애", "빼줘", "빼고", "delete", "remove"]),
    operation: "delete",
  },
  {
    when: (t) => has(t, ["교체", "바꿔치", "다른 걸로", "다른걸로", "대신", "replace", "swap"]),
    operation: "replace",
  },
  {
    when: (t) =>
      has(t, ["팔레트", "색상", "색깔", "컬러", "색을", "색감", "palette", "recolor", "color"]),
    operation: "recolor",
  },
  {
    when: (t) =>
      has(t, [
        "톤 맞춰",
        "톤맞춰",
        "톤에 맞",
        "통일",
        "일관되게",
        "스타일 맞춰",
        "같은 느낌으로",
        "맞춰줘",
      ]),
    operation: "retone",
  },
  {
    when: (t) =>
      has(t, [
        "추가",
        "넣어",
        "삽입",
        "새 슬라이드",
        "새 페이지",
        "새로운 슬라이드",
        "add",
        "insert",
        "한 장 더",
      ]),
    operation: "add",
  },
  {
    when: (t, ctx) =>
      !ctx.hasSelection &&
      has(t, ["만들어", "생성", "처음부터", "from scratch", "초안", "디자인해줘"]),
    operation: "create",
  },
];

/** 입력 텍스트 + 선택 상태로 IntentPlan을 추론. 매치 없으면 edit(가장 흔한 기본)로 폴백. */
export function classifyIntent(text: string, ctx: ClassifyContext): IntentPlan {
  const lower = text.toLowerCase();
  const probe = `${text}\n${lower}`;
  const rule = RULES.find((r) => r.when(probe, ctx));
  const operation = rule?.operation ?? "edit";
  return intentFromOperation(
    operation,
    text,
    ctx,
    detectTonePolicy(probe, operation === "add" ? "inherit" : "inherit"),
  );
}
