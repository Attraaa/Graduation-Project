# Work Items

실제 작업별 입력, 계획, ADR, 검증, 리뷰, 이해와 승인 기록을 보관한다.

권장 경로:

```text
work-items/YYYY-MM-DD/owner/task-name/
```

예:

```text
work-items/2026-09-16/minsu/payment-timeout/
```

하루에 담당자당 하나의 작업만 한다면 사용자가 원하는 짧은 구조도 가능하다.

```text
work-items/2026-09-16/minsu/
```

하지만 같은 날 같은 담당자가 여러 작업을 수행할 수 있으므로 `task-name`까지 넣는 구조를 권장한다.

사용자가 새 폴더에 `01_TASK_INPUT.md`만 작성한 뒤 Codex 또는 Claude Code에 현재 작업 폴더를 알려주면, 나머지 구조와 `STATUS.md`는 자동으로 초기화된다.

완료된 작업은 삭제하지 않고 `STATUS.md`를 `DONE`으로 표시하여 변경 이유와 검증 기록으로 보존한다.
