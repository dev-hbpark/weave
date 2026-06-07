import {
  Button,
  ColorPicker,
  CommandIconButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconArrowUp,
  IconButton,
  IconChart,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconCursor,
  IconDocLines,
  IconFrame,
  IconHand,
  IconImage,
  IconLayers,
  IconLayoutGrid,
  IconMore,
  IconPencil,
  IconPlay,
  IconPlus,
  IconQr,
  IconRedo,
  IconShapeArrow,
  IconShapeEllipse,
  IconShapeHeart,
  IconShapeLine,
  IconShapePoly,
  IconShapePolygon,
  IconShapeRectangle,
  IconShapeSpeechBubble,
  IconShapeStar,
  IconShapeTriangle,
  IconText,
  IconUndo,
  IconVideo,
  Spinner,
  ThemePicker,
} from "@weave/design-system";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { TypographyPicker } from "../../../document/fonts/TypographyPicker.js";
import { gridSnap, useGridSnap } from "../../../document/selection-chrome/grid-snap.js";
import type { SaveStatus } from "../hooks/use-design-save.js";
import type { UseItemAdd } from "../hooks/use-item-add.js";
import { LINE_CURVE, LINE_CURVE_FREE, LINE_FREE, LINE_STRAIGHT } from "../line-seeds.js";

// DR-027 / WI-071 Phase 2 — header view extracted from DesignPageBody. Pure
// presentation: ISP-narrow props (data + intent callbacks), no editor/peek/vm
// objects. Mounted inside the orchestrator's provider tree so CommandIconButton
// (undo/redo) resolves the CommandHost context; self-portals to document.body
// for the root stacking context (see the className/portal note below).

// DR-design-017 — header manual-save lookup tables. Maps the 4-state SaveStatus
// union to its glyph + AITooltip context + action. One declarative row per
// state — adding a fifth is one row here + one branch in the save reducer, no
// inline switch (Rule 6).
const SAVE_GLYPH_BY_STATUS: Record<SaveStatus, React.ReactNode> = {
  idle: <IconCloudUpload />,
  saving: <Spinner size={18} />,
  saved: <IconCloudCheck />,
  failed: <IconCloudOff />,
};
const SAVE_TOOLTIP_CONTEXT: Record<SaveStatus, string> = {
  idle: "현재 디자인 저장",
  saving: "저장 중…",
  saved: "저장됨",
  failed: "저장 실패",
};
const SAVE_TOOLTIP_ACTION: Record<SaveStatus, string> = {
  idle: "서버로 즉시 저장",
  saving: "서버 응답 대기 중",
  saved: "서버에 저장됨",
  failed: "다시 시도하려면 클릭",
};
// DR-design-027 — per-state icon tint. idle/saving inherit the subtle button's
// neutral text; saved/failed use the shared semantic status tokens.
const SAVE_TINT_BY_STATUS: Record<SaveStatus, string> = {
  idle: "",
  saving: "",
  saved: "text-[color:var(--status-success)]",
  failed: "text-[color:var(--status-warn)]",
};

export interface DesignHeaderProps {
  readonly designTitle: string;
  readonly designId: string;
  readonly designBackground: string | undefined;
  /** Mixed/infinite-canvas flavor — gates the Select/Hand/Peek tool group. */
  readonly infiniteCanvas: boolean;
  readonly handMode: boolean;
  readonly peekActive: boolean;
  /** Select tool: clears hand mode + sticky peek. */
  readonly onSelectTool: () => void;
  /** Hand tool: sets hand mode + clears sticky peek. */
  readonly onHandTool: () => void;
  readonly onTogglePeek: () => void;
  readonly onOpenSlidePicker: () => void;
  readonly onAddMedia: (kind: "image" | "video") => void;
  readonly onAddItem: UseItemAdd["addNewItem"];
  readonly onSetBackground: (color: string) => void;
  readonly onSave: () => void;
  readonly saveStatus: SaveStatus;
  /** WI-089 — export the current selection to a `.json` file. Disabled
   *  when nothing is selected (`canExportSelection === false`). */
  readonly onExportSelection: () => void;
  readonly canExportSelection: boolean;
  /** WI-089 — open the file picker to import a selection file. */
  readonly onImport: () => void;
}

