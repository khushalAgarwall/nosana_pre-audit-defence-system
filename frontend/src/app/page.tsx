'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types matching backend AuditResponse schema ─────────────

interface AuditFinding {
  status: 'vulnerable' | 'secure';
  vulnerability_type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  line_number: number[];
  impact_analysis: string;
  suggested_patch: string;
  historical_pattern?: string;
}

interface AuditReport {
  findings: AuditFinding[];
  contract_name: string;
  overall_status: 'vulnerable' | 'secure';
  summary: string;
}

interface AuditApiResponse {
  id: string;
  contractName: string;
  timestamp: string;
  status: 'completed' | 'error';
  report?: AuditReport;
  error?: string;
}

interface AuditHistoryItem {
  id: string;
  contractName: string;
  timestamp: string;
  status: 'completed' | 'error';
  overallStatus?: 'vulnerable' | 'secure';
}

// ── Constants ───────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const TERMINAL_MESSAGES = [
  'Connecting to Nosana GPU node...',
  'Parsing Abstract Syntax Tree...',
  'Evaluating Semantic Roles...',
  'Generating strict Zod schema...',
] as const;

const SAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableVault {
    mapping(address => uint256) public balances;
    address public owner;
    bool public paused;

    constructor() {
        owner = msg.sender;
    }

    // VULNERABILITY: No access control — anyone can deposit for others
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    // VULNERABILITY: No access control — anyone can withdraw anyone's funds
    function withdrawAll(address payable to) public {
        uint256 amount = balances[to];
        balances[to] = 0;
        to.transfer(amount);
    }

    // VULNERABILITY: No access control — anyone can pause
    function pause() public {
        paused = true;
    }

    // VULNERABILITY: No access control — anyone can change owner
    function setOwner(address newOwner) public {
        owner = newOwner;
    }

    // VULNERABILITY: No access control — anyone can destroy
    function destroy() public {
        selfdestruct(payable(owner));
    }
}`;

// ── Severity helpers ────────────────────────────────────────

function severityColor(severity: string): string {
  switch (severity) {
    case 'Critical': return 'severity-critical';
    case 'High': return 'severity-high';
    case 'Medium': return 'severity-medium';
    case 'Low': return 'severity-low';
    default: return '';
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'Critical': return '🔴';
    case 'High': return '🟠';
    case 'Medium': return '🟡';
    case 'Low': return '🔵';
    default: return '⚪';
  }
}

// ── Page Component ──────────────────────────────────────────

export default function HomePage() {
  const [contractCode, setContractCode] = useState('');
  const [contractName, setContractName] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [result, setResult] = useState<AuditApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Recent audits history ─────────────────────────────────
  const [recentAudits, setRecentAudits] = useState<AuditHistoryItem[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/audits`);
      if (res.ok) {
        const data: AuditHistoryItem[] = await res.json();
        setRecentAudits(data);
      }
    } catch {
      // silently ignore — history is non-critical
    }
  }, []);

  // Fetch on mount + re-fetch whenever a new audit result lands
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, result]);

  // ── Terminal-style loading message cycler ──────────────────
  const [terminalIdx, setTerminalIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isAuditing) {
      setTerminalIdx(0);
      intervalRef.current = setInterval(() => {
        setTerminalIdx((prev) => (prev + 1) % TERMINAL_MESSAGES.length);
      }, 1500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuditing]);

  const handleSubmitAudit = useCallback(async () => {
    if (!contractCode.trim()) {
      setError('Please paste your Solidity contract code.');
      return;
    }

    setIsAuditing(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractCode: contractCode.trim(),
          contractName: contractName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error ?? `Server returned ${response.status}`,
        );
      }

      const data: AuditApiResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred.',
      );
    } finally {
      setIsAuditing(false);
    }
  }, [contractCode, contractName]);

  const handleLoadSample = useCallback(() => {
    setContractCode(SAMPLE_CONTRACT);
    setContractName('VulnerableVault');
    setResult(null);
    setError(null);
  }, []);

  const report = result?.report;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* ── Header ──────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sentinel-primary to-sentinel-secondary flex items-center justify-center text-xl">
              🛡️
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sentinel-primary-light via-white to-sentinel-secondary">
              Sentinel
            </h1>
          </div>
          <p className="text-sentinel-text-dim text-lg max-w-2xl mx-auto">
            Decentralized Smart Contract Pre-Audit Defense — Semantic Access Control Analyzer
          </p>
          <p className="text-sentinel-text-muted text-sm">
            Powered by Nosana GPU Network · Qwen 3.5-27B
          </p>
        </motion.header>

        {/* ── Contract Input ──────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              Submit Contract
            </h2>
            <button
              onClick={handleLoadSample}
              className="btn-secondary text-sm !px-4 !py-2"
              id="load-sample-btn"
            >
              📋 Load Sample
            </button>
          </div>

          <input
            type="text"
            value={contractName}
            onChange={(e) => setContractName(e.target.value)}
            placeholder="Contract name (optional)"
            className="w-full px-4 py-3 bg-sentinel-bg border border-sentinel-border rounded-xl
                       text-sentinel-text placeholder-sentinel-text-muted
                       focus:outline-none focus:border-sentinel-primary/50
                       transition-all duration-300"
            id="contract-name-input"
          />

          <div className={isAuditing ? 'scanning-overlay' : ''}>
            <textarea
              value={contractCode}
              onChange={(e) => setContractCode(e.target.value)}
              placeholder={`// Paste your Solidity contract here...\n// Example:\npragma solidity ^0.8.0;\n\ncontract MyToken {\n    ...\n}`}
              className="code-editor"
              rows={16}
              spellCheck={false}
              id="contract-code-input"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sentinel-text-muted text-sm">
              {contractCode.length > 0
                ? `${contractCode.split('\n').length} lines · ${contractCode.length.toLocaleString()} chars`
                : 'No code entered'}
            </span>

            <button
              onClick={handleSubmitAudit}
              disabled={isAuditing || !contractCode.trim()}
              className="btn-primary"
              id="submit-audit-btn"
            >
              {isAuditing ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Auditing…
                </>
              ) : (
                <>
                  🔍 Run Audit
                </>
              )}
            </button>
          </div>
        </motion.section>

        {/* ── Recent Audits ────────────────────────────────── */}
        {recentAudits.length > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="glass-card p-5"
            id="recent-audits"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-sentinel-text-muted mb-3">
              Recent Audits
            </h2>
            <ul className="divide-y divide-sentinel-border/40">
              {recentAudits.map((audit) => (
                <li
                  key={audit.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Status dot */}
                    <span
                      className={`shrink-0 h-2 w-2 rounded-full ${audit.overallStatus === 'secure'
                          ? 'bg-emerald-400'
                          : audit.overallStatus === 'vulnerable'
                            ? 'bg-red-400'
                            : 'bg-gray-500'
                        }`}
                    />
                    <span className="text-sm text-sentinel-text truncate">
                      {audit.contractName || 'Unnamed Contract'}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-sentinel-text-muted ml-4">
                    {new Date(audit.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* ── Terminal Loading Display ─────────────────────── */}
        <AnimatePresence>
          {isAuditing && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-card border-green-500/20 p-6"
              id="terminal-loading"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-widest text-green-400/80">
                  Sentinel Engine Active
                </span>
              </div>

              <div className="bg-black/60 rounded-xl border border-green-500/10 p-5 font-mono text-sm space-y-2 overflow-hidden">
                {TERMINAL_MESSAGES.map((msg, i) => (
                  <div
                    key={msg}
                    className={`flex items-center gap-2 transition-all duration-500 ${i < terminalIdx
                        ? 'text-green-600/50'
                        : i === terminalIdx
                          ? 'text-green-400 animate-pulse drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]'
                          : 'text-green-900/30'
                      }`}
                  >
                    <span>{i <= terminalIdx ? '▸' : '◦'}</span>
                    <span>{msg}</span>
                    {i === terminalIdx && (
                      <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-1" />
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error Display ───────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass-card border-red-500/30 p-5"
              id="error-display"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h3 className="font-semibold text-red-400">Audit Error</h3>
                  <p className="text-sentinel-text-dim mt-1">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Audit Report ── Cybersecurity Dashboard ──────── */}
        <AnimatePresence>
          {report && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-5"
              id="audit-report"
            >
              {/* ── Summary Banner ────────────────────────────── */}
              <div
                className={`glass-card p-0 overflow-hidden border-l-4 ${report.overall_status === 'vulnerable'
                    ? 'border-l-red-500'
                    : 'border-l-emerald-500'
                  }`}
              >
                {/* Top strip */}
                <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl leading-none">
                        {report.overall_status === 'vulnerable' ? '🚨' : '✅'}
                      </span>
                      <h2 className="text-xl font-bold text-white truncate">
                        {report.contract_name}
                      </h2>
                    </div>
                    <p className="text-sentinel-text-dim text-sm leading-relaxed">
                      {report.summary}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-3.5 py-1 rounded-md text-xs font-bold font-mono uppercase tracking-wider ${report.overall_status === 'vulnerable'
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                  >
                    {report.overall_status}
                  </span>
                </div>

                {/* Severity breakdown counters */}
                <div className="border-t border-sentinel-border/60 px-6 py-3 flex items-center gap-6 bg-black/20 text-xs">
                  {(['Critical', 'High', 'Medium', 'Low'] as const).map((sev) => {
                    const count = report.findings.filter((f) => f.severity === sev).length;
                    const color: Record<string, string> = {
                      Critical: 'text-red-400',
                      High: 'text-orange-400',
                      Medium: 'text-yellow-400',
                      Low: 'text-blue-400',
                    };
                    return (
                      <div key={sev} className="flex items-center gap-1.5">
                        <span className={`font-mono font-bold text-sm ${color[sev]}`}>
                          {count}
                        </span>
                        <span className="text-sentinel-text-muted uppercase tracking-wide">
                          {sev}
                        </span>
                      </div>
                    );
                  })}
                  <div className="ml-auto text-sentinel-text-muted">
                    {report.findings.length} total finding{report.findings.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* ── Findings Grid ─────────────────────────────── */}
              <div className="space-y-4">
                {report.findings.map((finding, index) => {
                  const borderMap: Record<string, string> = {
                    Critical: 'border-l-red-500',
                    High: 'border-l-orange-500',
                    Medium: 'border-l-yellow-500',
                    Low: 'border-l-blue-500',
                  };
                  const badgeBg: Record<string, string> = {
                    Critical: 'bg-red-500/15 text-red-400 border-red-500/30',
                    High: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
                    Medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
                    Low: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                  };

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay: index * 0.06 }}
                      className={`glass-card border-l-4 ${borderMap[finding.severity] ?? ''} p-5 space-y-4`}
                      id={`finding-${index}`}
                    >
                      {/* Row 1 — Vulnerability type + severity badge */}
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-bold text-white leading-tight">
                          {finding.vulnerability_type}
                        </h3>
                        <span
                          className={`shrink-0 px-2.5 py-0.5 rounded font-mono text-[11px] font-bold uppercase tracking-wider border ${badgeBg[finding.severity] ?? ''}`}
                        >
                          {finding.severity}
                        </span>
                      </div>

                      {/* Row 2 — Line numbers */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider text-sentinel-text-muted">
                          Affected Lines
                        </span>
                        <span className="font-mono text-sm text-gray-400 bg-black/30 px-2 py-0.5 rounded">
                          {finding.line_number.join(', ')}
                        </span>
                      </div>

                      {/* Row 3 — Impact analysis */}
                      <div>
                        <h4 className="text-[11px] uppercase tracking-wider text-sentinel-text-muted mb-1.5">
                          Impact Analysis
                        </h4>
                        <p className="text-sm text-sentinel-text leading-relaxed">
                          {finding.impact_analysis}
                        </p>
                      </div>

                      {/* Row 4 — Suggested patch */}
                      {finding.suggested_patch && (
                        <div>
                          <h4 className="text-[11px] uppercase tracking-wider text-sentinel-text-muted mb-1.5">
                            Suggested Patch
                          </h4>
                          <pre className="bg-gray-900 rounded-md p-3 font-mono text-sm text-blue-300 overflow-x-auto whitespace-pre-wrap border border-gray-800/60">
                            {finding.suggested_patch}
                          </pre>
                        </div>
                      )}

                      {/* Row 5 — Eliza memory layer */}
                      {finding.historical_pattern && (
                        <div className="bg-indigo-900/30 border-l-4 border-indigo-500 p-4 mt-4 rounded-r-md">
                          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-indigo-400 mb-1">
                            🧠 ELIZA SYSTEM MEMORY:
                          </p>
                          <p className="text-sm text-indigo-200 leading-relaxed">
                            {finding.historical_pattern}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* ── Metadata footer ───────────────────────────── */}
              {result && (
                <div className="flex items-center justify-center gap-6 text-sentinel-text-muted text-xs font-mono pt-2 pb-1">
                  <span>ID {result.id}</span>
                  <span className="text-sentinel-border">│</span>
                  <span>{new Date(result.timestamp).toLocaleString()}</span>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="text-center text-sentinel-text-muted text-sm pb-8 pt-4">
          <p>
            Sentinel · Decentralized Pre-Audit Defense · Built on{' '}
            <a
              href="https://nosana.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sentinel-secondary hover:text-sentinel-secondary/80 transition-colors"
            >
              Nosana
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
