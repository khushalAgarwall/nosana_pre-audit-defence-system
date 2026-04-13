// ─────────────────────────────────────────────────────────────
// Lightweight Solidity Parser
// Extracts structural metadata for semantic access control analysis
// ─────────────────────────────────────────────────────────────

import type {
  ParsedContract,
  ParsedFunction,
  ParsedStateVariable,
  RolePattern,
} from '../types/index.js';

/**
 * Parses Solidity source code and extracts structural metadata
 * relevant to access control analysis. This is NOT a full AST parser —
 * it uses targeted regex patterns to identify RBAC-relevant constructs.
 */
export function parseSolidityContract(sourceCode: string): ParsedContract {
  const lines = sourceCode.split('\n');

  const contractName = extractContractName(sourceCode);
  const inherits = extractInheritance(sourceCode);
  const functions = extractFunctions(sourceCode, lines);
  const stateVariables = extractStateVariables(lines);
  const modifiers = extractModifierNames(sourceCode);
  const events = extractEvents(sourceCode);
  const constructorCode = extractConstructor(sourceCode);
  const rolePatterns = extractRolePatterns(sourceCode, lines);

  return {
    name: contractName,
    inherits,
    functions,
    stateVariables,
    modifiers,
    events,
    constructorCode,
    rawCode: sourceCode,
    rolePatterns,
  };
}

