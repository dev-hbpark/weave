# Incident Communications — Text Item v1

| Field | Value |
|---|---|
| Feature | Text Item v1 |
| WI | WI-029 |
| Effective | 2026-05-26 |
| Audience | weave 사용자 (한국어 1순위 + English) |
| Source | LG-001 Pillar 6 conditional close (incident comms pre-write) |

Pre-written user-facing copy for the most likely text-v1 incident
scenarios. Templates are filled in by the operator at incident time —
do NOT publish raw placeholders. All copy mirrors the
[`Banner`](../../packages/design-system/src/components/Banner.tsx)
`tone="warning"` semantic when surfaced in-app, or matches
[`TEXT_V1_LAUNCH_NOTE.md`](../launch/TEXT_V1_LAUNCH_NOTE.md) voice for
broader announcements.

## 1. Text editing unavailable (Lexical chunk failure)

**Trigger**: §1 of `docs/operations/RUNBOOK_TEXT_V1.md` — text not
editable, Lexical lazy chunk failed to load.

**Channels**: in-app banner (immediate) + status page (within 15min).

### 한국어 (in-app banner — `tone="warning"`)

> **⚠️ 텍스트 편집 일시 중단**
>
> 텍스트 박스의 글자 편집 기능이 일시적으로 작동하지 않습니다.
> 페이지를 새로고침하면 대부분 해결됩니다.
>
> 영향: 텍스트 박스 추가 / 편집 / 글자 스타일 변경
> 영향 없음: 다른 모든 디자인 작업 (이미지·비디오·도형 추가 / 이동 / 정렬)
>
> [새로고침]

### English

> **⚠️ Text editing temporarily unavailable**
>
> The text-box editor is currently unable to load. A page reload usually
> resolves the issue.
>
> Affected: adding / editing text boxes, character styling
> Not affected: image / video / shape work, layout
>
> [Reload]

### Status page entry

> **2026-MM-DD HH:MM KST — Text editor delivery issue**
>
> A subset of users are seeing the text-box editor fail to load. We are
> investigating a content-delivery anomaly. Other editor functions are
> unaffected. Next update in 15 minutes.

---

## 2. Korean IME composition leak

**Trigger**: §2 of `RUNBOOK_TEXT_V1.md` — typing 한글 produces "ㅎㅏㄴ"
instead of "한", or duplicates input.

**Channels**: in-app banner (locale=ko-KR only) + targeted email to
Korean-locale tenants.

### 한국어 (in-app banner — `tone="warning"`)

> **⚠️ 한국어 입력 이상**
>
> 일부 환경에서 한글 자모(ㅎ·ㅏ 등)가 분리되어 입력되는 현상이 확인되었습니다.
>
> 임시 해결책:
> - 다른 브라우저(Chrome / Safari / Firefox / Edge)에서 다시 시도
> - 한글이 잘 입력되는 다른 칸(예: 메모장 / 워드)에서 작성 후 붙여넣기
>
> 영향 받지 않음: 이미 작성된 텍스트, 영문 입력, 다른 디자인 기능
>
> 빠른 시일 내 수정하겠습니다.

### English

> **⚠️ Korean IME input issue**
>
> A subset of environments produce broken jamo composition (e.g. "ㅎㅏㄴ"
> instead of "한") when typing Korean.
>
> Workaround: try a different browser, or paste from an external editor.
> Existing text and non-Korean input are unaffected.
>
> A fix is in progress.

### Email to ko-KR tenants

> 제목: weave 텍스트 박스의 한국어 입력 이슈 안내
>
> 안녕하세요, weave 팀입니다.
>
> 최근 일부 환경에서 텍스트 박스에 한글을 입력할 때 자모가 분리되어 입력되는
> 현상이 발견되었습니다.
>
> 현재 빠르게 원인을 조사 중이며, 임시로 다음 방법으로 우회 가능합니다:
> - 다른 브라우저 사용 (Chrome / Safari / Firefox / Edge)
> - 외부 도구에서 작성 후 붙여넣기
>
> 이미 작성한 텍스트, 영문 입력, 다른 모든 weave 기능은 영향 없습니다.
>
> 수정이 배포되는 대로 다시 안내드리겠습니다. 양해 부탁드립니다.

---

## 3. Cmd+Z does not undo text edit (history desync)

**Trigger**: §3 of `RUNBOOK_TEXT_V1.md` — text mutation bypassed
`editor.exec` → ChangeStream → History.

**Channels**: in-app banner (low-severity, scoped).

### 한국어 (in-app banner — `tone="info"`)

> **ℹ️ 실행 취소 일시 작동 안 함**
>
> 텍스트 편집의 일부 변경이 실행 취소(Cmd+Z)로 되돌아가지 않을 수 있습니다.
>
> 안전을 위해 큰 변경 전에 수동으로 저장(Cmd+S)을 권장드립니다.
> 곧 수정 배포 예정입니다.

### English

> **ℹ️ Undo temporarily limited for text edits**
>
> Some text-editing changes may not roll back via Cmd+Z. We recommend
> saving manually (Cmd+S) before larger changes. Fix coming shortly.

---

