// WI-139 — embed provider URL parsing contracts.

import { describe, expect, it } from "vitest";
import { appendQuery, EMBED_PROVIDERS, resolveEmbed } from "./providers.js";

const EMBED = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

describe("resolveEmbed (YouTube)", () => {
  it("parses every common YouTube URL form to the nocookie embed", () => {
    const urls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      // Other query params (playlist, feature) must not break id parsing or add a start.
      "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc&feature=share",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ];
    for (const url of urls) {
      const r = resolveEmbed(url);
      expect(r?.provider.id, url).toBe("youtube");
      expect(r?.embedUrl, url).toBe(EMBED);
    }
  });

  it("uses the privacy-enhanced (nocookie) domain", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toContain(
      "youtube-nocookie.com",
    );
  });

  it("derives a thumbnail poster from the video id (no fetch)", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")?.thumbnailUrl).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("returns null for empty / non-YouTube / unparseable URLs", () => {
    expect(resolveEmbed("")).toBeNull();
    expect(resolveEmbed("   ")).toBeNull();
    expect(resolveEmbed("https://example.com/video")).toBeNull();
    expect(resolveEmbed("https://youtube.com/")).toBeNull(); // no id
    expect(resolveEmbed("not a url")).toBeNull();
  });

  it("does not mistake a short/invalid id (wrong length) for a video", () => {
    expect(resolveEmbed("https://youtu.be/tooShort")).toBeNull();
  });

  it("carries a share-link start time through as ?start=<seconds>", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ?t=90")?.embedUrl).toBe(`${EMBED}?start=90`);
    expect(resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s")?.embedUrl).toBe(
      `${EMBED}?start=90`,
    );
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ?t=1m30s")?.embedUrl).toBe(
      `${EMBED}?start=90`,
    );
    // No start → bare embed (no ?start).
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toBe(EMBED);
  });

  it("exposes a non-empty provider registry with unique ids", () => {
    expect(EMBED_PROVIDERS.length).toBeGreaterThan(0);
    expect(new Set(EMBED_PROVIDERS.map((p) => p.id)).size).toBe(EMBED_PROVIDERS.length);
  });
});

describe("resolveEmbed (Vimeo — Rule-6 provider extensibility)", () => {
  it("parses vimeo.com/<id> and player.vimeo.com/video/<id>", () => {
    for (const url of [
      "https://vimeo.com/76979871",
      "https://vimeo.com/76979871?share=copy",
      "https://player.vimeo.com/video/76979871",
    ]) {
      const r = resolveEmbed(url);
      expect(r?.provider.id, url).toBe("vimeo");
      expect(r?.embedUrl, url).toBe("https://player.vimeo.com/video/76979871");
    }
  });

  it("has no derivable thumbnail (needs oEmbed) → null poster", () => {
    expect(resolveEmbed("https://vimeo.com/76979871")?.thumbnailUrl).toBeNull();
  });
});

describe("resolveEmbed (Loom — another registry entry)", () => {
  it("parses loom.com/share/<32hex> → the loom embed", () => {
    const id = "a".repeat(32);
    const r = resolveEmbed(`https://www.loom.com/share/${id}?t=1`);
    expect(r?.provider.id).toBe("loom");
    expect(r?.embedUrl).toBe(`https://www.loom.com/embed/${id}`);
    expect(r?.thumbnailUrl).toBeNull();
  });
});

describe("provider oEmbed endpoints", () => {
  it("each provider builds an oEmbed endpoint for its recognized url", () => {
    const yt = EMBED_PROVIDERS.find((p) => p.id === "youtube");
    const vm = EMBED_PROVIDERS.find((p) => p.id === "vimeo");
    expect(yt?.oembedEndpoint("https://youtu.be/dQw4w9WgXcQ")).toContain("youtube.com/oembed?url=");
    expect(vm?.oembedEndpoint("https://vimeo.com/76979871")).toContain(
      "vimeo.com/api/oembed.json?url=",
    );
    // No endpoint for a url the provider doesn't recognize.
    expect(yt?.oembedEndpoint("https://vimeo.com/76979871")).toBeNull();
  });
});

describe("autoplay params + appendQuery", () => {
  it("each provider mutes when it autoplays (mute vs muted)", () => {
    const byId = (id: string) => EMBED_PROVIDERS.find((p) => p.id === id);
    expect(byId("youtube")?.autoplayParams()).toBe("autoplay=1&mute=1");
    expect(byId("vimeo")?.autoplayParams()).toBe("autoplay=1&muted=1");
    expect(byId("loom")?.autoplayParams()).toBe("autoplay=1");
  });

  it("appendQuery picks ? or & based on the existing url", () => {
    expect(appendQuery("https://x/embed/i", "autoplay=1")).toBe("https://x/embed/i?autoplay=1");
    expect(appendQuery("https://x/embed/i?start=90", "autoplay=1&mute=1")).toBe(
      "https://x/embed/i?start=90&autoplay=1&mute=1",
    );
    expect(appendQuery("https://x/embed/i", "")).toBe("https://x/embed/i");
  });
});
