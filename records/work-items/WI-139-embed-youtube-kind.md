# WI-139 — 임베드(YouTube/oEmbed) 아이템 kind 신설

## 문제 (User problem)

슬라이드/캔버스에 **YouTube 영상을 임베드**하고 싶다. 현재 `video` kind는 직접 미디어 파일(src) 재생용이라 YouTube watch URL을 넣을 수 없다. 별도 **임베드 kind**가 필요하다.

## 사용자 결정

- 별도 **임베드/oEmbed kind 신설** (기존 video 확장이 아님)
- Rule 6: weave-로컬 도메인 kind로 `domain-kinds.ts` 레지스트리에 1엔트리 + 파생 (qr/chart와 동일 패턴, agocraft `onUnknown:"preserve"`로 직렬화)

## 스코프

- **kind = `embed`** (YouTube 우선, **provider 레지스트리로 확장 가능** — Rule 6: 제공자 추가 = 엔트리 1개)
- **MVP = URL → 영상 ID 파싱 → iframe 임베드**. 네트워크 fetch 없음(견고, sandbox 호환). 저장은 사용자 입력 `url`; embed src는 provider 레지스트리로 **렌더 시 파생**(URL 바뀌면 재파생).
- YouTube URL 폼 지원: `watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/`.
- 속성: `url`, `provider?`(파생), `title?`(후속 oEmbed), `allowFullscreen?`, `opacity?`.

### Out of scope (후속)
- oEmbed fetch(제목/썸네일 메타데이터) — 네트워크 필요.
- Vimeo 등 추가 provider(레지스트리 엔트리로 손쉽게 추가 가능하나 이번엔 YouTube만).
- 재생 타임스탬프/자동재생 정책 고급 옵션.

## 산출물 / Touch points (qr kind 패턴 미러)

1. `types.ts` — `DomainKind += "embed"`, `EmbedAttrs`, `ItemAttrsByKind.embed`
2. `embed/providers.ts` — provider 레지스트리(YouTube parse → embed URL) + 테스트
3. `domains/EmbedBlock.tsx` — iframe/placeholder 렌더 + `domains/index.ts` export
4. `domain-kinds.ts` — SPECS `embed` 엔트리(meta/renderer/defaultAttrs/participatesInZorder)
5. `toolbar/sections/embed-section.tsx` + `sections/index.ts` 등록
6. `DesignHeader.tsx` — 추가 메뉴 + 드래그(`application/x-weave-add-kind`)
7. `use-selection-chrome-registry.ts` — frame-default VM에 `embed` 추가
8. `weave-capabilities.ts` + `weave-command-schemas.ts` kindEnum — 에이전트 노출
9. 테스트(provider parse, kind 등록, corner-radius adapter null 등)

## 워크플로

Discovery → **Feasibility: FEASIBLE** (qr/chart가 weave-로컬 kind 선례; iframe 임베드는 표준; URL 파싱은 순수 로직) → Risk(아래) → Engineering Plan(`features/embed-item/ENGINEERING_PLAN.md`) → Build

## Risk (요약)

- **보안(iframe)**: 신뢰 도메인(YouTube)만 embed src 생성(provider allow-list). 임의 URL은 placeholder. `sandbox`/`allow` 속성 최소권한. → security 검토 항목.
- **프레젠트/내보내기**: iframe은 정적 export(PDF/이미지)에서 렌더 안 됨 — placeholder/썸네일 폴백 후속.
- **개인정보**: YouTube iframe이 클라이언트 IP/쿠키 노출 → `youtube-nocookie.com` 임베드 도메인 사용 검토.

## 상태

- [x] 문제/스코프/결정
- [x] touch-point 맵(qr 추적)
- [x] 엔지니어링 플랜(`features/embed-item/ENGINEERING_PLAN.md`) + DR-094
- [x] **Build 완료** — types, provider 레지스트리, EmbedBlock, SPECS, embed-section, 추가 메뉴, 선택 크롬, 에이전트 capability+schema, 테스트
- [ ] (후속) oEmbed 메타, export 썸네일 폴백, 에디터 미리보기 재생, provider 추가

## 검증

- typecheck·Biome 클린, 단위 테스트 **782건 통과**(provider 5 + kind 등록 4 + corner-radius embed), 프로덕션 빌드 성공.
- 라이브(실제 iframe 재생 / 추가→URL 붙여넣기 UX)는 샌드박스 네트워크(youtube-nocookie 접근 불가) 제약으로 네트워크 환경에서 재검증 필요.
