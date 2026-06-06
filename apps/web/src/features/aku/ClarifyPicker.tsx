// Pre-generation media confirmation. Before creating a design the small-think server
// asks whether to incorporate media items (image / video / qr / …, derived from weave's
// live capabilities). Rather than per-type selection, this surfaces a single yes/no
// question and — purely client-side — auto-confirms "use" after a short idle countdown,
// so a user who walks away still gets a media-rich design. Resolving the agent's
// `onClarify` promise with all offered types (use) or none ([] = no media). Feature-local
// chat UI, composing the design-system Button.

import type { ClarifyRequest } from "@agocraft/agent-client";
import { Button } from "@weave/design-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Seconds of inactivity before the question auto-confirms with "use". Client-side only;
// the server just waits on the onClarify promise.
const AUTO_CONFIRM_SECONDS = 5;

export function ClarifyPicker({
  request,
  onSubmit,
}: {
  readonly request: ClarifyRequest;
  readonly onSubmit: (types: readonly string[]) => void;
}): JSX.Element {
  // All offered item types = the "use media" answer; [] = "no media". Memoized so the
  // countdown effect's dependency is stable while this request is mounted.
  const allTypes = useMemo(() => request.options.map((o) => o.type), [request]);

  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONFIRM_SECONDS);
  // Guards against a double-submit (timeout firing as a late click lands) — onSubmit
  // unmounts us, but the timer cleanup and the click can still race for one tick.
  const doneRef = useRef(false);
  const submit = useCallback(
    (types: readonly string[]): void => {
      if (doneRef.current) return;
      doneRef.current = true;
      onSubmit(types);
    },
    [onSubmit],
  );

  // One timeout drives the actual auto-confirm; a separate interval drives only the
  // visible countdown — so the resolve never rides inside a state updater.
  useEffect(() => {
    const timeout = setTimeout(() => submit(allTypes), AUTO_CONFIRM_SECONDS * 1000);
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(tick);
    };
  }, [submit, allTypes]);

  return (
    <div
      className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
      data-aku-clarify
    >
      <p className="text-[12px] font-medium text-[color:var(--text-strong)]">
        디자인에 미디어를 사용할까요?
      </p>
      <p className="text-[11px] text-[color:var(--text-soft)]">
        {secondsLeft}초 후 자동으로 사용합니다.
      </p>
      {/* Depleting bar so the idle countdown is visible at a glance. */}
      <div className="h-1 overflow-hidden rounded-full bg-[color:var(--border)]" aria-hidden="true">
        <div
          className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-1000 ease-linear"
          style={{ width: `${(secondsLeft / AUTO_CONFIRM_SECONDS) * 100}%` }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="subtle" size="md" onClick={() => submit([])}>
          사용 안 함
        </Button>
        <Button variant="primary" size="md" onClick={() => submit(allTypes)}>
          사용 ({secondsLeft})
        </Button>
      </div>
    </div>
  );
}
