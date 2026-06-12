// AkuModeBar (HANDOFF-030 / small-think WI-056·DR-070) — the execution mode as
// TWO always-visible toggles in the panel: provider (Claude | GPT) × transport
// (API | SSH). The four combinations are the provider×transport matrix; picking
// one axis recomposes the mode with the other axis held (modeFromAxes).
//
// This is a REQUEST: the server grants only allowlisted modes
// (SMALL_THINK_ALLOWED_MODES) and announces the ACTUAL mode in the header chip
// (serverInfo.mode) — so the toggles show INTENT and the chip shows REALITY.
// Changing a toggle drops the link and reconnects with a fresh hello (the same
// onSetAgentMode flow the old gear-menu segments used).

import {
  AKU_PROVIDER_OPTIONS,
  AKU_TRANSPORT_OPTIONS,
  type AkuAgentMode,
  axesFromMode,
  modeFromAxes,
} from "./agent/agent-mode.js";

function Segments<V extends string>({
  label,
  options,
  active,
  onPick,
  testid,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<{
    readonly value: V;
    readonly label: string;
    readonly hint: string;
  }>;
  readonly active: V;
  readonly onPick: (value: V) => void;
  readonly testid: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-overlay-soft)]">
        {label}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: composite toggle on an overlay surface */}
      <div className="flex gap-0.5" role="group" aria-label={label} data-testid={testid}>
        {options.map((opt) => {
          const isActive = active === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isActive}
              title={opt.hint}
              onClick={() => onPick(opt.value)}
              className={`rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] border transition-colors ${
                isActive
                  ? "bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)]"
                  : "border-[color:var(--surface-overlay-border)] text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AkuModeBar({
  agentMode,
  onSetAgentMode,
}: {
  readonly agentMode: AkuAgentMode;
  readonly onSetAgentMode: (mode: AkuAgentMode) => void;
}): JSX.Element {
  const { provider, transport } = axesFromMode(agentMode);
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--surface-overlay-border)] px-3 py-1.5"
      data-testid="aku-mode-bar"
    >
      <Segments
        label="엔진"
        options={AKU_PROVIDER_OPTIONS}
        active={provider}
        onPick={(p) => onSetAgentMode(modeFromAxes(p, transport))}
        testid="aku-mode-provider"
      />
      <Segments
        label="연결"
        options={AKU_TRANSPORT_OPTIONS}
        active={transport}
        onPick={(t) => onSetAgentMode(modeFromAxes(provider, t))}
        testid="aku-mode-transport"
      />
    </div>
  );
}