function extractContractName(code: string): string {
  const match = code.match(
    /contract\s+(\w+)\s*(?:is\s+[^{]+)?\s*\{/,
  );
  return match?.[1] ?? 'Unknown';
}

function extractInheritance(code: string): string[] {
  const match = code.match(
    /contract\s+\w+\s+is\s+([^{]+)\s*\{/,
  );
  if (!match) return [];
  return match[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function extractFunctions(
  code: string,
  lines: string[],
): ParsedFunction[] {
  const functions: ParsedFunction[] = [];
  const funcRegex =
    /function\s+(\w+)\s*\(([^)]*)\)\s*((?:public|external|internal|private)\s*)?([^{]*)\{/g;

  let match: RegExpExecArray | null;
  while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1];
    const parameters = match[2].trim();
    const explicitVisibility = match[3]?.trim() as
      | ParsedFunction['visibility']
      | undefined;
    const modifierBlock = match[4] ?? '';

    // Determine line number
    const charIndex = match.index;
    const lineNumber = code.substring(0, charIndex).split('\n').length;

    // Extract modifiers from the block between ) and {
    const modifiers = extractModifiersFromBlock(modifierBlock);

    // Determine visibility
    const visibility = explicitVisibility ?? detectVisibility(modifierBlock);

    // Determine if state-changing
    const isStateChanging = detectStateChanging(
      name,
      modifierBlock,
      extractFunctionBody(code, match.index),
    );

    functions.push({
      name,
      visibility,
      modifiers,
      isStateChanging,
      parameters,
      lineNumber,
      body: extractFunctionBody(code, match.index),
    });
  }

  return functions;
}

function extractModifiersFromBlock(block: string): string[] {
  const modifiers: string[] = [];
  // Remove visibility and mutability keywords
  const cleaned = block
    .replace(/\b(public|external|internal|private|view|pure|payable|virtual|override|returns\s*\([^)]*\))\b/g, '')
    .trim();

  // Split remaining tokens — each is a modifier (possibly with args)
  const modRegex = /(\w+)(?:\([^)]*\))?/g;
  let m: RegExpExecArray | null;
  while ((m = modRegex.exec(cleaned)) !== null) {
    if (m[1] && m[1].length > 0) {
      modifiers.push(m[1]);
    }
  }
  return modifiers;
}

function detectVisibility(
  block: string,
): ParsedFunction['visibility'] {
  if (/\bexternal\b/.test(block)) return 'external';
  if (/\binternal\b/.test(block)) return 'internal';
  if (/\bprivate\b/.test(block)) return 'private';
  return 'public'; // Solidity default
}

function detectStateChanging(
  _name: string,
  modifierBlock: string,
  body: string,
): boolean {
  // If it's view or pure, it's not state-changing
  if (/\b(view|pure)\b/.test(modifierBlock)) return false;

  // Check for state-changing operations in the body
  const stateChangingPatterns = [
    /\b\w+\s*=\s*/,        // Assignment
    /\b\w+\s*\+=\s*/,      // Increment
    /\b\w+\s*-=\s*/,       // Decrement
    /\.transfer\(/,         // ETH transfer
    /\.send\(/,             // ETH send
    /\.call\{/,             // Low-level call
    /\bdelete\b/,           // Delete
    /\bemit\b/,             // Event emission
    /\.push\(/,             // Array push
    /\.pop\(/,              // Array pop
    /\bselfdestruct\b/,     // Self-destruct
  ];

  return stateChangingPatterns.some((p) => p.test(body));
}

function extractFunctionBody(
  code: string,
  startIndex: number,
): string {
  let braceCount = 0;
  let bodyStart = -1;

  for (let i = startIndex; i < code.length; i++) {
    if (code[i] === '{') {
      if (braceCount === 0) bodyStart = i;
      braceCount++;
    } else if (code[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        return code.substring(bodyStart, i + 1);
      }
    }
  }

  return '';
}

function extractStateVariables(lines: string[]): ParsedStateVariable[] {
  const variables: ParsedStateVariable[] = [];
  const varRegex =
    /^\s*(mapping\s*\([^)]+\)|address|uint\d*|int\d*|bool|bytes\d*|string|bytes)\s+(public|internal|private)?\s*(\w+)\s*[;=]/;

  lines.forEach((line, index) => {
    const match = line.match(varRegex);
    if (match) {
      variables.push({
        type: match[1].trim(),
        visibility: (match[2] as ParsedStateVariable['visibility']) ?? 'internal',
        name: match[3],
        lineNumber: index + 1,
      });
    }
  });

  return variables;
}

function extractModifierNames(code: string): string[] {
  const modifiers: string[] = [];
  const modRegex = /modifier\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = modRegex.exec(code)) !== null) {
    modifiers.push(match[1]);
  }
  return modifiers;
}

function extractEvents(code: string): string[] {
  const events: string[] = [];
  const eventRegex = /event\s+(\w+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = eventRegex.exec(code)) !== null) {
    events.push(match[1]);
  }
  return events;
}

function extractConstructor(code: string): string | null {
  const match = code.match(/constructor\s*\([^)]*\)[^{]*\{/);
  if (!match) return null;
  return extractFunctionBody(code, match.index!);
}

/**
 * Identifies access control patterns in the contract
 */
function extractRolePatterns(
  code: string,
  lines: string[],
): RolePattern[] {
  const patterns: RolePattern[] = [];

  // Detect role-based mappings (e.g., mapping(address => bool) isAdmin)
  lines.forEach((line, index) => {
    if (/mapping\s*\(\s*address\s*=>/.test(line)) {
      const roleNames = [
        'admin', 'owner', 'minter', 'pauser', 'role',
        'authorized', 'whitelist', 'blacklist', 'operator',
        'manager', 'governor', 'guardian',
      ];
      const lower = line.toLowerCase();
      if (roleNames.some((r) => lower.includes(r))) {
        patterns.push({
          type: 'mapping',
          identifier: line.trim(),
          lineNumber: index + 1,
          context: 'Role-based address mapping detected',
        });
      }
    }
  });

  // Detect Ownable pattern
  if (/\bOwnable\b/.test(code)) {
    patterns.push({
      type: 'ownable',
      identifier: 'Ownable',
      lineNumber: 1,
      context: 'Contract inherits OpenZeppelin Ownable',
    });
  }

  // Detect AccessControl pattern
  if (/\bAccessControl\b/.test(code)) {
    patterns.push({
      type: 'access-control',
      identifier: 'AccessControl',
      lineNumber: 1,
      context: 'Contract uses OpenZeppelin AccessControl',
    });
  }

  // Detect require(msg.sender == ...) patterns
  const requireRegex = /require\s*\(\s*msg\.sender\s*==\s*([^,)]+)/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(code)) !== null) {
    const lineNum = code.substring(0, match.index).split('\n').length;
    patterns.push({
      type: 'require',
      identifier: match[1].trim(),
      lineNumber: lineNum,
      context: `Direct msg.sender check against ${match[1].trim()}`,
    });
  }

  // Detect custom modifier definitions
  const modRegex = /modifier\s+(\w+)/g;
  while ((match = modRegex.exec(code)) !== null) {
    const lineNum = code.substring(0, match.index).split('\n').length;
    patterns.push({
      type: 'modifier',
      identifier: match[1],
      lineNumber: lineNum,
      context: `Custom modifier: ${match[1]}`,
    });
  }

  return patterns;
}

/**
 * Generates a human-readable summary of the parsed contract
 * for inclusion in LLM prompts.
 */
export function contractSummary(parsed: ParsedContract): string {
  const sections: string[] = [];

  sections.push(`Contract: ${parsed.name}`);
  if (parsed.inherits.length > 0) {
    sections.push(`Inherits: ${parsed.inherits.join(', ')}`);
  }

  sections.push(`\nState Variables (${parsed.stateVariables.length}):`);
  parsed.stateVariables.forEach((v) => {
    sections.push(`  L${v.lineNumber}: ${v.visibility} ${v.type} ${v.name}`);
  });

  sections.push(`\nFunctions (${parsed.functions.length}):`);
  parsed.functions.forEach((f) => {
    const mods = f.modifiers.length > 0 ? ` [${f.modifiers.join(', ')}]` : '';
    const stateTag = f.isStateChanging ? ' ⚠️ STATE-CHANGING' : '';
    sections.push(
      `  L${f.lineNumber}: ${f.visibility} ${f.name}(${f.parameters})${mods}${stateTag}`,
    );
  });

  sections.push(`\nDefined Modifiers: ${parsed.modifiers.join(', ') || 'none'}`);

  sections.push(`\nAccess Control Patterns (${parsed.rolePatterns.length}):`);
  parsed.rolePatterns.forEach((r) => {
    sections.push(`  L${r.lineNumber} [${r.type}]: ${r.context}`);
  });

  return sections.join('\n');
}
