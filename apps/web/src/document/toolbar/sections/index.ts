// Bootstrap: register every kind → section mapping. Adding a new kind =
// create `<new-kind>-section.tsx` + one new `register` line below + nothing
// else. ContextualToolbar.tsx is NOT edited.

import { createToolbarSectionRegistry } from "./types.js";
import { FrameBackgroundSection } from "./frame-background-section.js";
import { ImageSection } from "./image-section.js";
import { ShapeSection } from "./shape-section.js";
import { TextSection } from "./text-section.js";
import { VideoSection } from "./video-section.js";

export const toolbarSectionRegistry = createToolbarSectionRegistry();

toolbarSectionRegistry.register("image", { Component: ImageSection });
toolbarSectionRegistry.register("video", { Component: VideoSection });
toolbarSectionRegistry.register("shape", { Component: ShapeSection });
toolbarSectionRegistry.register("text", { Component: TextSection });
toolbarSectionRegistry.register("slide", { Component: FrameBackgroundSection });
toolbarSectionRegistry.register("canvas-design", { Component: FrameBackgroundSection });
toolbarSectionRegistry.register("block-doc", { Component: FrameBackgroundSection });
toolbarSectionRegistry.register("media", { Component: FrameBackgroundSection });

export type { ToolbarSection, ToolbarSectionProps, ToolbarSectionRegistry } from "./types.js";
