// 덱 톤 프로파일 추출 (WI-148 / DR-102 D5, 클라이언트 측 design.tone 대체).
//
// inherit/match/recolor 라우트가 task에 주입할 "현재 덱의 톤"을 문서에서 직접 뽑는다 —
// 원시 doc 스냅샷엔 해석된 색/폰트가 흩어져 있으므로, 자주 쓰인 구체 색·폰트·형태 언어를
// 압축한 한 줄로 만든다. 순수·결정론적(테스트 가능). 문서 순회 형태는 diversity-metric의
// SigItem 모델을 재사용한다(타입 전용 import — 런타임 결합 없음).
//
// Phase 2에서 weave가 정식 `design.tone` 컨텍스트 툴을 추가하면 서버도 동일 정보를
// 조회한다(HANDOFF-027). Phase 1은 이 클라이언트 추출로 서버 무변경 동작.

import { parseColor } from "../../diversity/color-metrics.js";
import type { SigDocument, SigItem } from "../../diversity/diversity-metric.js";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function paintColors(paint: unknown): string[] {
  if (paint === null || typeof paint !== "object") return [];
  const p = paint as Record<string, unknown>;
  const out: string[] = [];
  const solid = asString(p.color);
  if (solid !== undefined) out.push(solid);
  if (Array.isArray(p.stops)) {
    for (const stop of p.stops) {
      const c = asString((stop as Record<string, unknown>)?.color);
      if (c !== undefined) out.push(c);
    }
  }
  return out;
}

interface ToneAcc {
  readonly colorFreq: Map<string, number>;
  readonly fonts: Set<string>;
  hasRounded: boolean;
  hasShadow: boolean;
  tokenColors: number;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function visit(item: SigItem, acc: ToneAcc): void {
  const a = item.attrs ?? {};
  for (const c of [asString(a.color), asString(a.background)]) {
    if (c !== undefined) {
      if (c.startsWith("var(")) acc.tokenColors += 1;
      else bump(acc.colorFreq, c);
    }
  }
  const font = asString(a.fontFamily);
  if (font !== undefined) acc.fonts.add(font.split(",")[0]?.trim() ?? font);
  if (typeof a.cornerRadius === "number" && a.cornerRadius > 0) acc.hasRounded = true;
  if (a.cornerRadii !== undefined && a.cornerRadii !== null) acc.hasRounded = true;

  for (const u of item.units ?? []) {
    if (u.kind === "decoration.fill") {
      for (const c of paintColors(u.attrs)) {
        if (c.startsWith("var(")) acc.tokenColors += 1;
        else bump(acc.colorFreq, c);
      }
    }
    if (u.kind === "decoration.stroke") {
      for (const c of paintColors((u.attrs as Record<string, unknown>)?.paint)) {
        if (!c.startsWith("var(")) bump(acc.colorFreq, c);
      }
    }
    if (u.kind === "decoration.shadow") acc.hasShadow = true;
  }
  for (const child of item.children ?? []) visit(child, acc);
}

export interface ToneProfile {
  /** 빈도 상위 구체(해석 가능) 색들. */
  readonly colors: ReadonlyArray<string>;
  readonly fonts: ReadonlyArray<string>;
  readonly hasRounded: boolean;
  readonly hasShadow: boolean;
  /** var(--token) 색이 쓰였는가(테마 토큰 의존 디자인). */
  readonly usesTokens: boolean;
}

/** 문서에서 톤 프로파일을 뽑는다. 빈 문서 → 빈 프로파일. */
export function extractToneProfile(doc: SigDocument): ToneProfile {
  const acc: ToneAcc = {
    colorFreq: new Map(),
    fonts: new Set(),
    hasRounded: false,
    hasShadow: false,
    tokenColors: 0,
  };
  if (doc.root !== undefined) visit(doc.root, acc);
  const colors = [...acc.colorFreq.entries()]
    .filter(([c]) => parseColor(c) !== null)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 6)
    .map(([c]) => c);
  return {
    colors,
    fonts: [...acc.fonts].slice(0, 3),
    hasRounded: acc.hasRounded,
    hasShadow: acc.hasShadow,
    usesTokens: acc.tokenColors > 0,
  };
}

function shapeLanguage(p: ToneProfile): string {
  const parts: string[] = [];
  if (p.hasRounded) parts.push("둥근 모서리");
  if (p.hasShadow) parts.push("그림자(깊이)");
  return parts.length > 0 ? ` · 형태: ${parts.join("·")}` : "";
}

/** inherit/match/replace/retone 용 `[덱 톤]` 라인. 정보가 없으면 빈 문자열. */
export function deckToneLine(doc: SigDocument): string {
  const p = extractToneProfile(doc);
  if (p.colors.length === 0 && p.fonts.length === 0 && !p.usesTokens) return "";
  const colorPart =
    p.colors.length > 0
      ? `주요 색: ${p.colors.join(", ")}`
      : p.usesTokens
        ? "주요 색: 활성 테마 토큰(var(--token)) 기반"
        : "";
  const fontPart = p.fonts.length > 0 ? ` · 폰트: ${p.fonts.join(", ")}` : "";
  return `\n\n[덱 톤] ${colorPart}${fontPart}${shapeLanguage(p)}. 새/수정 디자인은 이 톤(색·폰트·형태 언어)을 일관되게 유지하세요.`;
}

/** recolor 용 `[현재 팔레트]` 라인 — 교체 대상 색들을 알려준다. */
export function currentPaletteLine(doc: SigDocument): string {
  const p = extractToneProfile(doc);
  if (p.colors.length === 0) {
    return p.usesTokens
      ? "\n\n[현재 팔레트] 현재 색은 활성 테마 토큰(var(--token)) 기반입니다. 요청한 팔레트로 바꾸되, 구조/내용/크기는 그대로 두세요."
      : "";
  }
  return `\n\n[현재 팔레트] 현재 사용 중인 색: ${p.colors.join(", ")}. 이 색들을 요청한 새 팔레트로 교체하되, 텍스트 내용·레이아웃·구조·크기는 그대로 두세요.`;
}
