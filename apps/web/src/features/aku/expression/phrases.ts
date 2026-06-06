// 아쿠 expression — mood→phrase registry (WI-103 / DR-070 D5).
//
// The "재미있는 문구" layer. These are EVENT/TURN-bound captions (shown above the
// collapsed launcher while a turn streams, or for the brief celebrate window) —
// NOT a proactive nag. The proactive tip cadence stays owned by useAkuTips with
// its cooldown / 영구끄기 guard (anti-Clippy); this registry never changes that
// cadence (DR-070 D5, RISK_NOTES R5).
//
// Rule 6: a Map keyed by mood, not a switch. Picking is deterministic (seeded by
// a turn counter) — Math.random is avoided so it stays test-stable and SSR-safe.

import type { AkuMood } from "./mood.js";

const MOOD_PHRASES: ReadonlyMap<AkuMood, readonly string[]> = new Map([
  ["connecting", ["연결하는 중이에요…", "곧 준비될게요!", "서버에 닿는 중…"]],
  ["thinking", ["흠… 어떻게 만들까?", "잠깐 생각 중이에요", "아이디어 떠올리는 중…"]],
  ["adding", ["여기 딱 넣을게요!", "새로 하나 추가요 ✨", "짠— 생기는 중!"]],
  ["updating", ["슥슥 고치는 중", "이쪽 다듬을게요", "바꿔드릴게요!"]],
  ["working", ["쓱쓱 그리는 중!", "이거 바로 해드릴게요", "열심히 만드는 중이에요"]],
  ["finalizing", ["거의 다 됐어요", "마무리 다듬는 중…", "깔끔하게 정리할게요"]],
  ["celebrating", ["완성! 어때요?", "짠— 됐어요 ✨", "마음에 드시면 좋겠어요!"]],
  ["confused", ["어라, 연결이 잠깐…", "음, 다시 해볼게요", "잠시만요…"]],
  ["sleeping", ["…(꾸벅)", "부르면 깨어날게요", "zzz"]],
  ["looking", ["오, 그거 고르셨네요", "이거 손볼까요?", "뭔가 해드릴까요?"]],
  ["idle", ["뭐든 말씀하세요!", "도와드릴까요?"]],
]);

/** Phrases for a mood (empty array if none registered — caller decides fallback). */
export function phrasesFor(mood: AkuMood): readonly string[] {
  return MOOD_PHRASES.get(mood) ?? [];
}

/** Deterministic pick (seed = a turn/visit counter from the caller). Returns null
 *  when the mood has no phrases, so the caller can choose to show nothing. */
export function pickPhrase(mood: AkuMood, seed: number): string | null {
  const list = phrasesFor(mood);
  if (list.length === 0) return null;
  const i = ((seed % list.length) + list.length) % list.length;
  return list[i] ?? null;
}

/** All moods that carry at least one phrase — used by the coverage test. */
export function moodsWithPhrases(): readonly AkuMood[] {
  return [...MOOD_PHRASES.keys()];
}
