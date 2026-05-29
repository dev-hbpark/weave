import { forwardRef, type SVGAttributes } from "react";
import { cn } from "../cn.js";

interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "children"> {
  readonly size?: number | string;
}

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const SvgRoot = forwardRef<SVGSVGElement, IconProps & { children: React.ReactNode }>(
  function SvgRoot({ size = 18, className, children, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        {...baseProps}
        aria-hidden="true"
        className={cn("inline-block shrink-0", className)}
        {...rest}
      >
        {children}
      </svg>
    );
  },
);

export const IconUndo = forwardRef<SVGSVGElement, IconProps>(function IconUndo(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </SvgRoot>
  );
});

export const IconRedo = forwardRef<SVGSVGElement, IconProps>(function IconRedo(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </SvgRoot>
  );
});

export const IconCursor = forwardRef<SVGSVGElement, IconProps>(function IconCursor(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M5 3l4.5 16 2.5-6.5L18.5 10z" />
    </SvgRoot>
  );
});

export const IconHand = forwardRef<SVGSVGElement, IconProps>(function IconHand(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 1 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 1 1 3 0v8.25" />
      <path d="M9 11V8.5a1.5 1.5 0 0 0-3 0v6c0 4 3 6.5 6.5 6.5S18 18.5 18 14.75" />
    </SvgRoot>
  );
});

export const IconPlay = forwardRef<SVGSVGElement, IconProps>(function IconPlay(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M6 4l14 8-14 8z" fill="currentColor" />
    </SvgRoot>
  );
});

/** Three overlapping rectangles representing a Z-order layer stack. Used by
 *  the Peek (Z-order) tool to signal "inspect the local stack". */
export const IconLayers = forwardRef<SVGSVGElement, IconProps>(function IconLayers(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="4" y="13" width="13" height="7" rx="1.5" />
      <rect x="6" y="9" width="13" height="7" rx="1.5" fill="currentColor" fillOpacity="0.18" />
      <rect x="8" y="5" width="13" height="7" rx="1.5" fill="currentColor" fillOpacity="0.32" />
    </SvgRoot>
  );
});

/** Plus / add — used in toolbars to open the new-item menu. */
export const IconPlus = forwardRef<SVGSVGElement, IconProps>(function IconPlus(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M12 5v14M5 12h14" />
    </SvgRoot>
  );
});

export const IconChevronLeft = forwardRef<SVGSVGElement, IconProps>(
  function IconChevronLeft(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M15 5l-7 7 7 7" />
      </SvgRoot>
    );
  },
);

export const IconChevronRight = forwardRef<SVGSVGElement, IconProps>(
  function IconChevronRight(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M9 5l7 7-7 7" />
      </SvgRoot>
    );
  },
);

export const IconClose = forwardRef<SVGSVGElement, IconProps>(function IconClose(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </SvgRoot>
  );
});

export const IconChevronDown = forwardRef<SVGSVGElement, IconProps>(
  function IconChevronDown(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M5 9l7 7 7-7" />
      </SvgRoot>
    );
  },
);

export const IconCheck = forwardRef<SVGSVGElement, IconProps>(function IconCheck(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M5 12l5 5L20 7" />
    </SvgRoot>
  );
});

/** Four-point sparkle — decorative accent (e.g. a Hotspot label marker).
 *  Replaces the inline sparkle glyph (icons-only rule). */
export const IconSparkle = forwardRef<SVGSVGElement, IconProps>(function IconSparkle(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z" />
    </SvgRoot>
  );
});

/** Camera — the camera-target presentation behavior marker. */
export const IconCamera = forwardRef<SVGSVGElement, IconProps>(function IconCamera(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.2" />
    </SvgRoot>
  );
});

/** Diamond (rotated square) — the "canvas / board" doc-flavor marker. */
export const IconDiamond = forwardRef<SVGSVGElement, IconProps>(function IconDiamond(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M12 3l9 9-9 9-9-9z" />
    </SvgRoot>
  );
});

/** Document with text lines — the "doc / page" doc-flavor marker. */
export const IconDocLines = forwardRef<SVGSVGElement, IconProps>(function IconDocLines(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </SvgRoot>
  );
});

// DR-design-015 — ContextualToolbar Tier-2 icon set.

export const IconBold = forwardRef<SVGSVGElement, IconProps>(function IconBold(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </SvgRoot>
  );
});

export const IconItalic = forwardRef<SVGSVGElement, IconProps>(function IconItalic(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M14 5h5M5 19h5M14 5l-4 14" />
    </SvgRoot>
  );
});

export const IconUnderline = forwardRef<SVGSVGElement, IconProps>(
  function IconUnderline(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M6 4v8a6 6 0 0 0 12 0V4M5 20h14" />
      </SvgRoot>
    );
  },
);

