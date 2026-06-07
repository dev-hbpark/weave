# WI-140 — QR 중앙 로고(아이콘) 오버레이

Status: **Done**
Owner: hbpark
Updated: 2026-06-07
선행: [WI-058](WI-058-qr-code-item.md) (qr kind), [FR-012](../feasibility-reviews/FR-012-qr-code-item.md) (로고 v1 제외 — "EC=H 필요")

## Problem

WI-058 v1은 로고 오버레이를 의도적으로 보류했다(FR-012: 스캔성 위해 EC=H 필요). QR 중앙 로고는
브랜드 식별을 크게 높이는 보편 기능이고, 현재 `qr` 렌더는 단일 SVG라 오버레이 추가가 저비용이다.
신규 kind가 아니라 **기존 `qr` kind 확장**이다.

## 핵심 리스크 — 스캔성 (설계로 방어, 옵션 아님)

로고는 중앙 모듈을 가린다. 복원 능력은 EC 종속(L 7% / M 15% / Q 25% / H 30%). 3중 방어를 기능
정의에 포함한다:

1. **크기 상한**: 로고를 전체 면적의 **약 20% 이하**(가로 비율 ≤ 0.25)로 클램프. UI에서 초과 확대 불가.
2. **EC 자동 상향**: 로고 ON 시 EC를 최소 `Q`(권장 `H`)로 끌어올림 + 사용자에게 경고/안내.
3. **녹아웃(quiet patch)**: 로고 뒤에 배경색 둥근 사각형을 깔아 모듈과 분리(단순 알파 오버레이보다 인식률↑).

## Scope

- **v1: 내장 아이콘 세트만.** 디자인시스템 `Icon*` 화이트리스트에서 선택. 저장은
  `logo: { iconId, scale, padding }` 메타뿐 → **blob 스토리지/보안 이슈 없음, 무손실 라운드트립.**
- **v2(보류): 사용자 이미지 업로드.** `image` kind처럼 blob resource(`resourceKey`/`blobPath`) 경유 필요.
  ⚠️ `apps/web/CLAUDE.md`의 **계정 없는 전역 공유 워크스페이스** 모델상 보안·쿼터 검토 추가 필요.
  data-URL 인라인 저장은 문서 비대화로 지양. → 별도 WI로 분리.

## Model (`QrAttrs.logo?`, types.ts 확장)

```ts
readonly logo?: {
  readonly iconId: string;        // 디자인시스템 아이콘 화이트리스트 id
  readonly scale?: number;        // 0..0.25 클램프 (기본 ~0.2), 전체폭 대비
  readonly padding?: number;      // 녹아웃 둥근사각형 여백(모듈 단위, 기본 0.5)
};
```

`onUnknown:"preserve"`로 agocraft 직렬화 무변경. 매트릭스는 기존대로 비저장(렌더 시 재생성).

## Edits (모두 weave-side, qr 미러)

| Area | File |
|---|---|
| 모델 | `document/types.ts` (`QrAttrs.logo?`) |
| 렌더 | `document/domains/QrBlock.tsx` (SVG 위 녹아웃 `<rect rx>` + 아이콘 `<g>`/`<image>`, 중앙=`total/2`, scale 클램프) |
| 툴바 | `toolbar/sections/qr-section.tsx` (아이콘 피커 + 크기 슬라이더 + 로고 ON 시 EC 자동상향/경고) |
| 에이전트 | `weave-command-schemas.ts` `QR_ATTRS_NOTE`에 logo 필드 + 스캔성 가이드 |
| 테스트 | e2e `qr-item.spec.ts`에 로고 on/off + Cmd+Z 1건; qr-matrix는 불변(로고는 렌더 전용) |

`agocraft-mirror.ts isDomainItem`은 이미 `qr` 포함 — **변경 없음**(신규 kind 아님).

## Design System Triage

아이콘 피커가 신규 컴포넌트면 design-review 1건 필요. 기존 GridPicker/Select 패턴 재사용 가능하면
extend로 처리. (Build 진입 전 트리아지 수행 — DR-095 §디자인 참고.)

## Build (실제 적용)

신규 파일: `qr/qr-logo.ts`(순수 헬퍼: `clampLogoScale`/`raiseEc`/`recommendedEcForLogo`/
`effectiveQrEcLevel`), `qr/qr-logo-icons.tsx`(아이콘 화이트리스트 Map 레지스트리, Rule 6),
`qr/qr-logo.test.ts`. 수정: `types.ts`(`QrAttrs.logo`), `QrBlock.tsx`(녹아웃 rect + 중첩 `<svg>`
아이콘 + EC 플로어 + `data-qr-logo` 마커), `qr-section.tsx`(로고 Select + 크기 NumberSlider +
EC 자동상향/경고문), `weave-command-schemas.ts`(QR_ATTRS_NOTE).

디자인 트리아지 결과 = **reuse**(기존 Select/NumberSlider) → design-review 불필요.

### 에이전트 스키마 점검 (후속 보강)

최초 빌드는 `weave-command-schemas.ts`의 1줄 NOTE(QR_ATTRS_NOTE)만 갱신했으나, 에이전트가
읽는 **정본 모델은 `weave-capabilities.ts`의 `qr` itemKind**(description + `editableAttrs`)임.
점검 결과 `logo`가 누락되어 있어 보강:
- `qr` capability `description`에 logo(아이콘 enum/scale/EC≥Q 자동) 추가
- `editableAttrs`에 `"logo"` 추가
- attrs 검증은 `ATTRS_WITH_TEXT_NOTE`가 `additionalProperties:true`(open bag)라 `weave.item.add`
  (attrsOverride) / `weave.item.update`(attrs) 모두 logo를 이미 기계적으로 수용 — 거부 없음 확인.
- `diversity-metric.ts` qr 색상 수집은 fg/bg만 보면 됨(로고는 자체 색 없음 — 아이콘=fg, 녹아웃=bg)
  → 변경 불필요 확인.
검증: `weave-capabilities.coverage` 등 agent 테스트 **66/66**, typecheck·biome 클린.

## Verification (Continuous Self-Verification 게이트 통과)

- typecheck(@weave/web) green. biome 변경파일 0 errors.
- 단위 `qr-logo.test.ts` **8/8**(scale 클램프, EC 플로어/상향) + `qr-matrix.test.ts` 5/5 = 13/13.
- e2e `qr-item.spec.ts` **3/3** (신규 "WI-140 — centre logo overlays + Cmd+Z reverts" 포함, 라이브 chromium).
- 참고: 레포 전체 `declarativecheck`는 **기존 3건**(derive-text-auto-resize / use-weave-editor /
  PresentPage) FAIL — 본 변경과 무관(레지스트리 사용, 신규 위반 0).

## Workflow trail

- 선행 Feasibility: [FR-012](../feasibility-reviews/FR-012-qr-code-item.md) (로고 = FEASIBLE, EC=H 조건).
  규모가 작아 FR 재작성 대신 본 WI + [DR-095](../decisions/DR-095-qr-center-logo.md).
