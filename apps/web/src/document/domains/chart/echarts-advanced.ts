// WI-087 — advanced chart-type ECharts modules, loaded ON DEMAND.
//
// The renderer statically registers only the CORE series (bar/line/area/pie) so
// the common case loads a smaller echarts chunk. The remaining 10 families'
// modules live here and are pulled in via a dynamic `import("./echarts-advanced")`
// the first time one of them is rendered — the bundler emits this as a SEPARATE
// lazy chunk, so a design that only uses bar/line never downloads it.
//
// Importing this module registers the modules as a side effect (top-level
// `use([...])`); the renderer awaits the import before calling `setOption`.

import {
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from "echarts/charts";
import { VisualMapComponent } from "echarts/components";
import { use } from "echarts/core";

use([
  RadarChart,
  ScatterChart,
  HeatmapChart,
  FunnelChart,
  GaugeChart,
  CandlestickChart,
  BoxplotChart,
  TreemapChart,
  SankeyChart,
  VisualMapComponent,
]);
