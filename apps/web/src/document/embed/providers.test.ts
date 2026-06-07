// WI-139 — embed provider URL parsing contracts.

import { describe, expect, it } from "vitest";
import { EMBED_PROVIDERS, resolveEmbed } from "./providers.js";

const EMBED = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

describe("resolveEmbed (YouTube)", () => {
  it("parses every common YouTube URL form to the nocookie embed", () => {
    const urls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
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

  it("exposes a non-empty provider registry with unique ids", () => {
    expect(EMBED_PROVIDERS.length).toBeGreaterThan(0);
    expect(new Set(EMBED_PROVIDERS.map((p) => p.id)).size).toBe(EMBED_PROVIDERS.length);
  });
});