export const IconText = forwardRef<SVGSVGElement, IconProps>(function IconText(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M4 6V4h16v2M12 4v16M9 20h6" />
    </SvgRoot>
  );
});

export const IconShape = forwardRef<SVGSVGElement, IconProps>(function IconShape(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
    </SvgRoot>
  );
});

// WI-044 — shape sub-kind glyphs for the QuickActionBar "+" add menu's
// second-depth flyout. One icon per `ShapeSubKind` the menu offers
// (rectangle / ellipse / line / arrow / triangle / star / polygon /
// heart / speech-bubble). These replace the inline emoji glyphs the
// add menu used previously (icons-only rule).

export const IconShapeRectangle = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeRectangle(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="3" y="6" width="18" height="12" rx="1.5" />
      </SvgRoot>
    );
  },
);

export const IconShapeEllipse = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeEllipse(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <ellipse cx="12" cy="12" rx="9" ry="7" />
      </SvgRoot>
    );
  },
);

export const IconShapeLine = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeLine(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M5 19L19 5" />
      </SvgRoot>
    );
  },
);

export const IconShapeArrow = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeArrow(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M4 12h14M13 6l6 6-6 6" />
      </SvgRoot>
    );
  },
);

export const IconShapeTriangle = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeTriangle(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M12 4l8 16H4z" />
      </SvgRoot>
    );
  },
);

export const IconShapeStar = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeStar(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M12 3.5l2.7 5.47 6.05.88-4.38 4.27 1.03 6.02L12 17.3l-5.42 2.84 1.04-6.02-4.38-4.27 6.05-.88z" />
      </SvgRoot>
    );
  },
);

export const IconShapePolygon = forwardRef<SVGSVGElement, IconProps>(
  function IconShapePolygon(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      </SvgRoot>
    );
  },
);

export const IconShapeHeart = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeHeart(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M12 20s-7-4.4-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5c0 5.1-7 9.5-7 9.5z" />
      </SvgRoot>
    );
  },
);

export const IconShapeSpeechBubble = forwardRef<SVGSVGElement, IconProps>(
  function IconShapeSpeechBubble(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      </SvgRoot>
    );
  },
);

export const IconImage = forwardRef<SVGSVGElement, IconProps>(function IconImage(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </SvgRoot>
  );
});

export const IconArrowUp = forwardRef<SVGSVGElement, IconProps>(function IconArrowUp(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </SvgRoot>
  );
});

export const IconVideo = forwardRef<SVGSVGElement, IconProps>(function IconVideo(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="3" y="6" width="14" height="12" rx="2" />
      <path d="M17 10l4-2v8l-4-2z" />
    </SvgRoot>
  );
});

export const IconFrame = forwardRef<SVGSVGElement, IconProps>(function IconFrame(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />
    </SvgRoot>
  );
});

// WI-050 / DR-design-022 — "delete frame, keep children". A dashed container
// (the frame being dissolved) with two solid children that remain — reads as
// "the box goes away, the contents stay".
export const IconUngroup = forwardRef<SVGSVGElement, IconProps>(function IconUngroup(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="2.5 2.5" />
      <rect x="6" y="6" width="6" height="6" rx="1" />
      <rect x="12" y="12" width="6" height="6" rx="1" />
    </SvgRoot>
  );
});

// WI-020 / WI-043 RISK-002 C2.4 — 3 layout-type icons for the
// ContextualToolbar SegmentedControl + Option+drag popup toggle. Each
// glyph evokes the paradigm visually:
//   IconLayoutAbsolute — frame with two free-floating child rects (no
//                         systematic alignment)
//   IconLayoutFlex     — frame with 3 equal-width children in a row
//   IconLayoutGrid     — frame with 2×2 cell tessellation

export const IconLayoutAbsolute = forwardRef<SVGSVGElement, IconProps>(
  function IconLayoutAbsolute(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect x="6" y="6" width="6" height="4" rx="0.5" />
        <rect x="14" y="13" width="5" height="5" rx="0.5" />
      </SvgRoot>
    );
  },
);

export const IconLayoutFlex = forwardRef<SVGSVGElement, IconProps>(
  function IconLayoutFlex(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect x="5" y="7" width="4" height="10" rx="0.5" />
        <rect x="10" y="7" width="4" height="10" rx="0.5" />
        <rect x="15" y="7" width="4" height="10" rx="0.5" />
      </SvgRoot>
    );
  },
);

export const IconLayoutGrid = forwardRef<SVGSVGElement, IconProps>(
  function IconLayoutGrid(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 12h18M12 3v18" />
      </SvgRoot>
    );
  },
);

export const IconRefresh = forwardRef<SVGSVGElement, IconProps>(function IconRefresh(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </SvgRoot>
  );
});

export const IconCopy = forwardRef<SVGSVGElement, IconProps>(function IconCopy(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </SvgRoot>
  );
});