export function DesignHeader({
  designTitle,
  designId,
  designBackground,
  infiniteCanvas,
  handMode,
  peekActive,
  onSelectTool,
  onHandTool,
  onTogglePeek,
  onOpenSlidePicker,
  onAddMedia,
  onAddItem,
  onSetBackground,
  onSave,
  saveStatus,
  onExportSelection,
  canExportSelection,
  onImport,
}: DesignHeaderProps): React.ReactNode {
  // WI-073 — grid-snap toggle state (global store; no prop threading needed).
  const grid = useGridSnap();
  if (typeof document === "undefined") return null;
  return createPortal(
    <header
      // WI-039 — opaque self-background. `--surface-1` is a translucent glass
      // token; stacking it as a flat gradient over an opaque `--bg-page` base
      // reproduces the original perceived color with no parent bg dependency.
      //
      // Portal'd to document.body so its z-index participates in the root
      // stacking context alongside the SelectionLayer / MarqueeSelection /
      // RubberBand portal layers (z 35-45). Without the portal, the outer
      // `fixed inset-0` wrapper traps any z-index inside.
      className="fixed inset-x-0 top-0 z-[46] grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-3 md:px-4 h-12 border-b border-[color:var(--surface-1-border)]"
      style={{
        background: "linear-gradient(var(--surface-1), var(--surface-1)), var(--bg-page)",
      }}
      data-testid="design-header"
      role="toolbar"
      aria-label="Edit tools"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Link
          to="/"
          className="flex items-center gap-2 no-underline shrink-0 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label="Home"
        >
          <span
            aria-hidden
            className="inline-block w-5 h-5 rounded-[var(--radius-sm)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)]"
          />
          <span className="text-[13px] font-semibold tracking-tight text-[color:var(--text-strong)]">
            weave
          </span>
        </Link>
        <span aria-hidden className="text-[12px] text-[color:var(--text-muted)] px-1">
          /
        </span>
        {/* WI-033 P2 — Breadcrumb removed; the header only shows the design title. */}
        <nav
          className="flex items-center gap-1 text-[12px] text-[color:var(--text-muted)] min-w-0"
          aria-label="Breadcrumb"
        >
          <span className="text-[color:var(--text-strong)] truncate max-w-[280px]">
            {designTitle}
          </span>
        </nav>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Edit tools">
        {infiniteCanvas ? (
          <>
            {/* Select / Hand / Peek — mutually-exclusive toggle group. Peek's
                hold-mode (L key) remains orthogonal. */}
            <IconButton
              aria-label="Select tool"
              aria-pressed={!handMode && !peekActive}
              size="sm"
              onClick={onSelectTool}
              data-testid="toolbar-select"
              data-active={!handMode && !peekActive ? "true" : undefined}
              data-tip="선택 도구"
              data-tip-kbd="V"
              className={
                !handMode && !peekActive
                  ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                  : undefined
              }
            >
              <IconCursor />
            </IconButton>
            <IconButton
              aria-label="Hand tool"
              aria-pressed={handMode && !peekActive}
              size="sm"
              onClick={onHandTool}
              data-testid="toolbar-hand"
              data-active={handMode && !peekActive ? "true" : undefined}
              data-tip="이동 도구"
              data-tip-kbd="H / Space"
              className={
                handMode && !peekActive
                  ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                  : undefined
              }
            >
              <IconHand />
            </IconButton>
            <IconButton
              aria-label="Peek z-order"
              aria-pressed={peekActive}
              size="sm"
              onClick={onTogglePeek}
              data-testid="toolbar-peek"
              data-active={peekActive ? "true" : undefined}
              data-tip="Z-순서 보기"
              data-tip-kbd="L"
              className={
                peekActive
                  ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                  : undefined
              }
            >
              <IconLayers />
            </IconButton>
            {/* WI-073 — toggle snap-to-grid while dragging frames/items. */}
            <IconButton
              aria-label="Snap to grid"
              aria-pressed={grid.enabled}
              size="sm"
              onClick={() => gridSnap.toggle()}
              data-testid="toolbar-grid-snap"
              data-active={grid.enabled ? "true" : undefined}
              data-tip="그리드 스냅"
              className={
                grid.enabled
                  ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                  : undefined
              }
            >
              <IconLayoutGrid />
            </IconButton>
            <span
              aria-hidden
              className="inline-block w-px h-4 bg-[color:var(--surface-1-border)] mx-1.5"
            />
          </>
        ) : null}
        {/* WI-020 — Add menu: image / video / 9 shape sub-kinds */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="Add new item"
              size="sm"
              data-testid="toolbar-add"
              data-tip="추가"
              data-tip-kbd="이미지 · 비디오 · 도형"
            >
              <IconPlus />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6}>
            <DropdownMenuLabel>슬라이드</DropdownMenuLabel>
            <DropdownMenuItem
              icon={<IconFrame size={16} />}
              onSelect={onOpenSlidePicker}
              data-testid="add-slide"
            >
              슬라이드…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>미디어</DropdownMenuLabel>
            <DropdownMenuItem
              icon={<IconImage size={16} />}
              onSelect={() => onAddMedia("image")}
              data-testid="add-image"
            >
              이미지
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconVideo size={16} />}
              onSelect={() => onAddMedia("video")}
              data-testid="add-video"
            >
              비디오
            </DropdownMenuItem>
            {/* WI-139 — embed (YouTube): add empty, then paste the URL in the
                toolbar (no file picker, unlike video). */}
            <DropdownMenuItem
              icon={<IconPlay size={16} />}
              onSelect={() => onAddItem("embed")}
              data-testid="add-embed"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-weave-add-kind", "embed");
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              임베드 (YouTube)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>텍스트</DropdownMenuLabel>
            <DropdownMenuItem
              icon={<IconText size={16} />}
              onSelect={() => onAddItem("text")}
              data-testid="add-text"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-weave-add-kind", "text");
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              텍스트
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                icon={<IconShapeRectangle size={16} />}
                data-testid="add-shape"
              >
                도형
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  icon={<IconShapeRectangle size={16} />}
                  onSelect={() => onAddItem("shape", "rectangle")}
                  data-testid="add-shape-rectangle"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-weave-add-kind", "shape");
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  사각형
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeEllipse size={16} />}
                  onSelect={() => onAddItem("shape", "ellipse")}
                  data-testid="add-shape-ellipse"
                >
                  원
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeArrow size={16} />}
                  onSelect={() => onAddItem("shape", "arrow")}
                  data-testid="add-shape-arrow"
                >
                  화살표
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeTriangle size={16} />}
                  onSelect={() => onAddItem("shape", "triangle")}
                  data-testid="add-shape-triangle"
                >
                  삼각형
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeStar size={16} />}
                  onSelect={() => onAddItem("shape", "star")}
                  data-testid="add-shape-star"
                >
                  별
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapePolygon size={16} />}
                  onSelect={() => onAddItem("shape", "polygon")}
                  data-testid="add-shape-polygon"
                >
                  다각형
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapePoly size={16} />}
                  onSelect={() => onAddItem("shape", "poly")}
                  data-testid="add-shape-poly"
                >
                  자유 다각형
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeHeart size={16} />}
                  onSelect={() => onAddItem("shape", "heart")}
                  data-testid="add-shape-heart"
                >
                  하트
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeSpeechBubble size={16} />}
                  onSelect={() => onAddItem("shape", "speech-bubble")}
                  data-testid="add-shape-speech-bubble"
                >
                  말풍선
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={<IconShapeLine size={16} />} data-testid="add-line">
                선
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  icon={<IconShapeLine size={16} />}
                  onSelect={() => onAddItem("line", undefined, undefined, undefined, LINE_STRAIGHT)}
                  data-testid="add-line-straight"
                >
                  직선
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconPencil size={16} />}
                  onSelect={() => onAddItem("line", undefined, undefined, undefined, LINE_FREE)}
                  data-testid="add-line-free"
                >
                  자유선
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconShapeLine size={16} />}
                  onSelect={() => onAddItem("line", undefined, undefined, undefined, LINE_CURVE)}
                  data-testid="add-line-curve"
                >
                  곡선
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<IconPencil size={16} />}
                  onSelect={() =>
                    onAddItem("line", undefined, undefined, undefined, LINE_CURVE_FREE)
                  }
                  data-testid="add-line-curve-free"
                >
                  자유곡선
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>코드</DropdownMenuLabel>
            <DropdownMenuItem
              icon={<IconQr size={16} />}
              onSelect={() => onAddItem("qr")}
              data-testid="add-qr"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-weave-add-kind", "qr");
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              QR 코드
            </DropdownMenuItem>
            <DropdownMenuLabel>데이터</DropdownMenuLabel>
            <DropdownMenuItem
              icon={<IconChart size={16} />}
              onSelect={() => onAddItem("chart")}
              data-testid="add-chart"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-weave-add-kind", "chart");
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              차트
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          aria-hidden
          className="inline-block w-px h-4 bg-[color:var(--surface-1-border)] mx-1.5"
        />
        <CommandIconButton commandId="history.undo" size="sm">
          <IconUndo />
        </CommandIconButton>
        <CommandIconButton commandId="history.redo" size="sm">
          <IconRedo />
        </CommandIconButton>
      </div>

      <div className="flex items-center justify-end gap-2">
        {/* WI-089 — File menu: export the current selection / import a
            selection file. Lives in the right (file-level) group next to
            Save/Present since both are document-scoped actions. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="File menu"
              size="sm"
              data-testid="toolbar-file-menu"
              data-tip="파일"
              data-tip-kbd="내보내기 · 가져오기"
            >
              <IconMore />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuLabel>파일</DropdownMenuLabel>
            <DropdownMenuItem
              icon={<IconArrowUp size={16} />}
              onSelect={onExportSelection}
              disabled={!canExportSelection}
              data-testid="file-export-selection"
            >
              선택 영역 내보내기
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconDocLines size={16} />}
              onSelect={onImport}
              data-testid="file-import"
            >
              가져오기…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Design 배경색 — file-level 속성이라 selection 과 무관한 영구 chrome.
            `onSetBackground` routes through weave.design.setBackground so Cmd+Z
            works. ColorPicker doesn't forward data-testid to its trigger, so a
            span wrapper exposes the e2e hook (inline-flex, no layout impact). */}
        <span data-testid="header-design-background" className="inline-flex">
          <ColorPicker
            value={designBackground ?? "#ffffff"}
            onValueCommit={(v) => onSetBackground(v)}
            onValueChange={() => {
              /* commit-only */
            }}
            aria-label="Design background"
          />
        </span>
        <ThemePicker />
        {/* WI-136 — per-theme typography manager (sits beside the color theme
            picker so "테마 관리" covers fonts as well as colors). */}
        <TypographyPicker />
        {/* DR-design-017 — manual cloud save trigger. Forces an immediate
            persist; the glyph flashes for 1.5s as an acknowledgement.
            DR-design-027 — `subtle` circular chip + status-token tint. */}
        <IconButton
          aria-label="Save design to server"
          variant="subtle"
          size="md"
          onClick={onSave}
          disabled={saveStatus === "saving"}
          data-testid="toolbar-save"
          data-state={saveStatus}
          data-tip={SAVE_TOOLTIP_CONTEXT[saveStatus]}
          data-tip-kbd={SAVE_TOOLTIP_ACTION[saveStatus]}
          className={`rounded-[var(--radius-pill)] ${SAVE_TINT_BY_STATUS[saveStatus]}`}
        >
          {SAVE_GLYPH_BY_STATUS[saveStatus]}
        </IconButton>
        <Button size="md" leadingIcon={<IconPlay size={16} />} asChild>
          <Link
            to={`/design/${designId}/present`}
            data-testid="toolbar-present"
            data-tip="프레젠테이션"
            data-tip-kbd="풀스크린"
          >
            Present
          </Link>
        </Button>
      </div>
    </header>,
    document.body,
  );
}
