# 아쿠 (Aku) 마스코트 에셋

아쿠는 **둥둥 떠다니는 캐릭터 마스코트**로, 말풍선으로 팁을 주고 클릭하면 패널을 엽니다
(컨셉 결정: WI-053 / DR-design-024). 이 문서는 **에셋 규격**만 다룹니다 — 둥둥 애니메이션 /
말풍선 tip-controller / 런처 교체 같은 **메커니즘 구현은 별도**(에셋 확정 후).

## 파일 (`apps/web/public/aku/`) — WI-104 업데이트 (실 에셋 도착)

런타임에서는 `/aku/<name>` 로 정적 참조합니다 (Vite `public/`).

| 파일 | 용도 |
|---|---|
| `mascot.png` (1131×1391, **투명 PNG**) | **정적 히어로** — `AkuMascot`(패널 헤더 · 코치마크 · 팁 버블 · CSS 폴백 런처) |
| `sprites/{idle,thinking,idea,move-left,move-right,drag,spell-right,spell-left,puff}.png` (각 **3120×724 = 6프레임 스트립**, 프레임 **520×724**, **투명 PNG**) | **상태별 애니메이션** — 엔진(`@agocraft/sprite-engine`)이 mood→시트로 재생 |

스프라이트 ↔ 에이전트 동작 매핑 (`gpu-sprite-renderer.tsx` `SPRITES`):
`idle`(대기)·`move-left`=connecting(연결 중)/이동(왼쪽)·`thinking`(생각 중).
**작업 종류별(WI-117)**: `spell-right`=adding(아이템 추가 — 캡션 "추가")·`spell-left`=updating(아이템 수정 —
캡션 "수정")·`puff`=finalizing(정리 중 — 캡션 "정리")·`idea`=working(그 외 편집: 변경/삭제/설정)
**및** celebrating(완료 ✨). `move-right`=looking(선택 주목)/이동(오른쪽).
`drag`=dragging(런처 드래그 중 버둥, WI-108 · 시트 교체 WI-111로 520×724 통일). confused→thinking, **sleeping→idle 재사용**(전용
수면 시트 도착 시 `gpu-sprite-renderer` 한 줄 교체). 프레임 종횡비 ≈0.72라 렌더 박스도 그에 맞춤
(런처 **86×120**) + 엔진 **contain-fit**(agocraft DR-045 / canvas2d+worker 양쪽).

**활동 기반 단계(WI-111)**: 런처 아쿠는 사용자의 실제 편집(포인터/키보드)에 따라
editing(home idle) → roaming(랜덤 이동) → sleeping(1분 후 **화면 정중앙으로 이동 후** doze, 현재
idle 시트) 으로 전환하며, 편집 재개 시 home 복귀. 단계/활동 감시는 `useAkuRoam`가 소유하고
`sleeping`은 `useAkuExpression`에 주입(단일 출처). 수면 mood는 idle.png 재사용.

**편집 중 spotlight(WI-110 → WI-115)**: 작업(streaming) 중 화면을 블러 + **밝기↓**(어둡게)
처리하고, 아쿠 주변 원은 **밝게**(별도 bright 레이어 `backdrop brightness↑` + 글로우) + 선명.
`AkuInteractionLock`의 딤/브라이트 레이어에 알파 radial-gradient **MASK**로 중앙을 도려내/밝히고,
rAF가 `[data-aku-launcher]` 중심을 `--aku-spot-x/y`로 갱신해 움직이는 아쿠를 추종.

**작업 시작 = 중앙, 이후 = 프레임 로밍(WI-116)**: streaming 시작 시 아쿠가 **화면 정중앙**으로
한 번 이동(시작을 중앙에서)하고, 이후에는 **편집되는 프레임으로 날아다님**(WI-107 fly-to-frame 복원
— `editor.changeStream`의 user-command 변경마다 해당 `[data-frame-id]` 위치로). 중앙 고정 아님.
(WI-115의 중앙 고정 + 카메라 센터링은 철회 — 로밍을 가림.)

