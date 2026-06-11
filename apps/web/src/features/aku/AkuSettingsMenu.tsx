// Aku settings menu — the gear (⋯) button in the panel header + a dropdown of
// toggle switches. Data-driven from `AKU_SETTINGS_SECTIONS` so adding a flag is
// one entry in `aku-settings.ts`, no JSX here. The dropdown also hosts the
// secondary actions that used to crowd the header (새 대화 / 토큰 재설정).

import { IconButton, IconMore, Switch } from "@weave/design-system";
import { useId, useState } from "react";
import { AKU_AGENT_MODE_OPTIONS, type AkuAgentMode } from "./agent/agent-mode.js";
import {
  AKU_CREATIVITY_OPTIONS,
  AKU_INTENT_SOURCE_OPTIONS,
  AKU_SETTINGS_SECTIONS,
  type AkuSettings,
  type SetAkuSetting,
} from "./agent/aku-settings.js";

export function AkuSettingsMenu({
  settings,
  onSetSetting,
  onClear,
  canClear,
  onResetToken,
  hasToken,
  agentMode,
  onSetAgentMode,
}: {
  readonly settings: AkuSettings;
  readonly onSetSetting: SetAkuSetting;
  /** Clear the transcript (moved out of the header). */
  readonly onClear: () => void;
  readonly canClear: boolean;
  /** Forget the saved token (moved out of the header). */
  readonly onResetToken: () => void;
  readonly hasToken: boolean;
  /** Execution-mode REQUEST (WI-175) — granted mode shows in the header chip. */
  readonly agentMode: AkuAgentMode;
  readonly onSetAgentMode: (mode: AkuAgentMode) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <IconButton
        aria-label="아쿠 설정"
        aria-expanded={open}
        aria-controls={panelId}
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        data-testid="aku-settings-toggle"
      >
        <IconMore size={16} />
      </IconButton>

      {open ? (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-label="설정 닫기"
            className="fixed inset-0 z-[60] cursor-default"
            onClick={close}
          />
          <div
            id={panelId}
            data-testid="aku-settings-panel"
            className="absolute right-0 top-[calc(100%+6px)] z-[61] w-64 max-h-[60vh] overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay)] backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-overlay)] p-2"
          >
            {AKU_SETTINGS_SECTIONS.map((section) => (
              <div key={section.title} className="mb-1.5 last:mb-0">
                <div className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-overlay-soft)]">
                  {section.title}
                </div>
                {section.items.map((item) => {
                  const gated = item.dependsOn !== undefined && !settings[item.dependsOn];
                  return (
                    <div
                      key={item.key}
                      className={`flex items-start gap-2 rounded-[var(--radius-sm)] px-1.5 py-1.5 ${
                        gated ? "opacity-40" : "hover:bg-[color:var(--surface-overlay-2)]"
                      }`}
                    >
                      <Switch
                        checked={settings[item.key]}
                        onCheckedChange={(on) => onSetSetting(item.key, on)}
                        disabled={gated}
                        aria-label={item.label}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] text-[color:var(--text-overlay)] leading-tight">
                          {item.label}
                        </span>
                        <span className="block text-[10.5px] text-[color:var(--text-overlay-soft)] leading-snug mt-0.5">
                          {item.hint}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Intent source (WI-148) — where editing intent is classified. A
                segmented control, not a toggle (server / client / off). */}
            <div className="mb-1.5">
              <div className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-overlay-soft)]">
                의도 인식 위치
              </div>
              <div className="px-1.5 py-1">
                {/* biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface */}
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label="의도 인식 위치"
                  data-testid="aku-intent-source"
                >
                  {AKU_INTENT_SOURCE_OPTIONS.map((opt) => {
                    const active = settings.intentSource === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSetSetting("intentSource", opt.value)}
                        className={`flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] border transition-colors ${
                          active
                            ? "bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)]"
                            : "border-[color:var(--surface-overlay-border)] text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10.5px] text-[color:var(--text-overlay-soft)] leading-snug">
                  의도(추가·수정·교체·팔레트·톤)를 파악해 편집을 라우팅합니다.
                  클라이언트=브라우저에서 판단(서버 생략) · 서버=에이전트 서버가 판단 · 끔=단일
                  경로.
                </div>
              </div>
            </div>

            {/* Creativity (model temperature) — a segmented control, not a toggle. */}
            <div className="mb-1.5">
              <div className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-overlay-soft)]">
                모델
              </div>
              <div className="px-1.5 py-1">
                <div className="mb-1 text-[12px] text-[color:var(--text-overlay)]">창의성</div>
                {/* biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface */}
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label="창의성"
                  data-testid="aku-creativity"
                >
                  {AKU_CREATIVITY_OPTIONS.map((opt) => {
                    const active = settings.creativity === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSetSetting("creativity", opt.value)}
                        className={`flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] border transition-colors ${
                          active
                            ? "bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)]"
                            : "border-[color:var(--surface-overlay-border)] text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10.5px] text-[color:var(--text-overlay-soft)] leading-snug">
                  높일수록 같은 요청도 더 다양하게 생성됩니다.
                </div>
              </div>
            </div>

            {/* Execution mode (WI-175) — a REQUEST: the server grants only
                allowlisted modes (SMALL_THINK_ALLOWED_MODES) and announces the
                ACTUAL mode in the header chip (serverInfo.mode). Changing it
                drops the link and reconnects with a fresh hello. */}
            <div className="mb-1.5">
              <div className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-overlay-soft)]">
                서버 모드
              </div>
              <div className="px-1.5 py-1">
                {/* biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface */}
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label="서버 모드"
                  data-testid="aku-agent-mode"
                >
                  {AKU_AGENT_MODE_OPTIONS.map((opt) => {
                    const active = agentMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        title={opt.hint}
                        onClick={() => onSetAgentMode(opt.value)}
                        className={`flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] border transition-colors ${
                          active
                            ? "bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)]"
                            : "border-[color:var(--surface-overlay-border)] text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10.5px] text-[color:var(--text-overlay-soft)] leading-snug">
                  API=설정된 키(VITE_AKU_API_KEY)가 있으면 그 키, 없으면 서버 공유 키 · SSH=서버의
                  구독 CLI. 허용목록에 없는 모드는 거부되고 기본 모드로 실행됩니다 — 실제 적용
                  모드는 상단 칩에 표시됩니다.
                </div>
              </div>
            </div>

            {/* Secondary actions (moved out of the header). */}
            <div className="mt-1 border-t border-[color:var(--surface-overlay-border)] pt-1.5">
              <button
                type="button"
                disabled={!canClear}
                onClick={() => {
                  onClear();
                  close();
                }}
                data-testid="aku-new-conversation"
                className="w-full text-left rounded-[var(--radius-sm)] px-1.5 py-1.5 text-[12px] text-[color:var(--text-overlay)] enabled:hover:bg-[color:var(--surface-overlay-2)] disabled:opacity-40"
              >
                새 대화
              </button>
              {hasToken ? (
                <button
                  type="button"
                  onClick={() => {
                    onResetToken();
                    close();
                  }}
                  data-testid="aku-token-reset"
                  className="w-full text-left rounded-[var(--radius-sm)] px-1.5 py-1.5 text-[12px] text-[color:var(--text-overlay-soft)] hover:bg-[color:var(--surface-overlay-2)] hover:text-[color:var(--text-overlay)]"
                >
                  토큰 재설정
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
