// WI-079 / DR-036 — generalized chart model: encoding migration + accessors.

import { describe, expect, it } from "vitest";
import {
  type ChartEncoding,
  categoryField,
  channelFields,
  migrateEncoding,
  seriesField,
  setChannel,
  setValueAggregate,
  valueAggregate,
  valueFields,
} from "./chart-model.js";

describe("migrateEncoding", () => {
  it("legacy {category, values} → channel map", () => {
    const legacy = { category: "월", values: ["매출", "비용"] };
    expect(migrateEncoding(legacy)).toEqual({
      category: { field: "월" },
      value: [{ field: "매출" }, { field: "비용" }],
    });
  });

  it("drops empty legacy fields", () => {
    expect(migrateEncoding({ category: "", values: [] })).toEqual({});
    expect(migrateEncoding({ category: "", values: ["x"] })).toEqual({ value: [{ field: "x" }] });
  });

  it("undefined → empty encoding", () => {
    expect(migrateEncoding(undefined)).toEqual({});
  });

  it("already-channel encoding is returned unchanged (same ref)", () => {
    const enc: ChartEncoding = {
      x: { field: "키" },
      y: { field: "몸무게" },
      size: { field: "나이" },
    };
    expect(migrateEncoding(enc)).toBe(enc);
  });
});

describe("channel accessors", () => {
  it("categoryField / valueFields / seriesField read channels", () => {
    const enc: ChartEncoding = {
      category: { field: "월" },
      value: [{ field: "매출" }, { field: "비용" }],
      series: { field: "지역" },
    };
    expect(categoryField(enc)).toBe("월");
    expect(valueFields(enc)).toEqual(["매출", "비용"]);
    expect(seriesField(enc)).toBe("지역");
  });

  it("valueFields normalizes a single value channel to a 1-element array", () => {
    expect(valueFields({ value: { field: "v" } })).toEqual(["v"]);
    expect(valueFields({})).toEqual([]);
  });

  it("setValueAggregate sets/clears the aggregate on all value fields", () => {
    const enc: ChartEncoding = { category: { field: "c" }, value: [{ field: "v" }] };
    const summed = setValueAggregate(enc, "sum");
    expect(summed.value).toEqual([{ field: "v", aggregate: "sum" }]);
    expect(valueAggregate(summed)).toBe("sum");
    const cleared = setValueAggregate(summed, undefined);
    expect(cleared.value).toEqual([{ field: "v" }]);
    expect(valueAggregate(cleared)).toBeUndefined();
    // no value channel → no-op
    expect(setValueAggregate({ x: { field: "a" } }, "sum")).toEqual({ x: { field: "a" } });
  });
});

describe("channelFields / setChannel (spec-driven editor)", () => {
  it("channelFields reads any channel (single → 1, value → many)", () => {
    const enc: ChartEncoding = {
      category: { field: "월" },
      value: [{ field: "매출" }, { field: "비용" }],
    };
    expect(channelFields(enc, "category")).toEqual(["월"]);
    expect(channelFields(enc, "value")).toEqual(["매출", "비용"]);
    expect(channelFields(enc, "size")).toEqual([]);
  });

  it("setChannel binds multi (array) / single (FieldRef) / clears on empty", () => {
    let enc: ChartEncoding = {};
    enc = setChannel(enc, "category", ["월"], false);
    expect(enc.category).toEqual({ field: "월" });
    enc = setChannel(enc, "value", ["매출", "비용"], true);
    expect(enc.value).toEqual([{ field: "매출" }, { field: "비용" }]);
    // toggling a third value column on (multi)
    enc = setChannel(enc, "value", ["매출", "비용", "이익"], true);
    expect(valueFields(enc)).toEqual(["매출", "비용", "이익"]);
    // clearing a channel omits the key (no explicit undefined)
    enc = setChannel(enc, "value", [], true);
    expect("value" in enc).toBe(false);
    expect(enc.category).toEqual({ field: "월" }); // others untouched
  });
});
