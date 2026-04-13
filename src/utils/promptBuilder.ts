// ─────────────────────────────────────────────────────────────
// Prompt Builder — Constructs the audit prompt for Qwen3.5
// Engineered for strict JSON output & semantic analysis depth
// ─────────────────────────────────────────────────────────────

import type { ParsedContract } from '../types/index.js';
import { contractSummary } from './solidityParser.js';

/**
 * Builds the complete system prompt for the audit LLM.
 * Incorporates:
 * - Role definition & expertise framing
 * - Strict JSON schema enforcement
 * - Semantic access control analysis framework
 */
export function buildSystemPrompt(): string {
  return `You are Sentinel, an elite smart contract security auditor specializing in Semantic Access Control vulnerability detection.

Your analysis MUST cover three dimensions:

1. **RBAC Logic Analysis**: Determine if the correct roles have appropriate access to every state-changing function. Look for:
   - Missing access control on state-changing functions
   - Incorrect role assignments (e.g., any address can call admin-only functions)
   - Missing modifier protections on critical operations
   - Privilege escalation paths (e.g., a user can grant themselves admin)
   - Unprotected initialization or configuration functions
   - Public functions that should be restricted

2. **Contextual Impact Assessment**: For every finding, explain the REAL-WORLD impact:
   - What can an attacker do with this vulnerability?
   - What is the financial risk (fund theft, token manipulation, etc.)?
   - What is the governance risk (unauthorized control changes)?
   - How does this affect the contract's intended security model?

3. **Automated Remediation**: Write the EXACT Solidity code patch that fixes the vulnerability:
   - Must be syntactically correct Solidity
   - Must follow established patterns (OpenZeppelin where applicable)
   - Must be gas-efficient
   - Must be a drop-in replacement for the vulnerable code

OUTPUT FORMAT — You MUST return ONLY a valid JSON object. No markdown code fences, no explanation text, no conversational response. Just the raw JSON.

If you find vulnerabilities, return an object with a "findings" array:
{
  "findings": [
    {
      "status": "vulnerable",
      "vulnerability_type": "Semantic Access Control",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "line_number": [<affected line numbers as integers>],
      "impact_analysis": "<Plain English explanation of the financial/logic risk>",
      "suggested_patch": "<Exact Solidity code block resolving the issue>"
    }
  ],
  "contract_name": "<Name of the contract>",
  "overall_status": "vulnerable",
  "summary": "<Overall security assessment in 1-2 sentences>"
}

If the contract is SECURE, return:
{
  "findings": [],
  "contract_name": "<Name of the contract>",
  "overall_status": "secure",
  "summary": "<Brief confirmation of security posture>"
}

CRITICAL RULES:
- Return ONLY the JSON object. No other text.
- Do NOT wrap in markdown code fences.
- severity must be exactly one of: "Critical", "High", "Medium", "Low"
- line_number must be an array of positive integers
- Every state-changing function without access control IS a finding
- Do not report view/pure functions as access control issues
- Be precise with line numbers — they must match the source code`;
}

/**
 * Builds the user prompt with the contract code and parsed metadata.
 * The metadata helps the LLM focus on relevant areas.
 */
export function buildAuditPrompt(
  sourceCode: string,
  parsed: ParsedContract,
): string {
  const summary = contractSummary(parsed);

  return `Analyze the following Solidity smart contract for Semantic Access Control vulnerabilities.

═══════════════════════════════════════════
CONTRACT METADATA (pre-parsed for reference)
═══════════════════════════════════════════
${summary}

═══════════════════════════════════════════
FULL SOURCE CODE
═══════════════════════════════════════════
${sourceCode}

═══════════════════════════════════════════
ANALYSIS INSTRUCTIONS
═══════════════════════════════════════════
1. Examine EVERY state-changing function (listed above with ⚠️ STATE-CHANGING)
2. For each, determine if the access control is semantically correct:
   - Is there a modifier/require protecting it?
   - Is the protection checking the RIGHT role for that operation?
   - Can an unauthorized user bypass the check?
3. Check for privilege escalation: Can a lower-privilege role gain higher access?
4. Check for unprotected initialization: Can critical state be set by anyone?
5. Return your findings as the strict JSON schema defined in your instructions.

Analyze now and return ONLY the JSON response:`;
}

/**
 * Builds a focused prompt for re-analysis or specific vulnerability deep-dive
 */
export function buildDeepDivePrompt(
  sourceCode: string,
  functionName: string,
  lineNumber: number,
): string {
  return `Perform a deep-dive security analysis on the function "${functionName}" at line ${lineNumber} in the following Solidity contract.

Focus specifically on:
1. Is the access control semantically appropriate for what this function does?
2. What is the worst-case exploit scenario if access control is missing/wrong?
3. What is the exact code fix needed?

Source code:
${sourceCode}

Return ONLY the JSON response as specified in your system instructions.`;
}
