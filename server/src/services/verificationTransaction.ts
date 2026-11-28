import type { Pool, PoolConnection } from 'mysql2/promise';
import { HttpError } from '../http.js';

/** Failed code checks spend an attempt. A validated code rolls back with any failed account write. */
export class VerificationRejected extends HttpError {
  constructor(message: string) { super(400, message); }
}

export async function verifyInTransaction<T>(pool: Pool, run: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    try {
      const result = await run(connection);
      await connection.commit();
      return result;
    } catch (error) {
      if (error instanceof VerificationRejected) await connection.commit();
      else await connection.rollback();
      throw error;
    }
  } finally { connection.release(); }
}
