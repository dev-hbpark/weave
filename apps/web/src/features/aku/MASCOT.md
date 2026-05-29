# 아쿠 (Aku) 마스코트 에셋

아쿠는 **둥둥 떠다니는 캐릭터 마스코트**로, 말풍선으로 팁을 주고 클릭하면 패널을 엽니다
(컨셉 결정: WI-053 / DR-design-024). 이 문서는 **에셋 규격**만 다룹니다 — 둥둥 애니메이션 /
말풍선 tip-controller / 런처 교체 같은 **메커니즘 구현은 별도**(에셋 확정 후).

## 파일 (`apps/web/public/aku/`)

런타임에서는 `/aku/<name>` 로 정적 참조합니다 (Vite `public/`).

| 파일 | 크기 | 용도 |
|---|---|---|
| `mascot-mark.png` / `mascot-mark@2x.png` | 128² / 256² | **런처**(접힌 상태, 작은 사이즈) — 얼굴 중심 bust |
| `mascot-full.png` / `mascot-full@2x.png` | 512² / 1024² | **패널 헤더 · 빈 상태 · 코치마크** — 전체 캐릭터 |

2-tier 이유: 전체 캐릭터(완드·티아라·리본·별)는 ~48px 런처에서 디테일이 뭉개지므로,
런처에는 얼굴 위주의 단순화 mark를, 큰 표시에는 풀 캐릭터를 씁니다.

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

## 통합 계획 (에셋 확정 후, 별도 작업)

- `AkuLauncher`의 알약 → `<AkuMascot src="/aku/mascot-mark.png">`. 바깥 wrapper=위치/드래그
  (`useAkuGeometry`), 안쪽=`translateY` 둥둥 transform 합성. `prefers-reduced-motion`서 정지.
- 풀 캐릭터를 패널 헤더 · 빈 상태 · 코치마크 아이콘(현 `IconSparkle`)에 일관 사용.
- 말풍선 팁: wrapper에 anchor(`OnboardingCoachmark` 재사용) + tip-controller(빈도제한 ·
  "다시 안 보기" · `aria-live=polite`). **Clippy 회피가 핵심.** 말풍선엔 backdrop-filter blur
  금지(애니메이팅 transform 조상 아래 드롭 버그).
- 공개 브랜드 surface → `records/design-reviews/DR-design-024` 에 마스코트 항목으로 기록.
