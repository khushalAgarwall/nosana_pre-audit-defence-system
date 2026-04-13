// ─────────────────────────────────────────────────────────────
// Main Entry Point — Sentinel Audit System
// Initializes database, loads character, starts server
// ─────────────────────────────────────────────────────────────

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from './server.js';
import { initDatabase, closeDatabase } from './database/index.js';
import { sentinelAuditPlugin } from './plugin-audit/index.js';

// ── ASCII Banner ────────────────────────────────────────────

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ███████╗███████╗███╗   ██╗████████╗██╗███╗   ██╗███████╗██╗ ║
║   ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║████╗  ██║██╔════╝██║ ║
║   ███████╗█████╗  ██╔██╗ ██║   ██║   ██║██╔██╗ ██║█████╗  ██║ ║
║   ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██║╚██╗██║██╔══╝  ██║ ║
║   ███████║███████╗██║ ╚████║   ██║   ██║██║ ╚████║███████╗███║ ║
║   ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝ ║
║                                                               ║
║   Smart Contract Pre-Audit Defense System                     ║
║   Semantic Access Control Analyzer                            ║
║   Powered by Nosana GPU Network + Qwen3.5-27B                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main(): Promise<void> {
  console.log(BANNER);

  // ── Load character ────────────────────────────────────
  const characterPath = resolve(
    process.cwd(),
    'characters/sentinel.character.json',
  );

  let character: Record<string, unknown>;
  try {
    const raw = readFileSync(characterPath, 'utf-8');
    character = JSON.parse(raw);
    console.log(`[Boot] Character loaded: ${character.name}`);
  } catch (err) {
    console.error(`[Boot] Failed to load character from ${characterPath}`);
    console.error(err);
    process.exit(1);
  }

  // ── Initialize database ───────────────────────────────
  try {
    initDatabase();
    console.log('[Boot] Database initialized');
  } catch (err) {
    console.error('[Boot] Database initialization failed');
    console.error(err);
    process.exit(1);
  }

  // ── Register plugin ───────────────────────────────────
  console.log(`[Boot] Plugin registered: ${sentinelAuditPlugin.name}`);
  console.log(
    `[Boot] Actions: ${sentinelAuditPlugin.actions.map((a) => a.name).join(', ')}`,
  );

  // ── Configuration summary ─────────────────────────────
  const config = {
    model: process.env.NOSANA_MODEL ?? 'Qwen/Qwen3-32B-AWQ',
    endpoint: process.env.NOSANA_ENDPOINT ?? 'http://localhost:8080/v1',
    port: parseInt(process.env.PORT ?? '3000'),
    env: process.env.NODE_ENV ?? 'development',
  };

  console.log(`[Boot] Model: ${config.model}`);
  console.log(`[Boot] Endpoint: ${config.endpoint}`);
  console.log(`[Boot] Environment: ${config.env}`);

  // ── Start server ──────────────────────────────────────
  const app = createServer();
  const server = app.listen(config.port, () => {
    console.log(`\n[Server] Sentinel API running on http://localhost:${config.port}`);
    console.log(`[Server] Health: http://localhost:${config.port}/api/health`);
    console.log(`[Server] Submit audit: POST http://localhost:${config.port}/api/audit`);
    console.log('\n[Sentinel] Ready to analyze smart contracts.\n');
  });

  // ── Graceful shutdown ─────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      closeDatabase();
      console.log('[Shutdown] Server closed. Goodbye.');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Unhandled rejection safety net ────────────────────
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[Critical] Unhandled promise rejection:', reason);
    // Don't crash — log and continue
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('[Critical] Uncaught exception:', err);
    // Don't crash on non-fatal exceptions
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      console.error('[Critical] Network error — continuing...');
    } else {
      // For truly fatal errors, shut down gracefully
      shutdown('uncaughtException');
    }
  });
}

main().catch((err) => {
  console.error('[Fatal] Failed to start Sentinel:', err);
  process.exit(1);
});
