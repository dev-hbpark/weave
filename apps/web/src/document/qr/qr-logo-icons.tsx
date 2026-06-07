// WI-140 — curated whitelist of design-system glyphs offered as QR centre
// logos. v1 is built-in icons only (no upload): the item stores just an
// `iconId` string, so there is no blob storage / shared-workspace security or
// quota surface (DR-095). One registry, consumed by BOTH the picker
// (`qr-section.tsx`) and the renderer (`QrBlock.tsx`) — no per-site icon switch
// (Rule 6).

import {
  IconCamera,
  IconChart,
  IconCheck,
  IconDiamond,
  IconImage,
  IconLink,
  IconPlay,
  IconShapeHeart,
  IconShapeStar,
  IconSparkle,
} from "@weave/design-system";
import type { ComponentProps, ComponentType } from "react";

/** Exactly the DS icon prop shape, derived from a real icon component so the
 *  whitelist stays assignable under `exactOptionalPropertyTypes` without
 *  importing the DS-private `IconProps` type. All DS icons share this shape
 *  (`size` + SVG attrs), so `IconLink` is a faithful sample. The picker passes
 *  `size`; the renderer passes `x`/`y`/`width`/`height`/`stroke`. */
export type QrLogoIconCmp = ComponentType<ComponentProps<typeof IconLink>>;

export interface QrLogoIconEntry {
  readonly id: string;
  readonly label: string;
  readonly Icon: QrLogoIconCmp;
}

export const QR_LOGO_ICONS: ReadonlyArray<QrLogoIconEntry> = [
  { id: "link", label: "링크", Icon: IconLink },
  { id: "heart", label: "하트", Icon: IconShapeHeart },
  { id: "star", label: "별", Icon: IconShapeStar },
  { id: "play", label: "재생", Icon: IconPlay },
  { id: "camera", label: "카메라", Icon: IconCamera },
  { id: "image", label: "이미지", Icon: IconImage },
  { id: "chart", label: "차트", Icon: IconChart },
  { id: "sparkle", label: "스파클", Icon: IconSparkle },
  { id: "check", label: "체크", Icon: IconCheck },
  { id: "diamond", label: "다이아", Icon: IconDiamond },
];

const BY_ID: ReadonlyMap<string, QrLogoIconEntry> = new Map(
  QR_LOGO_ICONS.map((e) => [e.id, e] as const),
);

/** Resolve a stored `iconId` to its registry entry, or `null` if unset / not in
 *  the whitelist (e.g. an id from a future build). */
export function qrLogoIcon(id: string | undefined | null): QrLogoIconEntry | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}
