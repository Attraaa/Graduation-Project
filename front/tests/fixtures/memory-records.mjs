import { createHash } from 'node:crypto';
import { parseBatch, parseQuery, localDateKey } from '../../../database/contracts.ts';
import { parseKeyboardBatch, keyboardCountKey } from '../../../database/keyboard.ts';
import { parseEyeBatch, eyeFields, emptyEyeTotals } from '../../../database/eye.ts';

const fields = ['runMs', 'validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * In-memory stand-in for the server record API. It applies the server's acceptance rules
 * (generation, owner, idempotent sequence, bucket sums) so client tests can check what they send.
 * The real SQL, including hour/midnight aggregation, is tested in server/test/records-repository.test.ts.
 */
export class MemoryRecords {
  generations = new Map();
  posture = new Map();
  keyboard = new Map();
  eye = new Map();

  generation(owner) { return this.generations.get(owner) ?? 0; }

  #accept(store, batch) {
    const owner = batch.record.owner;
    if (batch.generation !== this.generation(owner)) throw new Error('삭제된 기록의 저장 요청입니다.');
    const previous = store.get(batch.record.id);
    if (previous && previous.record.owner !== owner) throw new Error('다른 계정의 기록입니다.');
    const hash = digest(batch), applied = previous?.digests[batch.sequence];
    if (applied !== undefined) {
      if (applied !== hash) throw new Error('같은 순번에 다른 기록이 도착했습니다.');
      return null;
    }
    if (batch.sequence !== (previous?.digests.length ?? 0)) throw new Error('기록 순서가 일치하지 않습니다.');
    if (previous && previous.record.status !== 'running') throw new Error('이미 종료된 기록입니다.');
    return { previous, digests: [...(previous?.digests ?? []), hash] };
  }

  write(input) {
    const batch = parseBatch(input), accepted = this.#accept(this.posture, batch);
    if (!accepted) return;
    const buckets = new Map(accepted.previous?.buckets);
    for (const bucket of batch.buckets) buckets.set(bucket.minute, bucket);
    for (const field of fields) {
      const sum = [...buckets.values()].reduce((total, bucket) => total + bucket[field], 0);
      if (Math.abs(sum - batch.record[field]) > Math.max(0.02, Math.abs(sum) * 1e-10)) throw new Error('요약과 시간 버킷의 합계가 일치하지 않습니다.');
    }
    this.posture.set(batch.record.id, { record: batch.record, buckets, digests: accepted.digests });
  }

  detail(owner, id) {
    const stored = this.posture.get(id);
    if (stored?.record.owner !== owner) throw new Error('기록을 찾을 수 없습니다.');
    return { record: stored.record, buckets: [...stored.buckets.values()].sort((a, b) => a.minute - b.minute) };
  }

  statistics({ owner, from, to, mode }) {
    const groups = new Map();
    for (const { record, buckets } of this.posture.values()) {
      if (record.owner !== owner || (mode && record.mode !== mode)) continue;
      for (const bucket of buckets.values()) {
        const local = new Date(bucket.minute - record.offsetMinutes * 60_000).toISOString();
        const date = local.slice(0, 10), hour = local.slice(11, 13);
        if (date < from || date > to) continue;
        const key = JSON.stringify([date, hour, record.mode, record.scorePolicyVersion, record.habitPolicyVersion]);
        const group = groups.get(key) ?? { date, hour, mode: record.mode, scorePolicyVersion: record.scorePolicyVersion,
          habitPolicyVersion: record.habitPolicyVersion, longestContinuousMs: 0, sessionCount: 0, recordIds: [],
          ...Object.fromEntries(fields.map(field => [field, 0])) };
        for (const field of fields) group[field] += bucket[field];
        group.longestContinuousMs = Math.max(group.longestContinuousMs, record.longestContinuousMs);
        if (!group.recordIds.includes(record.id)) group.recordIds.push(record.id);
        group.sessionCount = group.recordIds.length;
        groups.set(key, group);
      }
    }
    return [...groups.values()].sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour));
  }

  clear(owner) {
    for (const store of [this.posture, this.keyboard, this.eye]) for (const [id, value] of store) if (value.record.owner === owner) store.delete(id);
    this.generations.set(owner, this.generation(owner) + 1);
    return this.generation(owner);
  }

  writeKeyboard(input) {
    const batch = parseKeyboardBatch(input), accepted = this.#accept(this.keyboard, batch);
    if (!accepted) return;
    const next = new Map(batch.counts.map(row => [keyboardCountKey(row), row]));
    for (const [key, row] of accepted.previous?.counts ?? []) if ((next.get(key)?.count ?? 0) < row.count) throw new Error('키보드 집계 누적값이 감소했습니다.');
    this.keyboard.set(batch.record.id, { record: batch.record, counts: next, digests: accepted.digests });
  }

  keyboardDetail(owner, id) {
    const stored = this.keyboard.get(id);
    if (stored?.record.owner !== owner) throw new Error('키보드 기록을 찾을 수 없습니다.');
    return { record: stored.record, counts: [...stored.counts.values()] };
  }

  keyboardStatistics({ owner, from, to }) {
    return [...this.keyboard.values()].filter(({ record, counts }) => record.owner === owner
      && ([...counts.values()].some(row => row.date >= from && row.date <= to)
        || (localDateKey(record.startedAt, record.offsetMinutes) >= from && localDateKey(record.startedAt, record.offsetMinutes) <= to)))
      .map(({ record, counts }) => ({ record, counts: [...counts.values()].filter(row => row.date >= from && row.date <= to) }));
  }

  writeEye(input) {
    const batch = parseEyeBatch(input), accepted = this.#accept(this.eye, batch);
    if (!accepted) return;
    const previous = accepted.previous?.record;
    if (previous) {
      for (const key of ['mode', 'owner', 'startedAt', 'offsetMinutes', 'policyVersion']) {
        if (previous[key] !== batch.record[key]) throw new Error('안구 기록의 고정 정보가 변경되었습니다.');
      }
      if ([...eyeFields, 'updatedAt'].some(key => batch.record[key] + .01 < previous[key])) throw new Error('안구 기록 누적값이 감소했습니다.');
    }
    const buckets = new Map(accepted.previous?.buckets);
    for (const bucket of batch.buckets) {
      const previous = buckets.get(bucket.minute);
      if (previous && eyeFields.some(key => bucket[key] + .01 < previous[key])) throw new Error('안구 시간 버킷 누적값이 감소했습니다.');
      buckets.set(bucket.minute, bucket);
    }
    for (const field of eyeFields) {
      const sum = [...buckets.values()].reduce((total, bucket) => total + bucket[field], 0);
      if (Math.abs(sum - batch.record[field]) > Math.max(.02, Math.abs(sum) * 1e-10)) throw new Error('안구 요약과 시간 버킷의 합계가 일치하지 않습니다.');
    }
    this.eye.set(batch.record.id, structuredClone({ record: batch.record, buckets, digests: accepted.digests }));
  }

  eyeDetail(owner, id) {
    const stored = this.eye.get(id);
    if (stored?.record.owner !== owner) throw new Error('안구 기록을 찾을 수 없습니다.');
    return structuredClone({ record: stored.record, buckets: [...stored.buckets.values()].sort((a, b) => a.minute - b.minute) });
  }

  eyeStatistics(input) {
    const { owner, from, to, mode } = parseQuery(input), groups = new Map();
    if (mode) throw new Error('안구 통계에는 자세 모드 조건을 사용할 수 없습니다.');
    for (const { record, buckets } of this.eye.values()) {
      if (record.owner !== owner) continue;
      for (const bucket of buckets.values()) {
        const local = new Date(bucket.minute - record.offsetMinutes * 60_000).toISOString();
        const date = local.slice(0, 10), hour = local.slice(11, 13);
        if (date < from || date > to) continue;
        const key = JSON.stringify([date, hour, record.policyVersion]);
        const group = groups.get(key) ?? { date, hour, policyVersion: record.policyVersion, ...emptyEyeTotals(), recordIds: new Set() };
        for (const field of eyeFields) group[field] += bucket[field];
        group.recordIds.add(record.id); groups.set(key, group);
      }
    }
    return [...groups.values()].sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour) || a.policyVersion.localeCompare(b.policyVersion))
      .map(({ recordIds, ...row }) => ({ ...row, sessionCount: recordIds.size }));
  }

  history(input) {
    const { owner, from, to, mode, offset } = parseQuery(input);
    if (mode) throw new Error('학습이력에는 모드 조건을 사용할 수 없습니다.');
    const records = [...this.posture.values(), ...this.eye.values()].map(({ record }) => record)
      .filter(record => record.owner === owner
        && localDateKey(record.startedAt, record.offsetMinutes) >= from && localDateKey(record.startedAt, record.offsetMinutes) <= to)
      .sort((a, b) => b.startedAt - a.startedAt || a.mode.localeCompare(b.mode) || a.id.localeCompare(b.id));
    const counts = {};
    for (const record of records) {
      const date = localDateKey(record.startedAt, record.offsetMinutes); counts[date] = (counts[date] ?? 0) + 1;
    }
    return structuredClone({ counts, records: records.slice(offset, offset + 100), hasMore: records.length > offset + 100 });
  }
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A fetch replacement that serves the app's /api/records calls from a MemoryRecords store as the
 * logged-in owner. fail(path, message) makes the next call to that path fail once; writes keeps
 * every posted batch, including failed ones, so retries can be compared.
 */
