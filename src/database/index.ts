// ─────────────────────────────────────────────────────────────
// SQLite Database Layer
// Persists audit results for history & retrieval
// ─────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditResponse, AuditResult } from '../types/index.js';

let db: Database.Database | null = null;

/**
 * Initializes the SQLite database and creates tables if needed.
 */
export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? process.env.DATABASE_PATH ?? './data/sentinel.db';

  // Ensure the directory exists
  mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      contract_name TEXT NOT NULL,
      contract_code TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      report TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audits_timestamp
      ON audits(timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audits_status
      ON audits(status);
  `);

  console.log(`[Sentinel DB] Initialized at ${path}`);
  return db;
}

/**
 * Returns the database instance, initializing if needed.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Saves a new audit record.
 */
export function saveAudit(audit: AuditResult): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO audits (id, contract_name, contract_code, timestamp, status, report, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    audit.id,
    audit.contractName,
    audit.contractCode,
    audit.timestamp,
    audit.status,
    audit.report ? JSON.stringify(audit.report) : null,
    audit.error ?? null,
  );
}

/**
 * Updates an existing audit with results.
 */
export function updateAudit(
  id: string,
  status: 'completed' | 'error',
  report?: AuditResponse,
  error?: string,
): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE audits SET status = ?, report = ?, error = ? WHERE id = ?
  `);

  stmt.run(
    status,
    report ? JSON.stringify(report) : null,
    error ?? null,
    id,
  );
}

/**
 * Retrieves an audit by ID.
 */
export function getAuditById(id: string): AuditResult | null {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM audits WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    contractName: row.contract_name as string,
    contractCode: row.contract_code as string,
    timestamp: row.timestamp as string,
    status: row.status as AuditResult['status'],
    report: row.report ? JSON.parse(row.report as string) : null,
    error: (row.error as string) ?? undefined,
  };
}

/**
 * Retrieves all audits, most recent first.
 */
export function getAllAudits(limit = 50): AuditResult[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM audits ORDER BY timestamp DESC LIMIT ?',
  );
  const rows = stmt.all(limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    contractName: row.contract_name as string,
    contractCode: row.contract_code as string,
    timestamp: row.timestamp as string,
    status: row.status as AuditResult['status'],
    report: row.report ? JSON.parse(row.report as string) : null,
    error: (row.error as string) ?? undefined,
  }));
}

/**
 * Closes the database connection gracefully.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[Sentinel DB] Connection closed');
  }
}
