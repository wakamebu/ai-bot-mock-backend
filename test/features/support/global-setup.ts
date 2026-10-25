import pg from 'pg';
import { TEST_DB_NAME } from './test-env.js';

/** テスト用データベースがなければ作る（DB の起動は docker compose up -d db で行う） */
export default async function setup() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env がなければ既定値で接続する
  }
  const client = new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'aibot',
    password: process.env.DB_PASSWORD ?? 'aibot',
    database: 'postgres',
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      'PostgreSQL に接続できません。先に `docker compose up -d db` で DB を起動してください。',
      { cause: error },
    );
  }
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME],
    );
    if (!rowCount) await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
}
