import "server-only";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Param = string | number | boolean | null | Date | Param[];
export type Db = Pool | PoolConnection;

// Same pool settings for both databases. dateStrings keeps DATE/DATETIME/TIMESTAMP as the exact
// strings MySQL stores (like PDO did), so no value is shifted by the JavaScript Date timezone.
function createPool(prefix: "DB" | "ABSEN_DB", fallbackName: string): Pool {
  const env = (key: string) => process.env[`${prefix}_${key}`];
  const pool = mysql.createPool({
    host: env("HOST") || "127.0.0.1",
    port: Number(env("PORT")) || 3306,
    user: env("USER") || "root",
    password: env("PASSWORD") || "",
    database: env("NAME") || fallbackName,
    charset: "utf8mb4",
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 5000,
    enableKeepAlive: true,
  });
  // NOW()/CURDATE() and TIMESTAMP columns follow WIB, independent of the MySQL server zone.
  // Indonesia has no daylight saving, so the fixed offset is always right.
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+07:00'");
  });
  return pool;
}

// Reuse pools across hot reloads in development.
const globalForDb = globalThis as unknown as { appPool?: Pool; absenPool?: Pool };

export const db: Pool = globalForDb.appPool ?? (globalForDb.appPool = createPool("DB", "u313218767_dev"));

// The Absensi database is opened lazily: only login, SSO and Users need it, so every other page
// keeps working when it is unreachable.
export function absenDb(): Pool {
  return globalForDb.absenPool ?? (globalForDb.absenPool = createPool("ABSEN_DB", "absensi"));
}

export async function rows<T extends Row = Row>(conn: Db, sql: string, params: Param[] = []): Promise<T[]> {
  const [result] = await conn.query(sql, params);
  return result as T[];
}

export async function row<T extends Row = Row>(conn: Db, sql: string, params: Param[] = []): Promise<T | null> {
  return (await rows<T>(conn, sql, params))[0] ?? null;
}

export async function scalar<T = unknown>(conn: Db, sql: string, params: Param[] = []): Promise<T | null> {
  const first = await row(conn, sql, params);
  return first ? (Object.values(first)[0] as T) : null;
}

export async function exec(conn: Db, sql: string, params: Param[] = []): Promise<ResultSetHeader> {
  const [result] = await conn.query(sql, params);
  return result as ResultSetHeader;
}

// Runs fn inside one transaction on a dedicated connection; rolls back on any error.
export async function transaction<T>(fn: (tx: PoolConnection) => Promise<T>): Promise<T> {
  const tx = await db.getConnection();
  try {
    await tx.beginTransaction();
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.release();
  }
}

export function isDuplicateKey(error: unknown): boolean {
  return (error as { errno?: number })?.errno === 1062;
}

export function isForeignKeyBlock(error: unknown): boolean {
  return (error as { errno?: number })?.errno === 1451;
}
