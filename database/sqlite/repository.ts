import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseBatch, parseQuery, parseRecord, recordText, localDateKey } from '../contracts.ts';
import type { MinuteBucket, PostureRecord, RecordPage, RecordDetail, Totals, StatisticsRow, RecordMode } from '../contracts.ts';

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
      if (version > 1 || (version === 1 && application !== APPLICATION_ID)) throw new Error('지원하지 않는 데이터베이스 버전입니다. 원본을 보존했습니다.');
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
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
        if (options.recover !== false) this.db.exec("UPDATE records SET data=json_set(data,'$.status','interrupted') WHERE json_extract(data,'$.status')='running'");
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
      this.db.prepare('UPDATE owners SET generation=generation+1 WHERE owner=?').run(owner);
      return this.generation(owner);
    });
  }

  close() { this.db.close(); }
}

export type StoredTotals = Totals;
export type StoredRecord = PostureRecord;
