import { describe, expect, it } from "vitest";
import type { SigDocument } from "../../diversity/diversity-metric.js";
import { composeIntentTask } from "./compose-intent-task.js";
import { INTENT_ROUTES } from "./routes.js";
import { deckToneLine, extractToneProfile } from "./tone-profile.js";
import { ALL_OPERATIONS, type IntentPlan } from "./types.js";

const EMPTY_DOC: SigDocument = { root: { kind: "root", children: [] } };

// A tiny deck: one slide-frame with a navy fill + a heading text in Playfair.
const TONED_DOC: SigDocument = {
  root: {
    kind: "root",
    children: [
      {
        kind: "frame",
        attrs: { cornerRadius: 16 },
        units: [
          { kind: "decoration.fill", attrs: { type: "solid", color: "#0b1020" } },
          { kind: "decoration.shadow", attrs: { x: 0, y: 4, blur: 12, color: "#0008" } },
        ],
        children: [
          {
            kind: "text",
            attrs: { color: "#e2e8f0", fontFamily: "Playfair Display, serif" },
          },
          {
            kind: "text",
            attrs: { color: "#0b1020", fontFamily: "Inter, sans-serif" },
          },
        ],
      },
    ],
  },
};

describe("INTENT_ROUTES — 레지스트리 완전성", () => {
  it("모든 operation에 라우트가 있다", () => {
    for (const op of ALL_OPERATIONS) {
      expect(INTENT_ROUTES[op]).toBeDefined();
    }
  });

  it("create는 빈 지시문(기본 경로)", () => {
    expect(
      INTENT_ROUTES.create.directive({
        operation: "create",
        target: "none",
        tonePolicy: "inherit",
      }),
    ).toBe("");
  });

  it("add: inherit→deck-tone, ignore→none", () => {
    expect(INTENT_ROUTES.add.toneNeed("inherit")).toBe("deck-tone");
    expect(INTENT_ROUTES.add.toneNeed("ignore")).toBe("none");
  });

  it("recolor 지시문은 색만 바꾸도록 명시", () => {
    const d = INTENT_ROUTES.recolor.directive({
      operation: "recolor",
      target: "deck",
      tonePolicy: "inherit",
    });
    expect(d).toContain("색상");
    expect(d).toContain("레이아웃");
    expect(INTENT_ROUTES.recolor.toneNeed("inherit")).toBe("current-palette");
  });

  it("edit 지시문은 referencePhrase를 반영", () => {
    const plan: IntentPlan = {
      operation: "edit",
      target: "referenced",
      tonePolicy: "inherit",
      referencePhrase: "그 제목",
    };
    expect(INTENT_ROUTES.edit.directive(plan)).toContain("그 제목");
  });
});

describe("extractToneProfile / deckToneLine", () => {
  it("빈 문서 → 빈 프로파일 + 빈 라인", () => {
    const p = extractToneProfile(EMPTY_DOC);
    expect(p.colors).toHaveLength(0);
    expect(deckToneLine(EMPTY_DOC)).toBe("");
  });

  it("색·폰트·형태를 추출", () => {
    const p = extractToneProfile(TONED_DOC);
    expect(p.colors).toContain("#0b1020");
    expect(p.colors).toContain("#e2e8f0");
    expect(p.fonts).toContain("Playfair Display");
    expect(p.hasRounded).toBe(true);
    expect(p.hasShadow).toBe(true);
  });

  it("deckToneLine은 주요 색과 폰트를 담는다", () => {
    const line = deckToneLine(TONED_DOC);
    expect(line).toContain("[덱 톤]");
    expect(line).toContain("#0b1020");
    expect(line).toContain("Playfair Display");
  });
});

describe("composeIntentTask — 통합", () => {
  it("create → 빈 블록(현재 동작 보존)", () => {
    expect(
      composeIntentTask({ operation: "create", target: "none", tonePolicy: "inherit" }, TONED_DOC),
    ).toBe("");
  });

  it("edit selected → [의도] 포함, 톤 컨텍스트 없음", () => {
    const block = composeIntentTask(
      { operation: "edit", target: "selected", tonePolicy: "inherit" },
      TONED_DOC,
    );
    expect(block).toContain("[의도]");
    expect(block).not.toContain("[덱 톤]");
  });

  it("add inherit → [의도] + [덱 톤]", () => {
    const block = composeIntentTask(
      { operation: "add", target: "none", tonePolicy: "inherit" },
      TONED_DOC,
    );
    expect(block).toContain("[의도]");
    expect(block).toContain("[덱 톤]");
  });

  it("add ignore → [의도]만, 덱 톤 미주입", () => {
    const block = composeIntentTask(
      { operation: "add", target: "none", tonePolicy: "ignore" },
      TONED_DOC,
    );
    expect(block).toContain("[의도]");
    expect(block).not.toContain("[덱 톤]");
  });

  it("recolor deck → [현재 팔레트] 포함", () => {
    const block = composeIntentTask(
      { operation: "recolor", target: "deck", tonePolicy: "inherit" },
      TONED_DOC,
    );
    expect(block).toContain("[현재 팔레트]");
  });
});