## 4. Data loss — design loads empty (RISK-004 §1 re-occurrence)

**Trigger**: §7 of `RUNBOOK_TEXT_V1.md` — v5 design loads with 0 frames.
**Severity: Critical** — page hbpark + start POSTMORTEM.md draft.

**Channels**: targeted email to affected user(s) + status page + (if
widespread) in-app banner.

### 한국어 (targeted email — replace TEMPLATE)

> 제목: [중요] {{DESIGN_TITLE}} 디자인 복구 안내
>
> 안녕하세요, weave 팀입니다.
>
> 죄송한 말씀이지만, 회원님의 디자인 "{{DESIGN_TITLE}}"이(가) 최신 업데이트
> 적용 과정에서 일시적으로 빈 상태로 보일 수 있는 이슈를 확인했습니다.
>
> 데이터는 자동으로 백업되어 있으며, 다음 단계로 복구 가능합니다:
>
> 1. weave 를 새로고침 하지 마시고, 이 메일에 답장해 주세요.
> 2. 저희 팀이 즉시 복구 작업을 진행합니다 (영업시간 기준 30분 내).
>
> 임의로 디자인을 다시 편집하시면 백업이 덮어쓰여질 수 있으니, 반드시 답장
> 후 안내를 따라주세요.
>
> 진심으로 사과드리며, 빠른 복구를 약속드립니다.

### English (targeted email — replace TEMPLATE)

> Subject: [Important] Recovery of design "{{DESIGN_TITLE}}"
>
> Hi {{USER_NAME}},
>
> We've detected that your design "{{DESIGN_TITLE}}" may appear empty
> after a recent update. Your data is safely backed up and can be
> restored.
>
> Please:
>
> 1. Do NOT reload weave or interact with the design.
> 2. Reply to this email — our team will restore it within 30 minutes
>    during business hours.
>
> Editing the design now may overwrite the backup. We apologize for the
> inconvenience and will follow up with confirmation.

### Status page entry (if widespread — > 5 users affected)

> **2026-MM-DD HH:MM KST — Investigating: design content visibility**
>
> A small number of users are seeing existing designs render as empty
> after the most recent update. Data is not lost — automatic backups
> are intact. We are restoring affected designs individually and will
> ship a fix that prevents this from recurring. Next update in 30 minutes.

---

## 5. R5 launch comm UI showing past retract date

**Trigger**: §5 of `RUNBOOK_TEXT_V1.md` — Banner / Tooltip visible past
2026-06-15.

**Channels**: low priority — fix by hotfix deploy, no user comm needed.

(No external messaging — this is a cosmetic regression. Hotfix the
constants in `TextV1LaunchBanner.tsx` and `text-v1-copy.ts`.)

---

## 6. Generic "텍스트 입력 안됨" support reply template

For support inbox queries that don't clearly fit §1-§5:

### 한국어

> 안녕하세요, weave 팀입니다.
>
> 텍스트 입력 관련 불편을 알려주셔서 감사합니다. 정확한 원인 파악을 위해
> 다음 정보를 부탁드립니다:
>
> 1. 어떤 브라우저를 사용 중이신가요? (Chrome / Safari / Firefox / Edge + 버전)
> 2. 한국어 입력인가요, 영문 / 다른 언어 입력인가요?
> 3. 디자인이 새로 만든 것인가요, 기존 디자인인가요?
> 4. 화면을 새로고침 하면 동일하게 발생하나요?
>
> 답변 주시는 대로 즉시 확인 후 회신드리겠습니다.

### English

> Hi, thanks for letting us know about the text-input issue.
>
> To help us narrow it down, could you share:
>
> 1. Which browser + version are you on?
> 2. Are you typing Korean, English, or another language?
> 3. Is it a new design or one you've worked on before?
> 4. Does it persist after a page reload?
>
> We'll follow up as soon as we hear back.

---

## Tone guidelines

- **Severity-aware tone**: critical (§4) is formal + apologetic; medium
  (§1, §2, §3) is direct + workaround-first; low (§5) silent or
  cosmetic.
- **Workaround first, fix second**: every user-facing message must
  include an actionable workaround before describing what we are doing.
- **No engineering jargon**: never reference "Lexical chunk" / "IME
  composition flag" / "history desync" in user-facing copy; describe
  the behavior the user sees.
- **Locale parity**: every 한국어 message has an English equivalent.
- **Time precision**: timestamps in `KST` (UTC+9), 24h format, and
  always commit to a next-update window (`Next update in 15 minutes`).
- **No promises we can't keep**: never write "fixed by EOD" without
  hbpark's explicit confirmation.

## Cross-references

- LG-001 Pillar 6: `records/launch-gates/LG-001-text-item-v1.md` § Pillar 6
- Runbook: `docs/operations/RUNBOOK_TEXT_V1.md`
- Launch note (voice reference): `docs/launch/TEXT_V1_LAUNCH_NOTE.md`
- RISK-001 condition #9 (LWW disclosure): `records/risks/RISK-001-text-item-v1.md`
- RISK-004 (frame-only paradigm data-loss class): `records/risks/RISK-004-frame-only-paradigm.md`
