// ─────────────────────────────────────────────────────────────
// Audit Contract Action — Core audit logic
// ElizaOS v2 compatible action handler
// ─────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { AuditResponseSchema } from '../../types/index.js';
import type {
  Action,
  ActionExample,
  AgentRuntime,
  AuditResponse,
  HandlerCallback,
  Memory,
  State,
} from '../../types/index.js';
import { parseSolidityContract } from '../../utils/solidityParser.js';
import {
  buildAuditPrompt,
  buildSystemPrompt,
} from '../../utils/promptBuilder.js';

// ── OpenAI-compatible client for Qwen3.5 on Nosana ─────────

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.NOSANA_API_KEY ?? 'nosana',
      baseURL: process.env.NOSANA_ENDPOINT ?? 'http://localhost:8080/v1',
    });
  }
  return openaiClient;
}

// ── JSON extraction & validation ────────────────────────────

/**
 * Extracts JSON from LLM response, handling cases where the model
 * wraps its output in markdown code fences or adds preamble text.
 */
function extractJSON(raw: string): string {
  // Try to find JSON in code fences first
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find a JSON object directly
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0].trim();

  // Return as-is and let the parser fail with a clear error
  return raw.trim();
}

/**
 * Validates and parses the LLM response against our strict schema.
 * Includes retry-friendly error messages.
 */
function parseAuditResponse(raw: string): AuditResponse {
  const jsonStr = extractJSON(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `LLM returned invalid JSON. Raw response:\n${raw.substring(0, 500)}`,
    );
  }

  // Handle single-finding format (backward compatibility)
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'status' in parsed &&
    !('findings' in parsed)
  ) {
    const single = parsed as Record<string, unknown>;
    const contractName =
      (single.contract_name as string) ?? 'Unknown';

    if (single.status === 'secure') {
      return {
        findings: [],
        contract_name: contractName,
        overall_status: 'secure',
        summary: (single.impact_analysis as string) ?? 'Contract appears secure.',
      };
    }

    return {
      findings: [
        {
          status: single.status as 'vulnerable',
          vulnerability_type: 'Semantic Access Control',
          severity: single.severity as 'Critical' | 'High' | 'Medium' | 'Low',
          line_number: (single.line_number as number[]) ?? [],
          impact_analysis: (single.impact_analysis as string) ?? '',
          suggested_patch: (single.suggested_patch as string) ?? '',
        },
      ],
      contract_name: contractName,
      overall_status: 'vulnerable',
      summary: `Found access control vulnerability with ${single.severity} severity.`,
    };
  }

  // Validate against the full schema
  const result = AuditResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `LLM response failed schema validation:\n${issues}\n\nRaw JSON:\n${jsonStr.substring(0, 500)}`,
    );
  }

  return result.data;
}

// ── Core audit execution ────────────────────────────────────

/**
 * Executes the full audit pipeline:
 * 1. Parse Solidity source
 * 2. Build structured prompt
 * 3. Call Qwen3.5 via OpenAI-compatible API
 * 4. Parse & validate response
 * 5. Return structured report
 */
export async function executeAudit(
  contractCode: string,
  contractName?: string,
): Promise<AuditResponse> {
  // Step 1: Parse the Solidity contract
  const parsed = parseSolidityContract(contractCode);
  if (contractName) parsed.name = contractName;

  // Step 2: Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildAuditPrompt(contractCode, parsed);

  // Step 3: Call the model with retry logic
  const model = process.env.NOSANA_MODEL ?? 'Qwen/Qwen3-32B-AWQ';
  const client = getClient();

  let lastError: Error | null = null;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Sentinel] Audit attempt ${attempt}/${MAX_RETRIES} for ${parsed.name}`,
      );

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.05,
        max_tokens: 4096,
      });

      const rawResponse = completion.choices[0]?.message?.content;
      if (!rawResponse) {
        throw new Error('Empty response from model');
      }

      console.log(`[Sentinel] Raw response length: ${rawResponse.length} chars`);

      // Step 4: Parse & validate
      const report = parseAuditResponse(rawResponse);

      // Ensure contract name is set
      report.contract_name = parsed.name;

      console.log(
        `[Sentinel] Audit complete: ${report.overall_status} (${report.findings.length} findings)`,
      );

      return report;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[Sentinel] Attempt ${attempt} failed: ${lastError.message}`,
      );

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw new Error(
    `Audit failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`,
  );
}

// ── ElizaOS v2 Action Definition ────────────────────────────

export const auditContractAction: Action = {
  name: 'AUDIT_SMART_CONTRACT',
  description:
    'Analyzes a Solidity smart contract for Semantic Access Control vulnerabilities, providing RBAC analysis, contextual impact assessment, and automated remediation patches.',
  similes: [
    'audit contract',
    'check smart contract security',
    'analyze solidity',
    'scan for vulnerabilities',
    'security audit',
    'check access control',
  ],

  validate: async (
    _runtime: AgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text = message.content.text ?? '';
    // Validate that the message contains Solidity-like code
    const hasSolidityIndicators =
      text.includes('pragma solidity') ||
      text.includes('contract ') ||
      text.includes('function ') ||
      (text.includes('mapping(') && text.includes('{'));

    return hasSolidityIndicators;
  },

  handler: async (
    _runtime: AgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<void> => {
    const contractCode = message.content.text ?? '';

    try {
      const report = await executeAudit(contractCode);

      await callback?.({
        text: JSON.stringify(report, null, 2),
        data: report as unknown as Record<string, unknown>,
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Unknown audit error';
      console.error(`[Sentinel] Action handler error: ${errorMsg}`);

      await callback?.({
        text: JSON.stringify({
          findings: [],
          contract_name: 'Error',
          overall_status: 'secure',
          summary: `Audit failed: ${errorMsg}`,
        }),
        data: { error: errorMsg },
      });
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract SimpleToken {
    mapping(address => uint256) public balances;
    address public owner;
    constructor() { owner = msg.sender; }
    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
    function burn(address from, uint256 amount) public {
        balances[from] -= amount;
    }
}`,
        },
      },
    ],
  ],
};
