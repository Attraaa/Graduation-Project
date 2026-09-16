# 00-A. AI용 새 작업 초기화 지침

## 역할

새 개발 작업을 시작할 때 워크플로 원본 템플릿을 수정하지 않고, 작업 전용 폴더와 상태 파일을 만든다. 아직 프로덕션 코드는 수정하지 않는다.

## 사용자에게 필요한 최소 정보

- 작업 이름 또는 해결하려는 문제 한 문장
- 관련 이슈 번호가 있으면 해당 번호
- 담당자 또는 현재 작업자 이름
- 사용할 브랜치 이름이 이미 있으면 해당 이름

정보가 일부 없어도 안전하게 만들 수 있다. 없는 값은 `미정`으로 표시하고 임의로 사실을 만들지 않는다.

## 작업 폴더 이름

다음 형식을 권장한다.

```text
docs/ai-workflow/work-items/YYYY-MM-DD-short-name/
```

예:

```text
docs/ai-workflow/work-items/2026-09-16-payment-timeout/
```

이슈 번호가 있으면 포함할 수 있다.

```text
docs/ai-workflow/work-items/2026-09-16-issue-142-payment-timeout/
```

## 생성할 구조

```text
work-items/YYYY-MM-DD-short-name/
├─ STATUS.md
├─ 01_TASK_INPUT.md
├─ 03_PLAN.md
├─ 04_PLAN_REVIEW.md
├─ adr/
├─ step-reports/
├─ 09_VERIFICATION.md
├─ 10_INDEPENDENT_REVIEW.md
├─ 11_PR_DRAFT.md
├─ 12_HANDOFF.md
├─ 13_UNDERSTANDING.md
├─ 16_FINAL_APPROVAL.md
└─ 17_RETROSPECTIVE.md
```

## 초기화 방법

1. `templates/WORK_ITEM_STATUS_TEMPLATE.md`를 `STATUS.md`로 복사한다.
2. `user/01_TASK_INPUT.md`를 작업 폴더의 `01_TASK_INPUT.md`로 복사한다.
3. `templates/03_PLAN_TEMPLATE.md`를 `03_PLAN.md`로 복사한다.
4. `user/04_PLAN_REVIEW.md`를 `04_PLAN_REVIEW.md`로 복사한다.
5. `user/13_CODE_UNDERSTANDING_WORKSHEET.md`를 `13_UNDERSTANDING.md`로 복사한다.
6. `user/16_FINAL_APPROVAL.md`를 `16_FINAL_APPROVAL.md`로 복사한다.
7. 나머지 결과 파일은 해당 단계가 시작될 때 만들거나 빈 제목만 둔다.
8. 원본 `user/`, `ai/`, `templates/` 파일은 수정하지 않는다.

## STATUS.md 초기값

- 작업 상태: `INPUT_DRAFT`
- 현재 단계: `01 작업 입력 작성`
- 다음 행동: `사용자가 01_TASK_INPUT.md를 작성`
- 마지막 완료 단계: `없음`
- 브랜치·담당자·이슈: 아는 범위에서 기록
- 미해결 질문: 입력에서 확인되지 않은 내용

## Git 처리

- 사용자가 커밋을 요청하지 않았다면 초기화 파일을 생성한 뒤 커밋하지 않는다.
- 기존 작업 트리에 관련 없는 변경이 있는지 확인하고 덮어쓰지 않는다.
- 브랜치를 자동 생성하거나 전환하지 않는다. 사용자의 명시적 요청 또는 저장소 규칙을 따른다.

## 완료 보고

```md
## 작업 초기화 완료

- 작업 폴더:
- 상태 파일:
- 현재 단계:
- 다음 사용자 행동:
- 아직 정하지 않은 정보:
- Git 변경 상태:
```
