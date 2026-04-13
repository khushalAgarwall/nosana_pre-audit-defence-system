'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types matching backend AuditResponse schema ─────────────

interface AuditFinding {
  status: 'vulnerable' | 'secure';
  vulnerability_type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  line_number: number[];
  impact_analysis: string;
  suggested_patch: string;
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

// ── Constants ───────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

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
                  Analyzing...
                </>
              ) : (
                <>
                  🔍 Run Audit
                </>
              )}
            </button>
          </div>
        </motion.section>

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

        {/* ── Audit Report ────────────────────────────────── */}
        <AnimatePresence>
          {report && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
              id="audit-report"
            >
              {/* Summary Card */}
              <div
                className={`glass-card p-6 border-l-4 ${
                  report.overall_status === 'vulnerable'
                    ? 'border-l-red-500'
                    : 'border-l-emerald-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">
                        {report.overall_status === 'vulnerable' ? '🚨' : '✅'}
                      </span>
                      <h2 className="text-2xl font-bold text-white">
                        {report.contract_name}
                      </h2>
                    </div>
                    <p className="text-sentinel-text-dim">{report.summary}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide ${
                        report.overall_status === 'vulnerable'
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {report.overall_status}
                    </span>
                    <p className="text-sentinel-text-muted text-sm mt-2">
                      {report.findings.length} finding{report.findings.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Findings */}
              {report.findings.map((finding, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="glass-card p-6 space-y-4"
                  id={`finding-${index}`}
                >
                  {/* Finding header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{severityIcon(finding.severity)}</span>
                      <h3 className="text-lg font-semibold text-white">
                        {finding.vulnerability_type}
                      </h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border ${severityColor(finding.severity)}`}
                    >
                      {finding.severity}
                    </span>
                  </div>

                  {/* Affected lines */}
                  <div className="flex items-center gap-2 text-sm text-sentinel-text-dim">
                    <span className="font-mono bg-sentinel-bg px-2 py-0.5 rounded">
                      Lines: {finding.line_number.join(', ')}
                    </span>
                  </div>

                  {/* Impact */}
                  <div>
                    <h4 className="text-sm font-semibold text-sentinel-text-dim uppercase tracking-wide mb-2">
                      Impact Analysis
                    </h4>
                    <p className="text-sentinel-text leading-relaxed">
                      {finding.impact_analysis}
                    </p>
                  </div>

                  {/* Suggested patch */}
                  {finding.suggested_patch && (
                    <div>
                      <h4 className="text-sm font-semibold text-sentinel-text-dim uppercase tracking-wide mb-2">
                        Suggested Patch
                      </h4>
                      <pre className="bg-sentinel-bg border border-sentinel-border rounded-xl p-4 overflow-x-auto text-sm font-mono text-emerald-300 whitespace-pre-wrap">
                        {finding.suggested_patch}
                      </pre>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Metadata footer */}
              {result && (
                <div className="text-center text-sentinel-text-muted text-sm space-y-1 pt-2">
                  <p>Audit ID: <span className="font-mono">{result.id}</span></p>
                  <p>Completed: {new Date(result.timestamp).toLocaleString()}</p>
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
