# 텍스트 아이템 v1 — Launch Note (Figma-equivalent paradigm)

| Field | Value |
|---|---|
| Effective | (TBD — Engineering Plan R1-R5 모두 완료 후) |
| Audience | weave 사용자 (한국어 1순위) |
| Source decisions | DR-015 (Lexical) · DR-016 (resize paradigm) · WI-029 · `TEXT_ITEM_SPEC.md` |
| Display duration | 첫 launch 후 1주 노출 (RISK-001 condition #6) |

---

## 사용자에게 전달할 메시지 (in-app banner)

### 한국어

> **텍스트 편집이 새로워졌습니다 ✨**
>
> Figma·Canva 와 동일한 방식으로 텍스트를 다룰 수 있습니다.
>
> - **3가지 리사이즈 모드** — Auto-Width (자동 가로) / Auto-Height (자동 세로) / Fixed (고정). PropertiesPanel 최상단에서 전환.
> - **글자별 굵게·이탤릭·밑줄** — 텍스트 일부 선택 후 Cmd+B / Cmd+I / Cmd+U
> - **세로 정렬 / 글자 변형 (대/소/타이틀) / 줄간격 / 자간 / 하이퍼링크** — PropertiesPanel 의 새 컨트롤
> - **잘림 처리** — Fixed 모드에서 박스 넘는 텍스트를 자동 `...` 표시
>
> ⚠️ **바뀐 점**: 코너 드래그가 더 이상 글자 크기를 자동 확대하지 않습니다. 글자 크기는 PropertiesPanel 의 Size 슬라이더에서 조정해 주세요. (Figma 와 동일한 방식)
>
> [자세히 보기 →](./TEXT_V1_LAUNCH_NOTE.md)

### English

> **Text editing is upgraded ✨**
>
> Text now behaves the way Figma and Canva do.
>
> - **3 resize modes** — Auto-Width / Auto-Height / Fixed. Toggle in PropertiesPanel.
> - **Per-character bold/italic/underline** — Select text + Cmd+B / Cmd+I / Cmd+U
> - **Vertical align / text-case / line-height / letter-spacing / hyperlink** — new PropertiesPanel controls
> - **Truncation** — Fixed-mode text exceeding the box shows `...`
>
> ⚠️ **Change**: Corner drag no longer scales font size. Use the Size slider in PropertiesPanel to change font size. (Same as Figma.)

---

## Tooltip (PropertiesPanel fontSize slider 옆, 1주 노출 후 회수)

> 글자 크기는 여기서 변경 — 코너 드래그는 박스만 조정합니다 (Figma 방식)

(English) `Change font size here — corner drag adjusts the box only (Figma style)`

---

## Onboarding hint (첫 텍스트 박스 생성 시, 1회만)

> 💡 **새로운 점**
> 텍스트 박스 위쪽에 ↔ ↕ □ 세 모드 토글이 있습니다.
> - **↔ Auto-W**: 글자 입력하면 박스가 가로로 자동 확장
> - **↕ Auto-H**: 폭 고정, 줄바꿈에 따라 세로 자동
> - **□ Fixed**: 폭·세로 모두 고정, 넘치는 텍스트는 잘림 옵션
>
> [닫기]

---

## 지원 문서 (`docs/help/text-editing.md` — 정식 사용자 가이드)

### 텍스트 박스 만들기

상단 도구 모음 의 `[+]` → `텍스트` 클릭. 또는 캔버스에서 드래그해 박스 영역 지정.

### 리사이즈 모드 3가지

| 모드 | 동작 | 언제 쓰나 |
|---|---|---|
| ↔ **Auto-Width** | 글자에 맞춰 가로로 자동 확장. 한 줄 유지 (줄바꿈 없음). | 짧은 라벨, 제목 한 줄 |
| ↕ **Auto-Height** (default) | 폭 고정, 글자가 많아지면 자동으로 줄바꿈 + 세로 확장 | 본문, 캡션, 일반 텍스트 |
| □ **Fixed** | 폭과 세로 모두 직접 설정. 박스 넘는 텍스트는 visible 또는 잘림 (Truncate 옵션) | 정확한 레이아웃, 카드 |

### 글자 크기 vs 박스 크기 (Figma 방식)

- **글자 크기 (fontSize)**: PropertiesPanel 의 `Size` 슬라이더에서만 변경. 8 ~ 200 px.
- **박스 크기 (frame.width / height)**: 모드에 따라 핸들 드래그 또는 자동.
- ⚠️ **코너 드래그는 박스만 조정합니다** — 글자 크기는 변하지 않습니다.

### 글자별 스타일 (rich text)

텍스트 박스 더블클릭 → 편집 모드 → 일부 글자 선택 → 단축키:
- **`Cmd+B` / `Ctrl+B`**: 굵게
- **`Cmd+I` / `Ctrl+I`**: 이탤릭
- **`Cmd+U` / `Ctrl+U`**: 밑줄
- 한 글자, 한 단어, 한 문장 단위로 자유 적용

### Truncation (Fixed 모드만)

Fixed 모드 + Truncate=`…` + Max lines=N → 박스에 맞춰 N줄까지만 보이고, 넘치는 부분은 `...` 으로 자름.

### Hyperlink

PropertiesPanel 의 Hyperlink 필드에 URL 입력 → 발표 모드에서 클릭하면 새 탭으로 이동. 박스 단위로 한 링크.

### 새 PropertiesPanel 컨트롤 한눈에

```
Mode:        [↔] [↕] [□]              ← 리사이즈 모드
Family:      Inter / Noto Sans KR / ...
Font:        [R] [B]  [—] [I]
Size:        [────●──]
Align:       [L] [C] [R] [J]
V-Align:     [⤒] [⤬] [⤓]              ← 신규
Decoration:  [—] [U] [S]               ← 신규
Case:        [Aa] [AA] [aa] [Aa+]      ← 신규
Color / Background / Opacity
Line height: [────●──] ×              ← 신규
Letter spacing: [────●──] px          ← 신규
Truncate:    (Fixed 모드일 때만 노출)  ← 신규
Hyperlink:   [https://...]            ← 신규
```

---

## 마이그레이션 안내 (사용자에게 visible 하지 않음)

기존 (Phase 0) 에 저장된 텍스트 아이템은 자동으로 새 스키마로 변환됩니다 — 데이터 손실 없음:
- 모든 기존 글자·색·정렬·크기 보존
- Mode = `Auto-Height` (기본값) 으로 시작 — 기존 동작과 동일
- 신규 필드 (V-Align, Decoration, Case 등) = 기본값으로 초기화

코너 드래그 동작 변경은 visual 회귀로 보일 수 있으나, 박스 width/height 만 변하고 글자 크기는 그대로 — Figma 방식의 일관된 paradigm 으로 전환.

---

## 회수 일정

| 자산 | 노출 기간 |
|---|---|
| In-app banner | Launch + 1주 (RISK-001 condition #6) |
| Tooltip (fontSize slider) | Launch + 1주 |
| Onboarding hint | 1회 (사용자가 첫 텍스트 박스 만들 때) |
| Support article (`docs/help/text-editing.md`) | 영구 |

## 모니터링

- Sentry/datadog tag `locale=ko-KR` + event `text-input-anomaly` 1개월 추적 (RISK-001 condition #4 telemetry)
- "글자 크기" / "코너 드래그" 관련 support email / in-app feedback 키워드 추적
- "왜 글자가 안 커지지" 같은 confusion 신호 시 onboarding hint duration 연장 고려

## Links

- WI-029: `records/work-items/WI-029-text-item-figma-equivalent.md`
- DR-016 (paradigm 변경 source): `records/decisions/DR-016-text-resize-paradigm.md`
- RISK-001 conditions #6 (launch note), #9 (LWW disclosure): `records/risks/RISK-001-text-item-v1.md`
- Engineering Plan: `features/text/ENGINEERING_PLAN.md` §7 Phase R5
- Spec: `docs/product/TEXT_ITEM_SPEC.md`
