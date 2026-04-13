import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sentinel — Smart Contract Security Auditor',
  description:
    'Decentralized pre-audit defense system for Solidity smart contracts. Detects Semantic Access Control vulnerabilities with AI-powered analysis.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
