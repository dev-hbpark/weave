// Aku token-setup gate (WI-054 follow-up) — shown in the panel body when no
// agent-server token is configured (no `deps.token`, no `VITE_AKU_AGENT_TOKEN`,
// nothing saved in this browser). Entering a token saves it (localStorage) and
// lets the conversation initialize normally. Composes design-system primitives
// (TextField + Button); the surrounding layout is feature-local (chat UI is
// app-specific, like MessageList).

import { Button, IconSparkle, TextField } from "@weave/design-system";
import { type KeyboardEvent, useState } from "react";

export function AkuTokenSetup({
  onSave,
}: {
  readonly onSave: (token: string) => void;
}): JSX.Element {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const submit = (): void => {
    if (trimmed !== "") onSave(trimmed);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center"
      data-aku-token-setup
    >
      <IconSparkle size={28} className="text-[color:var(--accent)]" />
      <div className="grid gap-1.5">
        <p className="text-[14px] font-medium text-[color:var(--text-strong)]">
          아쿠 연결에 토큰이 필요해요
        </p>
        <p className="text-[12px] leading-[1.5] text-[color:var(--text-soft)]">
          에이전트 서버 접속 토큰을 입력하면 대화를 시작할 수 있어요.
          <br />
          입력값은 이 브라우저에만 저장됩니다.
        </p>
      </div>
      <div className="w-full max-w-[280px] grid gap-3">
        <TextField
          label="에이전트 토큰"
          type="password"
          autoComplete="off"
          placeholder="토큰 입력"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          data-testid="aku-token-input"
        />
        <Button
          variant="primary"
          onClick={submit}
          disabled={trimmed === ""}
          data-testid="aku-token-save"
        >
          연결하기
        </Button>
      </div>
    </div>
  );
}
