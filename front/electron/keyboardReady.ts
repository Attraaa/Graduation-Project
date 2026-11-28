import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

const modelStages = ['MOTI_KEYBOARD_LOADING hands', 'MOTI_KEYBOARD_LOADING layout'];

/** Only the spawned child's stdout can announce the address after it has bound the socket. */
export function waitForKeyboardReady(child: ChildProcessWithoutNullStreams, timeoutMs = 45_000) {
  return new Promise<number>((resolve, reject) => {
    const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let handled = false;
    let nextStage = 0;
    const exit = () => finish(Error('키보드 분석기가 준비 중에 종료됐어요. 학습에서 다시 시작해 주세요.'));
    const fail = () => finish(Error('키보드 분석기를 실행하지 못했어요. 설치 상태를 확인한 뒤 다시 시작해 주세요.'));
    const expire = () => finish(Error('키보드 분석기 준비 시간이 지났어요. 학습에서 다시 시작해 주세요.'));
    let timer = setTimeout(expire, timeoutMs);
    function finish(error: Error | null, port = 0) {
      if (handled) return;
      handled = true;
      clearTimeout(timer);
      child.removeListener('exit', exit);
      child.removeListener('error', fail);
      output.close();
      child.stdout.resume();
      if (error) reject(error); else resolve(port);
    }
    child.once('exit', exit);
    child.once('error', fail);
    output.on('line', line => {
      // A new model phase gets its own deadline. Duplicate or out-of-order output cannot keep it alive.
      if (line === modelStages[nextStage]) {
        nextStage++;
        clearTimeout(timer);
        timer = setTimeout(expire, timeoutMs);
        return;
      }
      const match = /^MOTI_KEYBOARD_READY ([0-9]{1,5})$/.exec(line);
      const port = Number(match?.[1]);
      if (port > 0 && port <= 65535) finish(null, port);
    });
    if (child.exitCode !== null || child.signalCode !== null) exit();
  });
}
