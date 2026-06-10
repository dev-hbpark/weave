# Risk Notes — 델타 저장 선결: 패치 스트림 완결성 (WI-156)

관련: [WI-156](../../records/work-items/WI-156-delta-persistence-patch-completeness.md) · [DR-112](../../records/decisions/DR-112-delta-persistence-patch-completeness.md)

## 범위 한정 (가장 중요한 리스크 통제)

본 WI는 **패치 완결성만** 확보하고 **persist/전송 경로는 건드리지 않는다**(full-blob 유지). 즉 사용자
체감 동작·저장 결과는 P3까지 **무변경**이어야 한다. 실제 델타 전송은 별도 WI에서 이 토대 위에 올린다.
이 경계를 지키는 것이 회귀 리스크를 가장 크게 낮춘다.

## 리스크 항목

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | envelope를 doc.attrs로 옮기며 **이중 진실원천**(wrapper vs doc.attrs) 일시 불일치 | rename/resize가 화면/저장에 어긋나게 반영 | wrapper-mirror를 단일 파생지점으로 강제(`use-design.ts:447-490` 확장). 직접 envelope setter 전면 제거. mirror 동기 테스트. |
| R2 | 기존 저장 디자인(envelope에 title/size 보유, doc.attrs엔 없음)의 **하위호환** | 옛 디자인 로드 시 title/size 유실 | 로드 시 envelope→doc.attrs 마이그레이션(읽기 시 doc.attrs 비면 envelope에서 시드). `onUnknown:"preserve"` 라운드트립 유지. 마이그레이션 round-trip 테스트. |
| R3 | doc.reset "스냅샷 경계" 표식을 **소비자가 아직 없음** | 표식이 死코드처럼 보일 수 있음 | 계약을 DR-112/플랜에 문서화하고 표식만 발행. 후속 WI(장애물 C) 소비자가 즉시 사용. 死코드 아님 — 계약 표면. |
| R4 | 완결성 게이트가 **일부 변경 유형 누락** → "A 해결" 오판 | 후속 델타 전송에서 특정 변경 유실 | P3 게이트가 전 변경 유형(add/move/resize/text/remove/reparent/doc.attrs/setTitle/resize) 망라. CI 게이트화 — 새 mutation surface가 무손실성 깨면 red. |
| R5 | aku 에이전트가 신설 `setTitle`/`resize` 명령을 **오용**(예: 매 틱 resize) | 패치 폭주 | History merge(같은 transaction 폴딩) + 디바운스. 스키마 설명에 용도 명시. 기존 `setBackground` 동형이라 새 위험 표면 아님. |
| R6 | Decommission(P0) 중 stale 주석 정정이 **실제 동작 가정**과 어긋남 | 잘못된 정본화 | P0는 주석만 — 코드 동작 0 변경. drift 검증(주석↔코드 일치)로 확인. |

## 보안 / 데이터

- 신규 네트워크 표면 없음(persist 경로 무변경). 서버 API·KV 스키마 무변경.
- 개인정보·권한 영향 없음(문서 내부 표현 변경).

## 롤백

- P1~P3는 명령 추가 + mirror 확장 + 테스트로, persist 결과가 동일하므로 단계별 독립 롤백 가능.
- P0(주석)·P3(테스트)는 동작 무영향 — 안전.

## Launch gate 해당 여부

릴리스 동작 무변경(완결성 토대만) → 본 WI 단독으론 **launch-gate 비해당**. 실제 델타 전송을 켜는 후속
WI에서 launch-gate(저장 정합성·하위호환·비용) 수행.
