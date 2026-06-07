// WI-139 — embed provider URL parsing contracts.

import { describe, expect, it } from "vitest";
import { EMBED_PROVIDERS, resolveEmbed } from "./providers.js";

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
