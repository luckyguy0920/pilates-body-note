# 체성분 처방 노트 · 필라테스클리닉

회원이 인바디 270 측정 후 QR로 접속해 결과지 숫자 4개를 입력하면, 체형 판정과 식사·운동·휴식 처방을 한 페이지로 보여줘요.

## 지점별 주소 (QR)
| 지점 | 주소 | 상태 |
|---|---|---|
| 송정점 | https://luckyguy0920.github.io/pilates-body-note/ | 출력·배치 완료 (2026-11-01). 주소 변경 금지 |
| 구영점 | https://luckyguy0920.github.io/pilates-body-note/?b=guyeong | 출력 전 |
| 달동점 | https://luckyguy0920.github.io/pilates-body-note/?b=daldong | 출력 전 |

주소 끝에 `?b=` 가 없으면 송정점으로 기록돼요. `?b=songjeong` 도 송정점으로 인식해요.

QR 이미지는 `qr/` 폴더에 있어요.

## 기록 저장
- 회원 구분: 휴대폰 번호 + 출생연도
- 저장 위치: 센터 구글 시트 (`측정기록`, `회원` 탭). 행마다 측정 지점이 찍혀요.
- 저장 코드: `apps-script/Code.gs` (구글 시트 > 확장 프로그램 > Apps Script 에 붙여넣고 웹 앱으로 배포)
- 판정·처방 규칙: `index.html` 안의 `PC` 모듈, 페이지 하단 '판정 기준 보기'와 같은 내용
