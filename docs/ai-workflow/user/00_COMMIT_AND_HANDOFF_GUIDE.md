# 작업 저장·커밋·인계 가이드

> 개발을 잘 모르는 사람도 `어디까지 저장되었고 다음 사람이 어디서 시작해야 하는지` 확인할 수 있도록 만든 가이드다.

## 핵심 개념 세 가지

### 1. 템플릿

반복해서 복사해 사용하는 빈 양식이다. 원본을 직접 채우지 않는다.

```text
templates/03_PLAN_TEMPLATE.md
templates/ADR_TEMPLATE.md
templates/PR_TEMPLATE.md
```

### 2. 작업 폴더

특정 기능이나 버그 하나에 대한 입력, 계획, 결과를 모아놓는 폴더다.

```text
work-items/2026-09-16-payment-timeout/
```

### 3. STATUS.md

작업 폴더의 목차이자 현재 위치 표시다. 전체 문서를 읽기 전에 이 파일을 먼저 본다.

```text
현재 상태: VERIFYING
마지막 완료: 구현 단계 1
다음 행동: timeout 통합 테스트
현재 담당자: 김민수
```

---

# 새 작업을 시작할 때

AI에게 다음처럼 요청한다.

```text
새 작업을 초기화해 주세요.

작업 이름: 결제사 응답 지연 시 중복 결제 방지
관련 이슈: #142
담당자: 김민수
예상 브랜치: fix/payment-timeout

`ai/00_INITIALIZE_WORK_ITEM.md`와
`templates/WORK_ITEM_STATUS_TEMPLATE.md`를 사용하세요.

아직 프로덕션 코드를 수정하거나 커밋하지 마세요.
```

AI가 작업 폴더를 만든 뒤 `01_TASK_INPUT.md`를 작성한다.

---

# 언제 커밋하는가

커밋은 작업을 안전하게 되돌리고 다른 사람이 이어받을 수 있는 체크포인트다. 모든 대화마다 커밋하지 않고, 의미 있는 상태가 완성될 때 커밋한다.

## 권장 체크포인트

| 시점 | 함께 저장할 것 | 커밋 메시지 예시 |
|---|---|---|
| 작업 입력과 계획 승인 | 입력, 최종 계획, 계획 검토, STATUS | `docs(payment): approve timeout handling plan` |
| ADR 승인 | Accepted ADR, STATUS | `docs(payment): record idempotency decision` |
| 구현 단계 1 완료 | 코드, 테스트, 단계 보고, STATUS | `refactor(payment): classify unknown provider results` |
| 구현 단계 2 완료 | 코드, 테스트, 단계 보고, STATUS | `fix(payment): keep unknown payments pending` |
| 리뷰 수정 완료 | 수정 코드, 회귀 테스트, 리뷰 결과, STATUS | `fix(payment): prevent concurrent duplicate attempts` |
| PR 준비 완료 | 검증, PR 초안, 이해 문서, STATUS | `docs(payment): prepare timeout change for review` |

## 같은 커밋에 넣는 이유

다음 네 가지는 가능한 한 함께 커밋한다.

```text
코드
테스트
해당 단계 보고서
STATUS.md
```

코드만 커밋하고 상태 문서를 나중에 수정하면 다음 사람이 오래된 상태를 볼 수 있다. 반대로 상태 문서만 완료로 표시하고 코드가 없으면 잘못된 인계가 된다.

---

# 작업을 중간에 넘겨야 할 때

## 가능하면 먼저 체크포인트를 만든다

- 현재 단계가 정상 실행되는가?
- 관련 테스트를 실행했는가?
- 단계 보고를 작성했는가?
- `STATUS.md`를 갱신했는가?
- 브랜치를 원격 저장소에 push했는가?

팀이 허용한다면 미완성 작업은 기능 브랜치에 WIP 커밋으로 저장할 수 있다. WIP 커밋은 main에 직접 병합하지 않는다.

예:

```text
wip(payment): save timeout investigation for handoff
```

## 커밋할 수 없는 미완성 상태라면

미커밋 상태를 인계할 수는 있지만 같은 컴퓨터와 같은 worktree를 사용해야 할 가능성이 높다. 다른 컴퓨터에서 이어갈 사람에게는 미커밋 변경이 전달되지 않는다.

`STATUS.md`에 반드시 다음을 기록한다.

```text
- unstaged 변경: payment.service.ts, payment-timeout.test.ts
- 아직 통과하지 않은 테스트: timeout 통합 테스트
- 깨진 상태: payment.service.ts가 새 타입을 사용하지만 타입 정의는 미완성
- 다음 행동: provider-result.ts의 Unknown 타입을 추가한 뒤 typecheck 실행
```

