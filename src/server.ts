// ─────────────────────────────────────────────────────────────
// Express API Server
// REST endpoints for the Sentinel audit system
// ─────────────────────────────────────────────────────────────

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { executeAudit } from './plugin-audit/actions/auditContract.js';
import {
  initDatabase,
  saveAudit,
  updateAudit,
  getAuditById,
  getAllAudits,
} from './database/index.js';
import type { AuditRequest, AuditResult } from './types/index.js';

export function createServer(): express.Application {
  const app = express();

  // ── Middleware ───────────────────────────────────────────
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['http://localhost:3001']
      : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  }));
  app.use(express.json({ limit: '5mb' }));

  // ── Health Check ────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Sentinel Audit API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      model: process.env.NOSANA_MODEL ?? 'Qwen/Qwen3-32B-AWQ',
      endpoint: process.env.NOSANA_ENDPOINT ?? 'http://localhost:8080/v1',
    });
  });

  // ── Submit Audit ────────────────────────────────────────
  app.post('/api/audit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contractCode, contractName } = req.body as AuditRequest;

      // Validate input
      if (!contractCode || typeof contractCode !== 'string') {
        res.status(400).json({
          error: 'Missing or invalid "contractCode" field. Must be a non-empty string.',
        });
        return;
      }

      if (contractCode.length > 500_000) {
        res.status(400).json({
          error: 'Contract code exceeds maximum size of 500KB.',
        });
        return;
      }

      // Create audit record
      const auditId = uuidv4();
      const timestamp = new Date().toISOString();

      const auditRecord: AuditResult = {
        id: auditId,
        contractName: contractName ?? 'Untitled Contract',
        contractCode,
        timestamp,
        status: 'pending',
        report: null,
      };

      // Save pending audit
      saveAudit(auditRecord);

      // Execute audit (synchronous for MVP — the model call is the bottleneck)
      console.log(`[API] Starting audit ${auditId} for "${auditRecord.contractName}"`);

      try {
        const report = await executeAudit(contractCode, contractName);

        updateAudit(auditId, 'completed', report);

        console.log(
          `[API] Audit ${auditId} completed: ${report.overall_status} (${report.findings.length} findings)`,
        );

        res.json({
          id: auditId,
          contractName: auditRecord.contractName,
          timestamp,
          status: 'completed',
          report,
        });
      } catch (auditErr) {
        const errorMsg = auditErr instanceof Error ? auditErr.message : 'Unknown error';
        updateAudit(auditId, 'error', undefined, errorMsg);

        console.error(`[API] Audit ${auditId} failed: ${errorMsg}`);

        res.status(502).json({
          id: auditId,
          status: 'error',
          error: errorMsg,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // ── Get Audit by ID ─────────────────────────────────────
  app.get('/api/audit/:id', (req: Request, res: Response) => {
    const audit = getAuditById(req.params.id as string);

    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }

    res.json(audit);
  });

  // ── List All Audits ─────────────────────────────────────
  app.get('/api/audits', (req: Request, res: Response) => {
    const limit = Math.min(
      parseInt(req.query.limit as string) || 50,
      100,
    );
    const audits = getAllAudits(limit);

    // Return without contract code to reduce payload
    const summary = audits.map(({ contractCode: _, ...rest }) => rest);
    res.json({ audits: summary, total: summary.length });
  });

  // ── Global Error Handler ────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`[API] Unhandled error: ${err.message}`);
    console.error(err.stack);

    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  return app;
}
