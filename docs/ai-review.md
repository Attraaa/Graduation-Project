# 하루당 총평

**AI 총평**에서 날짜 하나를 고르거나 시작일과 종료일을 선택해 최대 7일을 함께 볼 수 있습니다. **총평 받기**를 누르면 선택한 기간의 관측 결과를 미니 PC의 Ollama `gemma3:4b`에 전달합니다. 조언에는 해당 점수의 날짜나 측정 구간, 비교한 수치를 함께 표시합니다.

## 집계 방식

- 데스크톱은 계정별 `posture-timelines/account-<id>/`의 기존 1초 JSONL과 세션 요약을 읽습니다. 브라우저는 같은 형식으로 IndexedDB를 읽습니다. 서버에만 있는 상체 기록은 기존 학습이력의 분 단위 기록으로 읽고, 같은 세션·항목은 기기의 기록을 우선합니다.
- 날짜 경계로 측정 시간을 자른 뒤, 시간순으로 세션을 잇고 사이에 측정하지 않은 시간은 뺍니다. 한 항목에서 누적 측정의 마지막 10분과 이전 구간에 유효 관찰이 각각 1분 이상 있고 평균이 3점 이상 달라질 때 후반 변화를 표시합니다. 두 평균은 관찰 시간으로 가중합니다. 같은 날짜 안에 해당 항목의 점수 기준이 바뀌면 변화량 판단을 보류합니다. 시간별 데이터 없이 세션 요약만 남은 경우에는 하루 평균에 사용할 수 있습니다.
- 여러 날을 선택하면 같은 점수 기준으로 관찰한 날짜끼리 비교합니다. 기록이 비어 있는 날은 건너뛰고 실제 비교한 날짜를 표시합니다. 잘한 점에는 관찰된 높은 자세 점수와 유효한 개선 구간을 표시합니다.
- 안구는 그날의 분당 깜빡임과 관찰 시간을 표시합니다. 타자는 그날의 판정과 키별 집계를 사용합니다. 원본 JSONL, 영상, 개별 키 입력 순서, 로그인 정보는 미니 PC에 전달하지 않습니다.

## AWS 및 미니 PC

AWS의 기본 API나 독립 총평 서비스를 최신 버전으로 배포하기 전에 실제 앱 DB에 `server/migrations/006_account_protection.sql`을 적용합니다. 기존 DB를 백업하고 `users.session_version`, `request_limits`, `request_leases`의 생성 여부를 확인합니다.

AWS의 `MOTI_REVIEW_GATEWAY_URL`은 비공개 HTTPS 게이트웨이의 전체 `/review` 주소입니다. 미니 PC는 기존처럼 `{"record":"…"}`를 받고 `{"summary":"…","model":"gemma3:4b"}`를 반환합니다. 현재 게이트웨이가 설치된 미니 PC에 [새 시스템 프롬프트](../server/minipc/system-prompt.txt)를 전송한 뒤 기존 `~/moti-minipc-llm/samples/system-prompt.txt`를 백업하고 교체합니다. 게이트웨이는 요청마다 프롬프트 파일을 읽습니다. 독립 총평 서비스는 `npm run build` 후 `PORT`를 지정하고 `node dist/reviewServer.js`로 실행합니다. nginx의 총평 프록시 읽기 시간 제한은 100초 이상입니다.

미니 PC에 적용할 때는 PowerShell에서 `$miniHost`를 실제 SSH 계정과 호스트로 바꾸고, 저장소 루트에서 실행합니다.

```powershell
$miniHost = 'user@mini-pc'
scp 'server/minipc/system-prompt.txt' "${miniHost}:~/moti-minipc-llm/samples/system-prompt.daily.txt"
ssh $miniHost
```

미니 PC의 셸에서 프롬프트를 교체합니다.

```bash
cd ~/moti-minipc-llm/samples &&
  test -s system-prompt.daily.txt &&
  cp -p system-prompt.txt "system-prompt.$(date +%Y%m%d-%H%M%S).bak" &&
  mv -T system-prompt.daily.txt system-prompt.txt
```