가능하면 이런 상태에서는 다른 사람이 구현을 바로 시작하지 않고 먼저 현 상태를 확인하게 한다.

---

# 다른 사람이 작업을 이어받을 때

AI에게 다음처럼 요청한다.

```text
다음 작업을 이어받으려고 합니다.

작업 폴더:
`docs/ai-workflow/work-items/2026-09-16-payment-timeout/`

다음을 읽으세요.

- 작업 폴더의 `STATUS.md`
- `ai/00_RESUME_WORK_ITEM.md`

현재 Git 브랜치, HEAD 커밋, staged/unstaged/untracked 변경을 상태 파일과
대조하세요. 완료된 결과 파일과 테스트가 현재 코드에도 유효한지 확인하세요.

아직 코드를 수정하지 말고 작업 재개 요약만 작성하세요.
```

AI의 재개 요약에서 다음을 확인한다.

- 상태 파일의 브랜치와 실제 브랜치가 같은가?
- 완료된 단계의 코드와 결과 문서가 존재하는가?
- 마지막 테스트 이후 코드가 바뀌지 않았는가?
- 미커밋 파일이 있는가?
- 현재 담당자가 아직 작업 중인가?
- 다음 단계가 무엇인가?
- 구현 전에 승인해야 할 것이 있는가?

일치하지 않으면 구현을 승인하지 않고 먼저 상태를 정리한다.

---

# PR을 만들 때

PR을 만들기 전 `STATUS.md`는 일반적으로 다음 상태 중 하나다.

```text
READY_FOR_PR
PR_REVIEW
READY_TO_MERGE
```

PR 설명에는 작업 폴더의 문서를 모두 복사할 필요가 없다. 중요한 결과만 PR 템플릿에 요약하고, 계획·ADR·검증 문서를 링크한다.

## PR 리뷰 중 수정이 생기면

1. 상태를 `CHANGES_REQUESTED`로 변경한다.
2. 수정할 항목과 담당자를 기록한다.
3. 코드를 수정하고 테스트한다.
4. 리뷰 지적과 해결 결과를 기록한다.
5. STATUS를 `REVIEWING` 또는 `READY_TO_MERGE`로 갱신한다.

---

# 병합 후

병합 전 마지막 브랜치 상태는 `READY_TO_MERGE`다. 병합 후 다음을 기록할 수 있으면 기록한다.

- PR 번호와 링크
- 병합 커밋
- 병합일
- 배포 버전과 시간
- 배포 후 확인 결과
- 남은 후속 작업

그다음 상태를 `DONE`으로 변경한다.

팀에서 병합 후 문서 전용 커밋을 만들고 싶지 않다면 다음 중 하나를 선택한다.

1. 병합 직전 상태 파일에 PR 번호와 예정 배포 정보를 기록하고, 최종 병합 정보는 이슈나 PR에서 관리한다.
2. 주기적인 문서 정리 PR에서 완료 작업의 병합 정보를 일괄 갱신한다.
3. 작업 폴더는 `READY_TO_MERGE` 상태로 보존하고, PR의 merged 상태를 최종 사실로 사용한다.

팀은 한 가지 방식을 선택하여 일관되게 사용한다.

---

# 작업을 새로 시작할 때 초기화의 의미

초기화는 기존 작업 문서를 지우는 것이 아니다. 새 작업 폴더를 만들고 템플릿을 다시 복사하는 것이다.

```text
기존 작업:
work-items/2026-09-16-payment-timeout/

새 작업:
work-items/2026-09-20-refund-notification/
```

완료된 작업은 기록으로 남긴다. 템플릿 원본만 계속 재사용한다.

---

# 한눈에 보는 인계 체크리스트

- [ ] 작업 폴더가 있다.
- [ ] STATUS.md의 마지막 갱신 시간이 최신이다.
- [ ] 현재 브랜치와 HEAD가 기록되어 있다.
- [ ] 미커밋 파일이 기록되어 있다.
- [ ] 마지막 완료 단계가 결과 문서와 일치한다.
- [ ] 테스트가 어느 코드 버전에서 실행되었는지 안다.
- [ ] 해결되지 않은 리뷰 문제가 기록되어 있다.
- [ ] 현재 담당자와 작업 잠금이 표시되어 있다.
- [ ] 다음 사람이 먼저 읽을 파일이 적혀 있다.
- [ ] 다음 행동과 필요한 승인이 적혀 있다.
