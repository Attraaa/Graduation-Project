import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseBatch, parseQuery, parseRecord, recordText, localDateKey } from '../contracts.ts';
import type { MinuteBucket, PostureRecord, RecordPage, RecordDetail, Totals, StatisticsRow, RecordMode } from '../contracts.ts';
import { parseKeyboardBatch, parseKeyboardRecord, parseKeyboardQuery, keyboardCountKey } from '../keyboard.ts';
import type { KeyboardCount, KeyboardStored } from '../keyboard.ts';

import { parseEyeBatch, parseEyeRecord, eyeFields } from '../eye.ts';
import type { EyeBucket, EyeDetail, EyeStatisticsRow, EyeTotals, HistoryPage } from '../eye.ts';

const APPLICATION_ID = 0x4d4f5449;
const fields = ['runMs', 'validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount'] as const;
const closeEnough = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(a) * 1e-10);

/** Single owner connection. Parameterized SQL only; no filesystem paths cross IPC. */
export class RecordRepository {
  private db: DatabaseSync;

  constructor(file: string, options: { recover?: boolean; readOnly?: boolean } = {}) {
    const existed = file !== ':memory:' && existsSync(file);
    this.db = new DatabaseSync(file, { timeout: 250, readOnly: options.readOnly ?? false });
    try {
      const version = Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
      const application = Number(this.db.prepare('PRAGMA application_id').get()!.application_id);
      if (![0, 1, 2, 3].includes(version) || (version > 0 && application !== APPLICATION_ID)) throw new Error('지원하지 않는 데이터베이스 버전입니다. 원본을 보존했습니다.');
      if (version === 0) {
        const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (tables.length || (existed && application !== 0)) throw new Error('다른 데이터베이스 파일입니다. 원본을 보존했습니다.');
        if (options.readOnly) throw new Error('읽기 전용 데이터베이스를 초기화할 수 없습니다.');
        this.transaction(() => this.db.exec(`
          CREATE TABLE owners(owner TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0) STRICT;
          CREATE TABLE records(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES owners(owner), mode TEXT NOT NULL,
            startDate TEXT NOT NULL, sequence INTEGER NOT NULL, data TEXT NOT NULL) STRICT;
          CREATE INDEX record_owner_date ON records(owner,startDate,id);
          CREATE TABLE buckets(recordId TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE, minute INTEGER NOT NULL,
            date TEXT NOT NULL, hour TEXT NOT NULL, runMs REAL NOT NULL, validMs REAL NOT NULL, scoreTimeSum REAL NOT NULL,
            deviationMs REAL NOT NULL, deviationEpisodeCount INTEGER NOT NULL, PRIMARY KEY(recordId,minute)) STRICT;
          CREATE INDEX bucket_date ON buckets(date,recordId);
          CREATE TABLE batches(recordId TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE, sequence INTEGER NOT NULL,
            digest TEXT NOT NULL, PRIMARY KEY(recordId,sequence)) STRICT;
          PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=1;
        `));
      }
      this.db.exec('PRAGMA foreign_keys=ON');
      if (this.integrity() !== 'ok') throw new Error('데이터베이스 무결성 검사에 실패했습니다. 원본을 보존했습니다.');
      if (!options.readOnly) {
        // Additive v1 -> v2 migration on the same owner connection. Existing posture rows survive.
        if (version < 2) this.transaction(() => this.db.exec(`
          CREATE TABLE keyboard_records(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES owners(owner),
            startDate TEXT NOT NULL, sequence INTEGER NOT NULL, data TEXT NOT NULL) STRICT;
          CREATE INDEX keyboard_owner_date ON keyboard_records(owner,startDate,id);
          CREATE TABLE keyboard_counts(recordId TEXT NOT NULL REFERENCES keyboard_records(id) ON DELETE CASCADE,
            key TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(recordId,key)) STRICT;
          CREATE INDEX keyboard_count_date ON keyboard_counts(date,recordId);
          CREATE TABLE keyboard_batches(recordId TEXT NOT NULL REFERENCES keyboard_records(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(recordId,sequence)) STRICT;
          PRAGMA user_version=2;
        `));
        if (version < 3) this.transaction(() => this.db.exec(`
          CREATE TABLE eye_records(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES owners(owner),
            startDate TEXT NOT NULL, sequence INTEGER NOT NULL, data TEXT NOT NULL) STRICT;
          CREATE INDEX eye_owner_date ON eye_records(owner,startDate,id);
          CREATE TABLE eye_buckets(recordId TEXT NOT NULL REFERENCES eye_records(id) ON DELETE CASCADE,
            minute INTEGER NOT NULL, date TEXT NOT NULL, hour TEXT NOT NULL,
            runMs REAL NOT NULL, validMs REAL NOT NULL, blinks INTEGER NOT NULL, breaks INTEGER NOT NULL,
            nearReminders INTEGER NOT NULL, openReminders INTEGER NOT NULL, PRIMARY KEY(recordId,minute)) STRICT;
          CREATE INDEX eye_bucket_date ON eye_buckets(date,recordId);
          CREATE TABLE eye_batches(recordId TEXT NOT NULL REFERENCES eye_records(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(recordId,sequence)) STRICT;
          PRAGMA user_version=3;
        `));
        if (options.recover !== false) this.db.exec("UPDATE eye_records SET data=json_set(data,'$.status','interrupted') WHERE json_extract(data,'$.status')='running'");
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
        if (options.recover !== false) this.db.exec("UPDATE records SET data=json_set(data,'$.status','interrupted') WHERE json_extract(data,'$.status')='running'");
        if (options.recover !== false) this.db.exec("UPDATE keyboard_records SET data=json_set(data,'$.status','interrupted') WHERE json_extract(data,'$.status')='running'");
      }
    } catch (error) { this.db.close(); throw error; }
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  integrity() {
    const checks = this.db.prepare('PRAGMA quick_check').all();
    return checks.every(row => row.quick_check === 'ok') && this.db.prepare('PRAGMA foreign_key_check').all().length === 0 ? 'ok' : 'failed';
  }

  generation(owner: string) {
    recordText(owner);
    return Number(this.db.prepare('SELECT generation FROM owners WHERE owner=?').get(owner)?.generation ?? 0);
  }

  write(input: unknown) {
    const batch = parseBatch(input);
    const record = batch.record;
    const digest = createHash('sha256').update(JSON.stringify(batch)).digest('hex');
    this.transaction(() => {
      if (batch.generation !== this.generation(record.owner)) throw new Error('삭제된 기록의 저장 요청입니다. 새 측정을 시작해 주세요.');
      const previous = this.db.prepare('SELECT owner,sequence,data FROM records WHERE id=?').get(record.id);
      if (previous && previous.owner !== record.owner) throw new Error('다른 계정의 기록입니다.');
      const duplicate = this.db.prepare('SELECT digest FROM batches WHERE recordId=? AND sequence=?').get(record.id, batch.sequence);
      if (duplicate) {
        if (duplicate.digest !== digest) throw new Error('같은 순번에 다른 기록이 도착했습니다.');
        return;
      }
      if (batch.sequence !== (previous ? Number(previous.sequence) + 1 : 0)) throw new Error('기록 순서가 일치하지 않습니다.');
      if (previous) {
        const old = parseRecord(JSON.parse(String(previous.data)));
        if (old.status !== 'running') throw new Error('이미 종료된 기록입니다.');
        for (const key of ['mode', 'startedAt', 'offsetMinutes', 'scorePolicyVersion', 'habitPolicyVersion'] as const) {
          if (old[key] !== record[key]) throw new Error('기록의 고정 정보가 변경되었습니다.');
        }
        for (const key of [...fields, 'longestContinuousMs', 'updatedAt'] as const) {
          if (record[key] + 0.01 < old[key]) throw new Error('기록 누적값이 감소했습니다.');
        }
      }
      this.db.prepare('INSERT OR IGNORE INTO owners(owner) VALUES(?)').run(record.owner);
      this.db.prepare(`INSERT INTO records(id,owner,mode,startDate,sequence,data) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,data=excluded.data`).run(
        record.id, record.owner, record.mode, localDateKey(record.startedAt, record.offsetMinutes), batch.sequence, JSON.stringify(record));
      const put = this.db.prepare(`INSERT INTO buckets VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(recordId,minute) DO UPDATE SET
        runMs=excluded.runMs,validMs=excluded.validMs,scoreTimeSum=excluded.scoreTimeSum,
        deviationMs=excluded.deviationMs,deviationEpisodeCount=excluded.deviationEpisodeCount`);
      for (const bucket of batch.buckets) {
        const old = this.db.prepare('SELECT * FROM buckets WHERE recordId=? AND minute=?').get(record.id, bucket.minute);
        if (old && fields.some(key => bucket[key] + 0.01 < Number(old[key]))) throw new Error('시간 버킷 누적값이 감소했습니다.');
        const local = new Date(bucket.minute - record.offsetMinutes * 60_000).toISOString();
        put.run(record.id, bucket.minute, local.slice(0, 10), local.slice(11, 13), ...fields.map(key => bucket[key]));
      }
      const sum = this.db.prepare(`SELECT ${fields.map(key => `COALESCE(SUM(${key}),0) AS ${key}`).join(',')} FROM buckets WHERE recordId=?`).get(record.id)!;
      if (fields.some(key => !closeEnough(Number(sum[key]), record[key]))) throw new Error('요약과 시간 버킷의 합계가 일치하지 않습니다.');
      this.db.prepare('INSERT INTO batches VALUES(?,?,?)').run(record.id, batch.sequence, digest);
    });
  }

  list(input: unknown): RecordPage {
    const query = parseQuery(input);
    const rows = this.db.prepare(`SELECT data FROM records WHERE owner=? AND startDate BETWEEN ? AND ?
      AND (? IS NULL OR mode=?) ORDER BY json_extract(data,'$.startedAt') DESC,id LIMIT 101 OFFSET ?`)
      .all(query.owner, query.from, query.to, query.mode ?? null, query.mode ?? null, query.offset ?? 0);
    const counts = this.db.prepare('SELECT startDate,COUNT(*) AS count FROM records WHERE owner=? AND startDate BETWEEN ? AND ? AND (? IS NULL OR mode=?) GROUP BY startDate')
      .all(query.owner, query.from, query.to, query.mode ?? null, query.mode ?? null);
    return { records: rows.slice(0, 100).map(row => parseRecord(JSON.parse(String(row.data)))), hasMore: rows.length > 100,
      counts: Object.fromEntries(counts.map(row => [String(row.startDate), Number(row.count)])) };
  }

  detail(owner: string, id: string): RecordDetail {
    recordText(owner); recordText(id);
    const row = this.db.prepare('SELECT data FROM records WHERE owner=? AND id=?').get(owner, id);
    if (!row) throw new Error('기록을 찾을 수 없습니다.');
    const buckets = this.db.prepare(`SELECT minute,${fields.join(',')} FROM buckets WHERE recordId=? ORDER BY minute`).all(id) as unknown as MinuteBucket[];
    return { record: parseRecord(JSON.parse(String(row.data))), buckets };
  }

  statistics(input: unknown): StatisticsRow[] {
    const query = parseQuery(input);
    const rows = this.db.prepare(`SELECT b.date,b.hour,r.mode,
      json_extract(r.data,'$.scorePolicyVersion') AS scorePolicyVersion,
      json_extract(r.data,'$.habitPolicyVersion') AS habitPolicyVersion,
      MAX(json_extract(r.data,'$.longestContinuousMs')) AS longestContinuousMs,
      COUNT(DISTINCT r.id) AS sessionCount, json_group_array(DISTINCT r.id) AS recordIds,
      ${fields.map(key => `SUM(b.${key}) AS ${key}`).join(',')}
      FROM buckets b JOIN records r ON r.id=b.recordId
      WHERE r.owner=? AND b.date BETWEEN ? AND ? AND (? IS NULL OR r.mode=?)
      GROUP BY b.date,b.hour,r.mode,scorePolicyVersion,habitPolicyVersion ORDER BY b.date,b.hour LIMIT 10001`)
      .all(query.owner, query.from, query.to, query.mode ?? null, query.mode ?? null);
    if (rows.length > 10000) throw new Error('조회 결과가 많습니다. 기간을 줄여 주세요.');
    return rows.map(row => ({
      date: String(row.date), hour: String(row.hour), mode: row.mode as RecordMode,
      scorePolicyVersion: String(row.scorePolicyVersion), habitPolicyVersion: String(row.habitPolicyVersion),
      longestContinuousMs: Number(row.longestContinuousMs), sessionCount: Number(row.sessionCount),
      recordIds: JSON.parse(String(row.recordIds)) as string[],
      ...Object.fromEntries(fields.map(key => [key, Number(row[key])])) as unknown as Totals,
    }));
  }

  /** Current profile only. Incrementing generation also invalidates in-flight batches. */
  clear(owner: string) {
    recordText(owner);
    return this.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO owners(owner) VALUES(?)').run(owner);
      this.db.prepare('DELETE FROM records WHERE owner=?').run(owner);
      this.db.prepare('DELETE FROM keyboard_records WHERE owner=?').run(owner);
      this.db.prepare('DELETE FROM eye_records WHERE owner=?').run(owner);
      this.db.prepare('UPDATE owners SET generation=generation+1 WHERE owner=?').run(owner);
      return this.generation(owner);
    });
  }

  writeKeyboard(input: unknown) {
    const batch = parseKeyboardBatch(input), record = batch.record;
    const digest = createHash('sha256').update(JSON.stringify(batch)).digest('hex');
    this.transaction(() => {
      if (batch.generation !== this.generation(record.owner)) throw new Error('삭제된 키보드 기록의 저장 요청입니다.');
      const previous = this.db.prepare('SELECT owner,sequence,data FROM keyboard_records WHERE id=?').get(record.id);
      if (previous && previous.owner !== record.owner) throw new Error('다른 계정의 기록입니다.');
      const duplicate = this.db.prepare('SELECT digest FROM keyboard_batches WHERE recordId=? AND sequence=?').get(record.id, batch.sequence);
      if (duplicate) { if (duplicate.digest !== digest) throw new Error('같은 순번에 다른 기록이 도착했습니다.'); return; }
      if (batch.sequence !== (previous ? Number(previous.sequence) + 1 : 0)) throw new Error('키보드 기록 순서가 일치하지 않습니다.');
      if (previous) {
        const old = parseKeyboardRecord(JSON.parse(String(previous.data)));
        if (old.status !== 'running') throw new Error('이미 종료된 키보드 기록입니다.');
        for (const field of ['owner', 'startedAt', 'offsetMinutes', 'policyVersion', 'recognitionVersion', 'nearbyCredit'] as const)
          if (old[field] !== record[field]) throw new Error('키보드 기록의 정책이 변경되었습니다.');
        if (old.total > record.total || old.updatedAt > record.updatedAt) throw new Error('키보드 누적값이 감소했습니다.');
      }
      const oldCounts = this.db.prepare('SELECT key,data FROM keyboard_counts WHERE recordId=?').all(record.id);
      const nextCounts = new Map(batch.counts.map(row => [keyboardCountKey(row), row]));
      for (const row of oldCounts) if ((nextCounts.get(String(row.key))?.count ?? 0) < (JSON.parse(String(row.data)) as KeyboardCount).count)
        throw new Error('키보드 집계 누적값이 감소했습니다.');
      this.db.prepare('INSERT OR IGNORE INTO owners(owner) VALUES(?)').run(record.owner);
      this.db.prepare(`INSERT INTO keyboard_records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,data=excluded.data`)
        .run(record.id, record.owner, localDateKey(record.startedAt, record.offsetMinutes), batch.sequence, JSON.stringify(record));
      const put = this.db.prepare('INSERT INTO keyboard_counts VALUES(?,?,?,?) ON CONFLICT(recordId,key) DO UPDATE SET data=excluded.data');
      for (const row of batch.counts) put.run(record.id, keyboardCountKey(row), row.date, JSON.stringify(row));
      this.db.prepare('INSERT INTO keyboard_batches VALUES(?,?,?)').run(record.id, batch.sequence, digest);
    });
  }

  keyboardStatistics(input: unknown): KeyboardStored[] {
    const query = parseKeyboardQuery(input);
    const rows = this.db.prepare(`SELECT DISTINCT r.id,r.data FROM keyboard_records r LEFT JOIN keyboard_counts c ON c.recordId=r.id
      WHERE r.owner=? AND (c.date BETWEEN ? AND ? OR r.startDate BETWEEN ? AND ?) ORDER BY r.startDate,r.id LIMIT 1001`)
      .all(query.owner, query.from, query.to, query.from, query.to);
    if (rows.length > 1000) throw new Error('키보드 기록이 많습니다. 조회 기간을 줄여 주세요.');
    const get = this.db.prepare('SELECT data FROM keyboard_counts WHERE recordId=? AND date BETWEEN ? AND ? ORDER BY key');
    return rows.map(row => ({ record: parseKeyboardRecord(JSON.parse(String(row.data))),
      counts: get.all(row.id, query.from, query.to).map(count => JSON.parse(String(count.data)) as KeyboardCount) }));
  }

  keyboardDetail(owner: string, id: string): KeyboardStored {
    recordText(owner); recordText(id);
    const row = this.db.prepare('SELECT data FROM keyboard_records WHERE owner=? AND id=?').get(owner, id);
    if (!row) throw new Error('키보드 기록을 찾을 수 없습니다.');
    return { record: parseKeyboardRecord(JSON.parse(String(row.data))),
      counts: this.db.prepare('SELECT data FROM keyboard_counts WHERE recordId=? ORDER BY key').all(id).map(count => JSON.parse(String(count.data)) as KeyboardCount) };
  }


  writeEye(input: unknown) {
    const batch = parseEyeBatch(input), record = batch.record;
    const digest = createHash('sha256').update(JSON.stringify(batch)).digest('hex');
    this.transaction(() => {
      if (batch.generation !== this.generation(record.owner)) throw new Error('삭제된 안구 기록의 저장 요청입니다.');
      const previous = this.db.prepare('SELECT owner,sequence,data FROM eye_records WHERE id=?').get(record.id);
      if (previous && previous.owner !== record.owner) throw new Error('다른 계정의 기록입니다.');
      const duplicate = this.db.prepare('SELECT digest FROM eye_batches WHERE recordId=? AND sequence=?').get(record.id, batch.sequence);
      if (duplicate) { if (duplicate.digest !== digest) throw new Error('같은 순번에 다른 기록이 도착했습니다.'); return; }
      if (batch.sequence !== (previous ? Number(previous.sequence) + 1 : 0)) throw new Error('안구 기록 순서가 일치하지 않습니다.');
      if (previous) {
        const old = parseEyeRecord(JSON.parse(String(previous.data)));
        if (old.status !== 'running') throw new Error('이미 종료된 안구 기록입니다.');
        for (const key of ['startedAt', 'offsetMinutes', 'policyVersion'] as const)
          if (old[key] !== record[key]) throw new Error('안구 기록의 고정 정보가 변경되었습니다.');
        for (const key of [...eyeFields, 'updatedAt'] as const)
          if (record[key] + 0.01 < old[key]) throw new Error('안구 기록 누적값이 감소했습니다.');
      }
      this.db.prepare('INSERT OR IGNORE INTO owners(owner) VALUES(?)').run(record.owner);
      this.db.prepare('INSERT INTO eye_records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,data=excluded.data')
        .run(record.id, record.owner, localDateKey(record.startedAt, record.offsetMinutes), batch.sequence, JSON.stringify(record));
      const put = this.db.prepare(`INSERT INTO eye_buckets VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(recordId,minute) DO UPDATE SET
        ${eyeFields.map(key => key + '=excluded.' + key).join(',')}`);
      for (const bucket of batch.buckets) {
        const old = this.db.prepare('SELECT * FROM eye_buckets WHERE recordId=? AND minute=?').get(record.id, bucket.minute);
        if (old && eyeFields.some(key => bucket[key] + 0.01 < Number(old[key]))) throw new Error('안구 버킷 누적값이 감소했습니다.');
        const local = new Date(bucket.minute - record.offsetMinutes * 60000).toISOString();
        put.run(record.id, bucket.minute, local.slice(0, 10), local.slice(11, 13), ...eyeFields.map(key => bucket[key]));
      }
      const sums = this.db.prepare(`SELECT ${eyeFields.map(key => 'COALESCE(SUM(' + key + '),0) AS ' + key).join(',')} FROM eye_buckets WHERE recordId=?`).get(record.id)!;
      if (eyeFields.some(key => !closeEnough(Number(sums[key]), record[key]))) throw new Error('안구 요약과 시간 버킷의 합계가 일치하지 않습니다.');
      this.db.prepare('INSERT INTO eye_batches VALUES(?,?,?)').run(record.id, batch.sequence, digest);
    });
  }

  eyeDetail(owner: string, id: string): EyeDetail {
    recordText(owner); recordText(id);
    const row = this.db.prepare('SELECT data FROM eye_records WHERE owner=? AND id=?').get(owner, id);
    if (!row) throw new Error('안구 기록을 찾을 수 없습니다.');
    return { record: parseEyeRecord(JSON.parse(String(row.data))),
      buckets: this.db.prepare(`SELECT minute,${eyeFields.join(',')} FROM eye_buckets WHERE recordId=? ORDER BY minute`).all(id) as unknown as EyeBucket[] };
  }

  eyeStatistics(input: unknown): EyeStatisticsRow[] {
    const query = parseQuery(input);
    if (query.mode) throw new Error('안구 통계에는 자세 모드 조건을 사용할 수 없습니다.');
    const rows = this.db.prepare(`SELECT b.date,b.hour,json_extract(r.data,'$.policyVersion') AS policyVersion,
      COUNT(DISTINCT r.id) AS sessionCount,${eyeFields.map(key => 'SUM(b.' + key + ') AS ' + key).join(',')}
      FROM eye_buckets b JOIN eye_records r ON r.id=b.recordId WHERE r.owner=? AND b.date BETWEEN ? AND ?
      GROUP BY b.date,b.hour,policyVersion ORDER BY b.date,b.hour,policyVersion LIMIT 10001`).all(query.owner, query.from, query.to);
    if (rows.length > 10000) throw new Error('안구 기록이 많습니다. 조회 기간을 줄여 주세요.');
    return rows.map(row => ({ date: String(row.date), hour: String(row.hour), policyVersion: String(row.policyVersion), sessionCount: Number(row.sessionCount),
      ...Object.fromEntries(eyeFields.map(key => [key, Number(row[key])])) as EyeTotals }));
  }

  /** Shared calendar pagination: all rows are ordered before applying the page limit. */
  history(input: unknown): HistoryPage {
    const query = parseQuery(input);
    if (query.mode) throw new Error('학습이력에는 모드 조건을 사용할 수 없습니다.');
    const source = '(SELECT id,owner,startDate,data,mode FROM records UNION ALL SELECT id,owner,startDate,data,\'eye\' AS mode FROM eye_records)';
    const rows = this.db.prepare(`SELECT data,mode FROM ${source} WHERE owner=? AND startDate BETWEEN ? AND ?
      ORDER BY json_extract(data,'$.startedAt') DESC,mode,id LIMIT 101 OFFSET ?`).all(query.owner, query.from, query.to, query.offset ?? 0);
    const counts = this.db.prepare(`SELECT startDate,COUNT(*) AS count FROM ${source} WHERE owner=? AND startDate BETWEEN ? AND ? GROUP BY startDate`)
      .all(query.owner, query.from, query.to);
    return { records: rows.slice(0, 100).map(row => row.mode === 'eye' ? parseEyeRecord(JSON.parse(String(row.data))) : parseRecord(JSON.parse(String(row.data)))),
      counts: Object.fromEntries(counts.map(row => [String(row.startDate), Number(row.count)])), hasMore: rows.length > 100 };
  }

  close() { this.db.close(); }
}

export type StoredTotals = Totals;
export type StoredRecord = PostureRecord;
