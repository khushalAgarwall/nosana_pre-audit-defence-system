// ─────────────────────────────────────────────────────────────
// Type definitions for the Sentinel Audit System
// Follows ElizaOS v2 plugin architecture interfaces
// ─────────────────────────────────────────────────────────────

import { z } from 'zod';

// ── Audit Report Schema (strict LLM output contract) ────────

export const AuditReportSchema = z.object({
  status: z.enum(['vulnerable', 'secure']),
  vulnerability_type: z.literal('Semantic Access Control'),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
  line_number: z.array(z.number().int().positive()),
  impact_analysis: z.string().min(1),
  suggested_patch: z.string(),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;

// ── Multi-finding report (wraps multiple findings) ──────────

export const AuditResponseSchema = z.object({
  findings: z.array(AuditReportSchema),
  contract_name: z.string(),
  overall_status: z.enum(['vulnerable', 'secure']),
  summary: z.string(),
});

export type AuditResponse = z.infer<typeof AuditResponseSchema>;

// ── API Request / Response ──────────────────────────────────

export interface AuditRequest {
  contractCode: string;
  contractName?: string;
}

export interface AuditResult {
  id: string;
  contractName: string;
  contractCode: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'error';
  report: AuditResponse | null;
  error?: string;
}

// ── Solidity Parsed Metadata ────────────────────────────────

export interface ParsedFunction {
  name: string;
  visibility: 'public' | 'external' | 'internal' | 'private';
  modifiers: string[];
  isStateChanging: boolean;
  parameters: string;
  lineNumber: number;
  body: string;
}

export interface ParsedStateVariable {
  name: string;
  type: string;
  visibility: 'public' | 'internal' | 'private';
  lineNumber: number;
}

export interface ParsedContract {
  name: string;
  inherits: string[];
  functions: ParsedFunction[];
  stateVariables: ParsedStateVariable[];
  modifiers: string[];
  events: string[];
  constructorCode: string | null;
  rawCode: string;
  rolePatterns: RolePattern[];
}

export interface RolePattern {
  type: 'mapping' | 'modifier' | 'require' | 'ownable' | 'access-control';
  identifier: string;
  lineNumber: number;
  context: string;
}

// ── ElizaOS v2 Compatible Interfaces ────────────────────────

export interface Memory {
  id: string;
  userId: string;
  agentId: string;
  roomId: string;
  content: {
    text: string;
    [key: string]: unknown;
  };
  createdAt: number;
}

export interface State {
  [key: string]: unknown;
}

export type HandlerCallback = (response: {
  text: string;
  data?: Record<string, unknown>;
}) => Promise<void>;

export interface AgentRuntime {
  character: Record<string, unknown>;
  getSetting: (key: string) => string | undefined;
  databaseAdapter: unknown;
  completion: (params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
  }) => Promise<string>;
}

export interface ActionExample {
  user: string;
  content: {
    text: string;
    [key: string]: unknown;
  };
}

export interface Action {
  name: string;
  description: string;
  similes: string[];
  validate: (
    runtime: AgentRuntime,
    message: Memory,
    state?: State,
  ) => Promise<boolean>;
  handler: (
    runtime: AgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => Promise<void>;
  examples: ActionExample[][];
}

export interface Plugin {
  name: string;
  description: string;
  actions: Action[];
}
