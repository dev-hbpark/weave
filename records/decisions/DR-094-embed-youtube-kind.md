# DR-094 — 임베드(YouTube) 아이템 kind `embed`

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-139, `features/embed-item/ENGINEERING_PLAN.md`
- 선례: qr/chart(weave-로컬 kind), video(미디어 렌더)

## 결정

1. **weave-로컬 `embed` kind 신설**(qr/chart 패턴). agocraft 빌트인 아님 → `onUnknown:"preserve"`로 직렬화(직렬화 경로 무변경). `domain-kinds.ts` SPECS 1엔트리 + 컴파일러 exhaustiveness가 누락 방지.
2. **provider 레지스트리**(`document/embed/providers.ts`, Rule 6): URL→embed 변환을 렌더러 내 분기 대신 provider 어댑터로. YouTube가 첫 provider. 추가(Vimeo 등) = 엔트리 1개.
3. **embed src 비저장**: `attrs.url`(사용자 입력)만 저장, iframe `src`는 `resolveEmbed(url)`로 **렌더 시 파생**. URL 편집이 곧 재파생 → 드리프트 없음, allow-list 외 URL은 src 미생성(보안).
4. **YouTube → `youtube-nocookie.com/embed/<id>`**: privacy-enhanced 도메인(재생 전 쿠키 없음). `watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/`에서 11자 id 파싱.
5. **"선택 후 클릭에서만 재생"** (갱신): 에디터에서 iframe은 **선택 전 inert**(`pointer-events:none`) → 첫 클릭은 프레임을 선택, **선택된 상태에서만 interactive** → 다음 클릭이 재생. 프레젠트/읽기전용(`onUpdate===undefined`)은 항상 interactive(바로 재생). `EmbedBlock`이 `useSelection()`(provider 없으면 no-op 폴백)로 자기 `item.id` 선택 여부 판정: `interactive = onUpdate===undefined || selectedIds.has(item.id)`. 이동/리사이즈는 선택 핸들(iframe 위)로. iframe `allow` 최소권한 + `referrerPolicy`.
6. **추가 UX**: 추가 메뉴에서 빈 embed 생성(video처럼 파일 picker 아님) → 툴바 `embed-section`에서 URL 붙여넣기 + 인식 배지 + 전체화면 토글.

## Touch points (qr 미러, 모두 적용)

types(DomainKind/EmbedAttrs/ItemAttrsByKind) · providers(+테스트) · EmbedBlock(+domains/index) · domain-kinds SPECS · embed-section(+sections/index) · DesignHeader 추가메뉴 · selection-chrome frame-default VM · weave-capabilities + command-schemas kindEnum · 테스트(provider/kind 등록/corner-radius null).

## 트레이드오프 / 결과

- (+) Rule 6: kind 1엔트리 + provider 1엔트리로 확장. exhaustiveness가 누락 강제(에이전트 capability 빠뜨림을 빌드가 잡음).
- (+) 보안: src는 allow-list provider만 생성, nocookie 도메인, 에디터 비활성.
- (−) **에디터에서 재생 불가**(썸네일만) — 프레젠트에서 재생. 에디터 미리보기 재생은 후속(오버레이 토글).
- (−) **export(PDF/이미지)/static 캡처에서 iframe 미렌더** → 썸네일 폴백 후속.
- (−) **oEmbed 메타데이터(제목/썸네일) 미구현** — 네트워크 fetch 필요. MVP는 iframe-by-id.
- **개인정보**: nocookie + referrerPolicy로 완화하나, 재생 시 YouTube에 IP/디바이스 노출은 불가피.

## 후속

- oEmbed fetch(제목/썸네일, graceful fallback), Vimeo/Loom 등 provider, export용 썸네일 폴백, 에디터 미리보기 재생 토글, 자동재생/타임스탬프 옵션.

## 검증

782 단위 테스트(provider 5 + kind 등록 4 + corner-radius embed), typecheck·빌드·Biome 클린. 라이브(iframe 실제 재생/추가 UX)는 샌드박스 네트워크 제약으로 별도 환경.
