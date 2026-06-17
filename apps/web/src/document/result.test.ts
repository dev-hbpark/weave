// WI-249 / DR-165 — declarative typed-error channel: constructors + exhaustive match.

import { describe, expect, it } from "vitest";
import {
  invalid,
  matchError,
  notApplicable,
  notFound,
  otherError,
  type WeaveError,
  withTrace,
} from "./result.js";

describe("WeaveError + matchError", () => {
  it("constructors keep the legacy `code` string (back-compat) + a `_tag`", () => {
    expect(notFound("i1")).toMatchObject({
      _tag: "NotFound",
      code: "item-not-found",
      itemId: "i1",
    });
    expect(invalid("bad", "x")).toMatchObject({
      _tag: "Invalid",
      code: "invalid-input",
      field: "x",
    });
    expect(notApplicable("no", "text", "i2")).toMatchObject({
      _tag: "NotApplicable",
      code: "not-applicable",
      kind: "text",
    });
    expect(otherError("flip-not-supported", "no")).toMatchObject({
      _tag: "Other",
      code: "flip-not-supported",
    });
  });

  it("matchError dispatches on the tag (declarative, exhaustive)", () => {
    const render = (e: WeaveError) =>
      matchError(e, {
        NotFound: (x) => `404:${x.itemId}`,
        Invalid: (x) => `400:${x.field ?? "?"}`,
        NotApplicable: (x) => `409:${x.kind ?? "?"}`,
        Other: (x) => `?:${x.code}`,
      });
    expect(render(notFound("a"))).toBe("404:a");
    expect(render(invalid("m", "f"))).toBe("400:f");
    expect(render(notApplicable("m", "qr"))).toBe("409:qr");
    expect(render(otherError("x", "m"))).toBe("?:x");
  });

  it("withTrace prepends an op to the logical call-path", () => {
    const e1 = withTrace("crop.window.validate", invalid("bad"));
    const e2 = withTrace("weave.media.setCrop", e1);
    expect(e2.trace).toEqual(["weave.media.setCrop", "crop.window.validate"]);
  });
});
