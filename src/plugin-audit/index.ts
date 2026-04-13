// ─────────────────────────────────────────────────────────────
// Plugin Audit — ElizaOS v2 Plugin Definition
// Registers the Semantic Access Control audit action
// ─────────────────────────────────────────────────────────────

import type { Plugin } from '../types/index.js';
import { auditContractAction } from './actions/auditContract.js';

export const sentinelAuditPlugin: Plugin = {
  name: '@nosana/plugin-audit',
  description:
    'Sentinel Audit Plugin — Detects Semantic Access Control vulnerabilities in Solidity smart contracts using RBAC analysis, contextual impact assessment, and automated remediation.',
  actions: [auditContractAction],
};

export default sentinelAuditPlugin;
