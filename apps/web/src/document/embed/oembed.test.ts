// WI-139 — oEmbed fetch contracts (network mocked; the hook is glue, untested).

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEmbedMeta } from "./oembed.js";

afterEach(() => vi.unstubAllGlobals());

const YT = "https://youtu.be/dQw4w9WgXcQ";

function stubFetch(
  impl: (input: string) => Promise<{ ok: boolean; json?: () => Promise<unknown> }>,
) {
  const f = vi.fn(impl);
  vi.stubGlobal("fetch", f);
  return f;
}

describe("fetchEmbedMeta", () => {
  it("maps oEmbed { title, thumbnail_url } → { title, thumbnailUrl }", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ title: "Never Gonna Give You Up", thumbnail_url: "https://i/x.jpg" }),
    }));
    expect(await fetchEmbedMeta(YT)).toEqual({
      title: "Never Gonna Give You Up",
      thumbnailUrl: "https://i/x.jpg",
    });
  });

  it("calls the provider's oEmbed endpoint with the encoded url", async () => {
    const f = stubFetch(async () => ({ ok: true, json: async () => ({ title: "t" }) }));
    await fetchEmbedMeta("https://vimeo.com/76979871");
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toContain("https://vimeo.com/api/oembed.json?url=");
  });

  it("does not fetch for an unrecognized url", async () => {
    const f = stubFetch(async () => ({ ok: true }));
    expect(await fetchEmbedMeta("https://example.com/video")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("degrades to null on a non-ok response or a thrown fetch", async () => {
    stubFetch(async () => ({ ok: false }));
    expect(await fetchEmbedMeta(YT)).toBeNull();
    stubFetch(async () => {
      throw new Error("network down");
    });
    expect(await fetchEmbedMeta(YT)).toBeNull();
  });

  it("returns null when the response carries neither title nor thumbnail", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ author_name: "x" }) }));
    expect(await fetchEmbedMeta(YT)).toBeNull();
  });
});
