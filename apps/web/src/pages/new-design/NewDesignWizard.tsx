// Phase 10b — new-design wizard creates a `Design` envelope (not a bare
// AgocraftDocument) and seeds it with one flavor-appropriate first item:
//   - mixed         → empty (user starts blank; Figma-style)
//   - slide-deck    → one slide already at FULL_FRAME
//   - canvas-board  → one empty canvas item at FULL_FRAME
//   - doc-page      → one block-doc at FULL_FRAME
//
// After saveDesign the wizard navigates to /design/:id.

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  FieldGroup,
  RadioTile,
  RadioTileGroup,
  TextField,
} from "@weave/design-system";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addChild, toAgocraftItem } from "../../document/agocraft-mirror.js";
import { createDefaultItem } from "../../document/seed.js";
import { createBlankDesign, saveDesign } from "../../document/storage.js";
import {
  DOC_FLAVORS,
  DOC_SIZE_PRESETS,
  type DocFlavor,
  type DomainKind,
  FLAVOR_REGISTRY,
} from "../../document/types.js";

const FLAVOR_ICONS: Readonly<Record<DocFlavor, ReactNode>> = {
  mixed: "✦",
  "slide-deck": "▭",
  "canvas-board": "◇",
  "doc-page": "≡",
};

const CUSTOM_PRESET_ID = "custom";

/** Default first child kind per flavor. `mixed` is intentionally empty — that
 *  flavor's Figma-style canvas opens blank for the user to drop anything.
 *
 *  WI-032 Phase 3 — every other flavor now seeds a `frame` (the canvas
 *  container of the frame-only paradigm). The flavor metadata still drives
 *  the wizard's recommended primitives + ThumbnailPanel iconography, but
 *  the underlying document model is uniform. */
const FIRST_CHILD_BY_FLAVOR: Readonly<Record<DocFlavor, DomainKind | undefined>> = {
  mixed: undefined,
  "slide-deck": "frame",
  "canvas-board": "frame",
  "doc-page": "frame",
};

function makeDesignId(): string {
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface NewDesignWizardProps {
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
}

export function NewDesignWizard({ open, onOpenChange }: NewDesignWizardProps) {
  const navigate = useNavigate();
  const [flavor, setFlavor] = useState<DocFlavor>("mixed");
  const [presetId, setPresetId] = useState<string>("16:9");
  const [title, setTitle] = useState("Untitled design");
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(720);

  const isCustom = presetId === CUSTOM_PRESET_ID;
  const preset = DOC_SIZE_PRESETS.find((p) => p.id === presetId);
  const width = isCustom ? customWidth : (preset?.width ?? 1920);
  const height = isCustom ? customHeight : (preset?.height ?? 1080);
  const titleTrimmed = title.trim();
  const isValid =
    titleTrimmed.length > 0 &&
    Number.isFinite(width) &&
    width >= 100 &&
    Number.isFinite(height) &&
    height >= 100;

  const createDesign = () => {
    if (!isValid) return;
    const id = makeDesignId();
    const blank = createBlankDesign({
      id,
      title: titleTrimmed,
      width,
      height,
      flavor,
    });
    // Flavor-aware first item seeding.
    const firstKind = FIRST_CHILD_BY_FLAVOR[flavor];
    let document = blank.document;
    if (firstKind !== undefined) {
      const now = new Date().toISOString();
      const weaveItem = createDefaultItem(firstKind, 0);
      const agoItem = toAgocraftItem(weaveItem, now);
      document = addChild(blank.document, agoItem);
    }
    saveDesign({ ...blank, document });
    onOpenChange(false);
    navigate(`/design/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Frosted-glass treatment: replace the panel tone's near-transparent
       *  `--surface-1` (6% alpha) with a moderate dark-slate base (~72% α)
       *  so the existing `backdrop-blur` reads as a true frosted sheet —
       *  the aurora behind still tints the surface, but body text stays
       *  legible. Theme-independent dark base; same idea DropdownMenu /
       *  Popover already use over varying surfaces. */}
      <DialogContent
        aria-describedby={undefined}
        className="bg-[rgba(15,23,42,0.72)] border-[color:var(--surface-overlay-border)]"
      >
        <DialogHeader
          headline="Start a new design"
          description="Pick a document flavor and size. You'll be able to add slides, canvases, blocks, media, and nested documents on the next screen."
        />

        <div className="grid gap-6">
          <FieldGroup legend="Title">
            <TextField
              label=""
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder="What are you designing?"
              autoFocus
              data-testid="new-design-title"
            />
          </FieldGroup>

          <FieldGroup legend="Document flavor" description="What lives at the top level?">
            <RadioTileGroup
              value={flavor}
              onValueChange={(v) => setFlavor(v as DocFlavor)}
              cols={4}
            >
              {DOC_FLAVORS.map((f) => {
                const meta = FLAVOR_REGISTRY[f];
                return (
                  <RadioTile
                    key={f}
                    value={f}
                    icon={FLAVOR_ICONS[f]}
                    title={meta.label}
                    tagline={meta.tagline}
                    data-testid={`new-design-flavor-${f}`}
                  />
                );
              })}
            </RadioTileGroup>
          </FieldGroup>

          <FieldGroup legend="Size">
            <RadioTileGroup value={presetId} onValueChange={setPresetId} cols={3}>
              {DOC_SIZE_PRESETS.map((p) => (
                <RadioTile
                  key={p.id}
                  value={p.id}
                  title={p.label}
                  tagline={`${p.width} × ${p.height} px`}
                  data-testid={`new-design-size-${p.id}`}
                />
              ))}
              <RadioTile
                value={CUSTOM_PRESET_ID}
                title="Custom"
                tagline="Set your own width / height"
                data-testid="new-design-size-custom"
              />
            </RadioTileGroup>
            {isCustom ? (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <TextField
                  label="Width (px)"
                  type="number"
                  min={100}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Number(e.currentTarget.value))}
                />
                <TextField
                  label="Height (px)"
                  type="number"
                  min={100}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Number(e.currentTarget.value))}
                />
              </div>
            ) : null}
          </FieldGroup>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={createDesign} disabled={!isValid} data-testid="new-design-create">
            Create design
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