export const IconPencil = forwardRef<SVGSVGElement, IconProps>(function IconPencil(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </SvgRoot>
  );
});

export const IconVolume = forwardRef<SVGSVGElement, IconProps>(function IconVolume(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </SvgRoot>
  );
});

export const IconMore = forwardRef<SVGSVGElement, IconProps>(function IconMore(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </SvgRoot>
  );
});

// DR-design-017 — manual cloud save trigger.
//
// IconCloudUpload (idle) shows a cloud silhouette with an upward arrow
// piercing the bottom-center, conveying "push local → server". Stroke
// only (no fill) keeps it in the same visual tier as IconUndo / IconRedo
// in the header chrome cluster. IconCloudCheck (success) drops the
// arrow for a checkmark inside the same cloud silhouette so a
// post-save flash maintains shape continuity (the cloud envelope stays
// put; only the inner glyph swaps) — no layout shift in the IconButton.
export const IconCloudUpload = forwardRef<SVGSVGElement, IconProps>(
  function IconCloudUpload(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M7 18a4 4 0 1 1 .8-7.92A6 6 0 0 1 19 11a4 4 0 0 1 0 8h-2" />
        <path d="M12 21v-9" />
        <path d="M9 15l3-3 3 3" />
      </SvgRoot>
    );
  },
);

export const IconCloudCheck = forwardRef<SVGSVGElement, IconProps>(
  function IconCloudCheck(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M7 18a4 4 0 1 1 .8-7.92A6 6 0 0 1 19 11a4 4 0 0 1 0 8H7z" />
        <path d="M9 14.5l2 2 4-4" />
      </SvgRoot>
    );
  },
);

/** Failure pair for IconCloudUpload — same cloud silhouette with a
 *  diagonal slash. Keeps the chrome cluster aligned during the
 *  idle → saving → saved/failed swap. */
export const IconCloudOff = forwardRef<SVGSVGElement, IconProps>(function IconCloudOff(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M7 18a4 4 0 1 1 .8-7.92A6 6 0 0 1 19 11a4 4 0 0 1 0 8H7z" />
      <path d="M4 4l16 16" />
    </SvgRoot>
  );
});

// ── alignment / distribution ────────────────────────────────────────
// Each icon depicts a guide line (the alignment edge / axis) plus two
// rectangles snapped to it. Distribute icons show three rectangles with
// the gap markers between them. Stroke style follows the rest of this
// file: 1.75 currentColor outlines + soft fills via fillOpacity for
// solid surfaces. All glyphs share the same 24×24 grid.

export const IconAlignLeft = forwardRef<SVGSVGElement, IconProps>(
  function IconAlignLeft(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M4 3v18" />
        <rect x="6" y="6" width="13" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="6" y="14" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
      </SvgRoot>
    );
  },
);

export const IconAlignHorizontalCenter = forwardRef<SVGSVGElement, IconProps>(
  function IconAlignHorizontalCenter(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M12 3v18" />
        <rect x="5" y="6" width="14" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="8" y="14" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
      </SvgRoot>
    );
  },
);

export const IconAlignRight = forwardRef<SVGSVGElement, IconProps>(
  function IconAlignRight(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M20 3v18" />
        <rect x="5" y="6" width="13" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="10" y="14" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
      </SvgRoot>
    );
  },
);

export const IconAlignTop = forwardRef<SVGSVGElement, IconProps>(function IconAlignTop(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M3 4h18" />
      <rect x="6" y="6" width="4" height="13" rx="1" fill="currentColor" fillOpacity="0.18" />
      <rect x="14" y="6" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
    </SvgRoot>
  );
});

export const IconAlignVerticalCenter = forwardRef<SVGSVGElement, IconProps>(
  function IconAlignVerticalCenter(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M3 12h18" />
        <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="14" y="8" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
      </SvgRoot>
    );
  },
);

export const IconAlignBottom = forwardRef<SVGSVGElement, IconProps>(
  function IconAlignBottom(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <path d="M3 20h18" />
        <rect x="6" y="5" width="4" height="13" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="14" y="10" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
      </SvgRoot>
    );
  },
);

export const IconDistributeHorizontal = forwardRef<SVGSVGElement, IconProps>(
  function IconDistributeHorizontal(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="3" y="8" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="10" y="8" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="17" y="8" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.18" />
        <path d="M7 19l1.5-1.5M14 19l1.5-1.5" opacity="0.55" />
      </SvgRoot>
    );
  },
);

export const IconDistributeVertical = forwardRef<SVGSVGElement, IconProps>(
  function IconDistributeVertical(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="8" y="3" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="8" y="10" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <rect x="8" y="17" width="8" height="4" rx="1" fill="currentColor" fillOpacity="0.18" />
        <path d="M19 7l-1.5 1.5M19 14l-1.5 1.5" opacity="0.55" />
      </SvgRoot>
    );
  },
);
