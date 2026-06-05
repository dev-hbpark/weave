// @vitest-environment node
//
// C1 regression — pure range-format commit. A text-only change guard in
// `OnChangePlugin` previously dropped any edit that left the plain text
// identical but mutated per-run formatting (select a word + Cmd+B). The
// formatting was then lost on edit exit because `onChange` never fired.
//
// The fix routes the guard through `snapshotSignature`, which folds in BOTH
// the text AND the textRuns. These tests drive the REAL projection
// (`readSnapshot` → `snapshotSignature`) against a headless Lexical editor:
//   1. Same text, range bolded → signature MUST change (so onChange commits).
//   2. No-op re-read → signature stable (no redundant commit).
//
// Driving the node tree directly (`toggleFormat`) instead of synthetic
// keyboard events sidesteps the Playwright `beforeinput` gotcha that keeps
// the e2e Cmd+B specs at `test.fixme` — this exercises the same internal
// TextNode.format bitmask the FORMAT_TEXT_COMMAND mutates.

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  createEditor,
} from "lexical";
import { expect, test } from "vitest";
import { readSnapshot, snapshotSignature } from "./LexicalTextEditor.js";

function makeEditor() {
  // Headless editor — no root element attached. State mutations + reads run
  // without DOM reconciliation, which is all `readSnapshot` needs.
  const editor = createEditor({
    namespace: "test",
    onError: (e) => {
      throw e;
    },
  });
  editor.update(
    () => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode("hello world"));
      root.append(paragraph);
    },
    { discrete: true },
  );
  return editor;
}

function snapshotOf(editor: ReturnType<typeof createEditor>) {
  return editor.getEditorState().read(() => readSnapshot());
}

test("range-format change keeps text but changes the commit signature", () => {
  const editor = makeEditor();

  const before = snapshotOf(editor);
  expect(before.text).toBe("hello world");
  const sigBefore = snapshotSignature(before);

  // Bold the single text run (the same `TextNode.format` bit Cmd+B flips).
  editor.update(
    () => {
      $getRoot()
        .getChildren()
        .forEach((p) => {
          if (!$isParagraphNode(p)) return;
          p.getChildren().forEach((n) => {
            if ($isTextNode(n)) n.toggleFormat("bold");
          });
        });
    },
    { discrete: true },
  );

  const after = snapshotOf(editor);

  // Plain text is unchanged — the old text-only guard would have dropped this.
  expect(after.text).toBe(before.text);
  // The run now carries bold, and the signature MUST differ so onChange fires.
  expect(after.textRuns.some((r) => r.attributes?.fontWeight === "bold")).toBe(true);
  expect(snapshotSignature(after)).not.toBe(sigBefore);
});

test("re-reading an unchanged state yields a stable signature (no redundant commit)", () => {
  const editor = makeEditor();
  const a = snapshotSignature(snapshotOf(editor));
  const b = snapshotSignature(snapshotOf(editor));
  expect(b).toBe(a);
});

test("signature folds in text changes too (still commits on plain typing)", () => {
  const editor = makeEditor();
  const sig0 = snapshotSignature(snapshotOf(editor));

  editor.update(
    () => {
      $getRoot()
        .getChildren()
        .forEach((p) => {
          if (!$isParagraphNode(p)) return;
          p.getChildren().forEach((n) => {
            if ($isTextNode(n)) n.setTextContent("hello world!");
          });
        });
    },
    { discrete: true },
  );

  const after = snapshotOf(editor);
  expect(after.text).toBe("hello world!");
  expect(snapshotSignature(after)).not.toBe(sig0);
});

// DR-060 — per-range outline is authored as a `-webkit-text-stroke-*` style on
// the selected TextNodes; readSnapshot must extract it into the run attributes.
test("readSnapshot extracts a node's -webkit-text-stroke style into the run outline", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot()
        .getChildren()
        .forEach((p) => {
          if (!$isParagraphNode(p)) return;
          p.getChildren().forEach((n) => {
            if ($isTextNode(n)) {
              // The exact style $patchStyleText writes (color + width + paint-order).
              n.setStyle(
                "-webkit-text-stroke-color: #ff0000; -webkit-text-stroke-width: 3px; paint-order: stroke",
              );
            }
          });
        });
    },
    { discrete: true },
  );

  const snap = snapshotOf(editor);
  const run = snap.textRuns[0] as { attributes?: { outlineColor?: string; outlineWidth?: number } };
  expect(run.attributes?.outlineColor).toBe("#ff0000");
  expect(run.attributes?.outlineWidth).toBe(3);
});

test("a node with only a stroke COLOR (no width) yields no outline (needs both)", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot()
        .getChildren()
        .forEach((p) => {
          if (!$isParagraphNode(p)) return;
          p.getChildren().forEach((n) => {
            if ($isTextNode(n)) n.setStyle("-webkit-text-stroke-color: #ff0000");
          });
        });
    },
    { discrete: true },
  );

  const snap = snapshotOf(editor);
  const run = snap.textRuns[0] as { attributes?: { outlineColor?: string; outlineWidth?: number } };
  expect(run.attributes?.outlineColor).toBeUndefined();
  expect(run.attributes?.outlineWidth).toBeUndefined();
});

// DR-062 — per-range typography. The CSS-declaration props (color / size /
// family / spacing / case) are authored as inline node styles and read back by
// `readSnapshot` through the shared registry. This is the round-trip the seed +
// readback rely on for edit re-entry.
test("readSnapshot extracts color / size / family / spacing / case from node style", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot()
        .getChildren()
        .forEach((p) => {
          if (!$isParagraphNode(p)) return;
          p.getChildren().forEach((n) => {
            if ($isTextNode(n)) {
              n.setStyle(
                "color: #ff0000; font-size: 32px; font-family: Georgia; letter-spacing: 2px; text-transform: uppercase",
              );
            }
          });
        });
    },
    { discrete: true },
  );

  const snap = snapshotOf(editor);
  const attrs = snap.textRuns[0]?.attributes as
    | {
        color?: string;
        fontSize?: number;
        fontFamily?: string;
        letterSpacing?: number;
        textCase?: string;
      }
    | undefined;
  expect(attrs?.color).toBe("#ff0000");
  expect(attrs?.fontSize).toBe(32);
  expect(attrs?.fontFamily).toBe("Georgia");
  expect(attrs?.letterSpacing).toBe(2);
  expect(attrs?.textCase).toBe("UPPER");
});
