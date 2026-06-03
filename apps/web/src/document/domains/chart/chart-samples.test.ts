// WI-086 — per-type sample data integrity.

import { describe, expect, it } from "vitest";
import type { ChartEncoding } from "./chart-model.js";
import { chartSample } from "./chart-samples.js";
import { availableChartTypes, requiredChannelsSatisfied } from "./chart-types.js";

/** Every column name referenced by an encoding. */
function fieldsOf(enc: ChartEncoding): ReadonlyArray<string> {
  const out: string[] = [];
  for (const v of Object.values(enc)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) out.push(...v.map((r) => r.field));
    else out.push((v as { field: string }).field);
  }
  return out;
}

describe("chart samples", () => {
  it("EVERY registered chart type has a sample whose encoding is valid", () => {
    for (const spec of availableChartTypes()) {
      const sample = chartSample(spec.type);
      expect(sample, `sample for ${spec.type}`).toBeDefined();
      if (sample === undefined) continue;
      // the sample's encoding satisfies the type's required channels
      expect(requiredChannelsSatisfied(spec.type, sample.encoding), spec.type).toBe(true);
      // every encoded field references a real column in the sample dataset
      const cols = new Set(sample.dataset.columns.map((c) => c.name));
      for (const field of fieldsOf(sample.encoding)) {
        expect(cols.has(field), `${spec.type} → ${field}`).toBe(true);
      }
      expect(sample.dataset.rows.length, spec.type).toBeGreaterThan(0);
    }
  });
});
