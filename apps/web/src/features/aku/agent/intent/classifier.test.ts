import { describe, expect, it } from "vitest";
import { classifyIntent, intentFromOperation, withOperation } from "./classifier.js";
import { ALL_OPERATIONS } from "./types.js";

const NO_SEL = { hasSelection: false } as const;
const SEL = { hasSelection: true } as const;

describe("classifyIntent — operation 단서", () => {
  it("삭제 동사 → delete", () => {
    expect(classifyIntent("이 도형 삭제해줘", SEL).operation).toBe("delete");
    expect(classifyIntent("그 제목 지워줘", NO_SEL).operation).toBe("delete");
  });

  it("교체 동사 → replace", () => {
    expect(classifyIntent("이걸 차트로 교체해줘", SEL).operation).toBe("replace");
    expect(classifyIntent("이미지를 다른 걸로 바꿔치기", SEL).operation).toBe("replace");
  });

  it("색상 단서 → recolor (선택 없으면 deck)", () => {
    const p = classifyIntent("팔레트를 따뜻한 색으로 바꿔줘", NO_SEL);
    expect(p.operation).toBe("recolor");
    expect(p.target).toBe("deck");
  });

  it("톤 맞춤 단서 → retone + match", () => {
    const p = classifyIntent("이 슬라이드를 덱 톤에 맞춰줘", SEL);
    expect(p.operation).toBe("retone");
    expect(p.tonePolicy).toBe("match");
  });

  it("추가 동사 → add, target none", () => {
    const p = classifyIntent("표지 슬라이드 추가해줘", NO_SEL);
    expect(p.operation).toBe("add");
    expect(p.target).toBe("none");
  });

  it("추가 + 톤 무시 → ignore", () => {
    expect(classifyIntent("기존 디자인 무시하고 슬라이드 추가", NO_SEL).tonePolicy).toBe("ignore");
  });

  it("추가 + 톤 유지 → inherit", () => {
    expect(classifyIntent("같은 톤으로 슬라이드 한 장 더 추가", NO_SEL).tonePolicy).toBe("inherit");
  });

  it("매치 없음 → edit 폴백 (선택 있으면 selected)", () => {
    const p = classifyIntent("폰트를 키워줘", SEL);
    expect(p.operation).toBe("edit");
    expect(p.target).toBe("selected");
  });

  it("선택 없이 아이템 지칭 → referenced + phrase", () => {
    const p = classifyIntent("그 제목 더 크게", NO_SEL);
    expect(p.operation).toBe("edit");
    expect(p.target).toBe("referenced");
    expect(p.referencePhrase).toContain("제목");
  });
});

describe("intentFromOperation — 명시 op", () => {
  it("add는 target none", () => {
    expect(intentFromOperation("add", "뭐든", NO_SEL).target).toBe("none");
  });
  it("recolor는 선택 없으면 deck", () => {
    expect(intentFromOperation("recolor", "색 바꿔", NO_SEL).target).toBe("deck");
  });
  it("edit는 선택 있으면 selected", () => {
    expect(intentFromOperation("edit", "수정", SEL).target).toBe("selected");
  });
  it("retone은 항상 match", () => {
    expect(intentFromOperation("retone", "맞춰", SEL).tonePolicy).toBe("match");
  });
});

describe("withOperation — 칩 교정 시 target/tone 보정", () => {
  it("edit→recolor: target none→deck", () => {
    const base = intentFromOperation("create", "x", NO_SEL); // target none
    expect(withOperation(base, "recolor").target).toBe("deck");
  });
  it("→retone이면 tonePolicy match", () => {
    const base = intentFromOperation("edit", "x", SEL);
    expect(withOperation(base, "retone").tonePolicy).toBe("match");
  });
  it("referencePhrase는 유지", () => {
    const base = classifyIntent("그 차트 수정", NO_SEL);
    expect(withOperation(base, "delete").referencePhrase).toBe(base.referencePhrase);
  });
  it("모든 operation에 대해 유효한 plan 산출", () => {
    const base = intentFromOperation("edit", "x", SEL);
    for (const op of ALL_OPERATIONS) {
      const p = withOperation(base, op);
      expect(p.operation).toBe(op);
      expect(p.target).toBeDefined();
    }
  });
});
