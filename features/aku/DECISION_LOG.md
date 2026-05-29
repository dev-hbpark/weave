# Aku — Decision Log (WI-052)

| # | Decision | Why |
|---|---|---|
| D1 | **Mock transport now, real Claude later** | Operator choice. Keeps API cost/keys out of v1; works under plain `pnpm dev` (which doesn't serve `api/`). The mock emits the *same* `AkuEvent` shape as the future real transport → drop-in. |
| D2 | **Design-aware (Aku reads + edits the canvas)** | Operator choice. v1 ships read (`snapshot`) + edit tools even though the stream is mocked — the agent→canvas wire is the load-bearing part and is proven by e2e. |
| D3 | **Edits route through `editor.exec` only** | weave History contract — Aku's edits must be undoable transactions, never direct `setAgoDoc`. Proven: "배경을 파랑으로" + Cmd+Z e2e. |
| D4 | **Transport = Strategy interface; tools = Map registry** | DIP (hook depends on interface) + Rule 6 (no `switch` on tool name). Makes the real-model swap and new-tool additions local, low-risk changes. |
| D5 | **`Textarea` grown as a design-system primitive** (DR-design-023) | `TextField` is input-only; a multiline input is reusable beyond Aku. App-local lookalike rejected (would split the DS surface). |
| D6 | **Launcher composed from `IconButton`+tokens, not a new FAB primitive** | One consumer; a FAB primitive isn't earned yet. Reuse over Grow. |
| D7 | **Access control deferred (personal/dev)** | Operator choice; v1 has no real endpoint so no live cost surface. Hardening is a hard gate before the real route ships (RISK_NOTES R1). |
| D8 | **Mock intent matching is shallow keyword heuristics** | It only needs to demonstrate read + edit end-to-end; the real model replaces the "decide which tool" logic, keeping the same tool registry. |
| D9 | **Discoverability iteration: labeled pill + reposition above the thumbnail strip + first-run coachmark** | Launcher was a bare 48px icon at `bottom-4 right-4`, buried behind the bottom ThumbnailPanel strip (z-46). Fix: a labeled accent pill (icon + "아쿠") raised to `bottom-28` (clears the strip), panel raised to match, + a one-shot `OnboardingCoachmark` (persistKey `aku-intro`) to actively invite the first use. All reuse/compose (no new DS primitive). |
| D10 | **Delay the coachmark ~800ms after mount** | Mounting it during initial load let canvas focus/pointer events trip Radix's outside-dismiss → it closed + persisted before being seen (flash-and-vanish). Gating behind a short settle delay fixes it; the e2e locks first-show + persisted-silence-on-reload. |
| D11 | **Movable + resizable, persisted; default top-left** | Per request. `useAkuGeometry` holds {x,y,w,h} in localStorage (`weave.aku.geometry`), default top-left below the header. Launcher is drag-or-tap (4px threshold → drag relocates, tap opens); panel drags by its header title cluster and resizes from a bottom-right grabber. All clamped to the viewport (≥56px always grabbable) + persisted across collapse/expand/reload. Reuse/compose only — no new DS primitive. e2e covers default-top-left, drag+persist, resize. |