export function memoryServer(store, owner) {
  const failures = [], writes = [];
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url, 'http://moti.test');
    const method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    if (method === 'POST') writes.push(structuredClone(body));
    const failure = failures.findIndex(item => item.path === pathname);
    if (failure >= 0) return json(503, { message: failures.splice(failure, 1)[0].message });
    const eyeQueryFields = pathname === '/api/records/eye-statistics' ? ['from', 'to']
      : pathname === '/api/records/history' ? ['from', 'to', 'offset'] : null;
    if (eyeQueryFields && [...searchParams.keys()].some(key => !eyeQueryFields.includes(key))) return json(400, { message: '지원하지 않는 조회 조건입니다.' });
    const query = { owner, ...Object.fromEntries(searchParams), ...(searchParams.has('offset') ? { offset: Number(searchParams.get('offset')) } : {}) };
    try {
      if (method === 'POST' && body.record.owner !== owner) return json(403, { message: '다른 계정의 기록은 저장할 수 없습니다.' });
      if (method === 'GET' && pathname === '/api/records/generation') return json(200, { generation: store.generation(owner) });
      if (method === 'DELETE' && pathname === '/api/records') return json(200, { generation: store.clear(owner) });
      if (method === 'POST' && pathname === '/api/records/posture') { store.write(body); return new Response(null, { status: 204 }); }
      if (method === 'POST' && pathname === '/api/records/keyboard') { store.writeKeyboard(body); return new Response(null, { status: 204 }); }
      if (method === 'POST' && pathname === '/api/records/eye') { store.writeEye(body); return new Response(null, { status: 204 }); }
      if (method === 'GET' && pathname === '/api/records/posture-statistics') return json(200, store.statistics(query));
      if (method === 'GET' && pathname === '/api/records/keyboard') return json(200, store.keyboardStatistics(query));
      if (method === 'GET' && pathname === '/api/records/eye-statistics') return json(200, store.eyeStatistics(query));
      if (method === 'GET' && pathname === '/api/records/history') return json(200, store.history(query));
      if (method === 'GET' && pathname.startsWith('/api/records/posture/')) return json(200, store.detail(owner, decodeURIComponent(pathname.slice(21))));
      if (method === 'GET' && pathname.startsWith('/api/records/keyboard/')) return json(200, store.keyboardDetail(owner, decodeURIComponent(pathname.slice(22))));
      if (method === 'GET' && pathname.startsWith('/api/records/eye/')) return json(200, store.eyeDetail(owner, decodeURIComponent(pathname.slice(17))));
      return json(404, { message: `${method} ${pathname}` });
    } catch (error) { return json(409, { message: error.message }); }
  };
  return { fetch, writes, fail: (path, message) => failures.push({ path, message }) };
}

/** The login session the app reads from localStorage. */
export function loggedIn(owner) {
  const values = new Map([['moti.session', JSON.stringify({ token: 'test-token', user: { id: owner, username: owner, nickname: owner } })]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