**투명도 교체(2026-06-06)**: 구 스프라이트/마스코트가 불투명(흰 배경)이라 **투명(alpha)** 버전으로 교체.
**너비 조정(2026-06-06)**: 프레임 너비를 단계적으로 확장 — 최종 **고정폭 520**(시트 3120×724,
프레임 520×724, 종횡비 **≈0.72**, repack로 프레임 내 캐릭터 정렬). 렌더 박스를 **86×120**으로
갱신. `editing`/`spell-right` 시트는 세트에서 제외 → `working`/`celebrating`을 `idea`로 매핑.
구 placeholder는 WI-104에서 제거. (cols=6 불변 — 엔진이 시트너비/6으로 프레임폭 자동 산출.)

## 현재 상태 — **원본 플레이스홀더**

현재 4개 파일은 제공된 **원본 캔디 파스텔 일러스트**(`hasAlpha`, 정사각 투명 PNG)를
`sips`로 가공한 것입니다:
- full = 원본 리사이즈, mark = 원본 중앙 820px 크롭(얼굴 bust) → 다운스케일.
- ⚠️ 이건 **임시**입니다. 확정된 방향은 아래 "리스타일 스펙"에 맞춘 **재제작 에셋**이며,
  나오면 같은 파일명으로 교체하면 코드 변경 없이 반영됩니다.

## 리스타일 스펙 (최종 에셋 제작 가이드 — aurora-glass 톤)

weave 디자인 시스템은 절제된 "aurora dark glass / Linear-grade" B2B 톤입니다. 캐릭터
컨셉(공룡요정)은 유지하되 비주얼을 톤에 맞게 재제작:

- **채도↓ + weave 액센트 팔레트** 로 재매핑 (`--accent` 오로라 바이올렛/틸/핑크를 *액센트로만*;
  바디 틸은 톤 낮춤). 풀채도 사탕색 지양.
- **장식 밀도↓** — 별/완드/티아라/리본을 간결하게 (작은 사이즈 가독성).
- **두꺼운 검정 외곽선 → 얇고 부드럽게**, 살짝 오로라 rim glow (`--shadow-glow` 호응).
- **head-only mark는 진짜 단순화 버전으로 별도 제작** (래스터 크롭이 아닌 리드로우 —
  현재 mark는 크롭 플레이스홀더일 뿐).
- 가능하면 **SVG** 동봉(크기 무관 선명). 래스터면 PNG @1x/@2x 유지 + 최종본은
  `pngquant`/`svgo`로 최적화(현재 full@2x ~0.8MB는 플레이스홀더 기준).

## 통합 — 구현됨 (플레이스홀더 에셋 기준)

마스코트 메커니즘이 배선되었습니다. 최종 리스타일 에셋은 같은 파일명으로 드롭-인 교체만 하면 됩니다.

- `AkuLauncher` = `<AkuMascot variant="mark">` (`AkuMascot.tsx`). 버튼 box는 고정(앵커 안정),
  안쪽 `<span class="aku-bob">`가 `translateY` 둥둥(`main.css`, `prefers-reduced-motion`서 정지).
  드래그/위치는 `useAkuGeometry`가 `left/top`으로 — transform과 독립 합성.
- 풀 마스코트(`variant="full"`)를 패널 헤더 · 빈 상태 · 코치마크 아이콘에 사용.
- 말풍선 팁: `useAkuTips`(빈도제한 4h · 패널 닫힘+코치마크 완료 시에만 · "그만 보기" 영구 off ·
  `aria-live=polite`, **Clippy 회피**) + `AkuTipBubble`(design-system `Popover` anchor=런처,
  충돌 플리핑·a11y). 말풍선 콘텐츠는 body로 portal → bob transform 영향 없음.
- (남음) `records/design-reviews/DR-design-024` 마스코트 항목 기록 + 최종 리스타일 에셋.
