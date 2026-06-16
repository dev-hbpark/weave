// WI-239 Phase 1 — single-source ink-mode controller.
//
// All present-ink UI state (engaged? which tool? color/width? blank board
// open?) lives here so there is ONE source of truth for "is ink capturing
// input" (DR-154 §R3). Pointer interception keys off `enabled`; when it is
// false the overlay is `pointer-events: none` and present nav is untouched.

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_INK_TOOL_ID, inkTool, isDrawTool } from "./ink-tools.js";
import type { InkStrokeStyle } from "./types.js";

/** Preset pen colors (Design System Triage: a lightweight swatch row rather
 *  than the full ColorPicker popover — pen color is a quick pick, not a
 *  gradient editor). High-contrast hues readable on light or dark slides. */
export const INK_COLORS: readonly string[] = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#111827", // near-black
  "#ffffff", // white
];

/** Stroke width presets (design/viewport px). */
export const INK_WIDTHS: readonly number[] = [3, 6, 12];

export interface InkController {
  readonly enabled: boolean;
  readonly toolId: string;
  readonly color: string;
  readonly width: number;
  readonly boardOpen: boolean;
  /** Effective style for the active tool — toolbar color/width merged with
   *  the tool's own opacity/blend defaults. */
  readonly style: InkStrokeStyle;
  setEnabled(on: boolean): void;
  toggleEnabled(): void;
  setToolId(id: string): void;
  setColor(c: string): void;
  setWidth(w: number): void;
  setBoardOpen(on: boolean): void;
  toggleBoard(): void;
}

export function useInkMode(): InkController {
  const [enabled, setEnabled] = useState(false);
  const [toolId, setToolId] = useState(DEFAULT_INK_TOOL_ID);
  const [color, setColor] = useState(INK_COLORS[0] ?? "#ef4444");
  const [width, setWidth] = useState(INK_WIDTHS[1] ?? 6);
  const [boardOpen, setBoardOpen] = useState(false);

  const style = useMemo<InkStrokeStyle>(() => {
    const tool = inkTool(toolId);
    // Draw tools take the user's color/width; opacity + blend are the tool's
    // signature (pen = opaque, highlighter = translucent multiply). The
    // eraser's style is irrelevant to rendering but kept consistent.
    return {
      color,
      width: isDrawTool(toolId) ? width : tool.defaultStyle.width,
      opacity: tool.defaultStyle.opacity,
      blend: tool.defaultStyle.blend,
    };
  }, [toolId, color, width]);

  const toggleEnabled = useCallback(() => setEnabled((v) => !v), []);
  const toggleBoard = useCallback(() => setBoardOpen((v) => !v), []);

  return useMemo(
    () => ({
      enabled,
      toolId,
      color,
      width,
      boardOpen,
      style,
      setEnabled,
      toggleEnabled,
      setToolId,
      setColor,
      setWidth,
      setBoardOpen,
      toggleBoard,
    }),
    [enabled, toolId, color, width, boardOpen, style, toggleEnabled, toggleBoard],
  );
}
