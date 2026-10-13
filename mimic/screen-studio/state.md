단계: 5
상태: 진행중
테스트 명령: npm run verify -- --quick

# feature-mimic: Screen Studio → Recordly 개인용

- 내 앱: Recordly 개인용 (C:\Users\gusql\screen-studio-vibe-coding\recordly, Windows, 브랜치 personal-v2)
- 참고 제품: Screen Studio 4.0.4 (screen.studio, macOS 전용)
- 가져올 기능: 전체
- 해자 기능: 없음 (사용자 지정 없음 → 기본값, 2026-10-13)
- 모드: 꼼꼼 (전체 범위라서)
- 용도: 개인용 (결과 영상만 상업 사용, 앱은 배포 안 함)
- 디자인 방향: A 겉모습 전부 모방 (사용자 지시 "screen studio와 최대한 똑같게", 2026-10-06)

## 도구 점검 (0-1)
- 참고 제품 직접 실행: 불가 — macOS 전용, 이 PC는 Windows. 대신 공식 가이드 영상 26개 프레임(scratchpad s7ref) + 가이드 70쪽 + changelog 4.0 + 홈페이지로 탐색.
- REA: 참고 제품 바이너리 없음(맥 앱). 내려받기 페이지 열기 금지 규칙(10-11) 때문에 dmg 받지 않음 → REA로 참고 제품 분석 안 함.
- Playwright: 내 앱은 렌더러 전용 Playwright(tests/ui) + verify.

## 진행
- [x] 1-1 자료 수집: docs/*.txt (가이드 70쪽), docs/changelog-4.0.txt, docs/homepage-features.txt
- [x] 1-3 대조표 compare.md: 151개 / 같음 78 / 다름 37 / 없음 22 / 해당없음 12 / 미확인 2
- [ ] 빠진 것 묶음 계획 → 사용자 승인
- [x] 디자인 오류 점검 design-check.md: 실제 오류 3 (줌 탭 단어 끊김, 1280 창 카메라·자막 잘림, Ctrl+K 잘림), 시험용 가짜 데이터 탓 2(영어), 의심 1(소스 창 흰 화면)
- [ ] 9묶음 승인 대기 (personal/PLAN.md)
