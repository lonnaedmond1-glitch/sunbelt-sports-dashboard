'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export interface EvidenceRow {
  label: string;
  value: string;
  detail?: string;
  href?: string;
}

export interface EvidenceDrawerData {
  title: string;
  headlineValue: string;
  headlineCaption: string;
  source: string;
  sourceUpdatedAt?: string;
  explanation: string;
  formula?: string;
  rows?: EvidenceRow[];
}

/**
 * ClickableKpiTile — a KPI tile whose entire surface is a button.
 * Click opens an overlay drawer with a human-readable explanation of the
 * number, the formula, and a table of the source rows that went into it.
 */
export function ClickableKpiTile({
  className = '',
  style,
  children,
  evidence,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  evidence: EvidenceDrawerData;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${className} text-left cursor-pointer transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#20BC64]/40 w-full`}
        style={style}
      >
        {children}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/40 flex justify-end"
          onClick={() => setOpen(false)}
        >
          <aside
            className="w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 bg-white border-b border-[#F1F3F4] px-6 py-5 flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F] mb-1">
                  {evidence.source}
                  {evidence.sourceUpdatedAt ? ` \u00b7 updated ${evidence.sourceUpdatedAt}` : ''}
                </p>
                <h2 className="text-xl font-black text-[#3C4043]">{evidence.title}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#757A7F] hover:text-[#3C4043] text-2xl leading-none px-2"
                aria-label="Close"
              >
                &times;
              </button>
            </header>

            <div className="px-6 py-5 space-y-5">
              {/* Headline */}
              <div className="bg-[#F1F3F4]/50 rounded-xl p-5 border border-[#F1F3F4]">
                <p className="text-4xl font-black text-[#3C4043]">{evidence.headlineValue}</p>
                <p className="text-sm text-[#757A7F] mt-1">{evidence.headlineCaption}</p>
              </div>

              {/* Explanation */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-[#757A7F] mb-2">What this means</h3>
                <p className="text-sm text-[#3C4043] leading-relaxed">{evidence.explanation}</p>
              </div>

              {/* Formula */}
              {evidence.formula && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#757A7F] mb-2">How it\u2019s calculated</h3>
                  <code className="block text-xs font-mono bg-[#F1F3F4]/70 border border-[#F1F3F4] rounded-lg px-3 py-2 text-[#3C4043]">
                    {evidence.formula}
                  </code>
                </div>
              )}

              {/* Source rows */}
              {evidence.rows && evidence.rows.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#757A7F] mb-2">
                    Source rows ({evidence.rows.length})
                  </h3>
                  <div className="border border-[#F1F3F4] rounded-lg overflow-hidden">
                    {evidence.rows.map((r, i) => {
                      const body = (
                        <div
                          key={i}
                          className={`flex justify-between items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-[#F1F3F4]' : ''} ${r.href ? 'hover:bg-[#F1F3F4]/40' : ''}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[#3C4043] truncate">{r.label}</p>
                            {r.detail && <p className="text-xs text-[#757A7F] mt-0.5">{r.detail}</p>}
                          </div>
                          <span className="text-sm font-black text-[#3C4043] flex-shrink-0">{r.value}</span>
                        </div>
                      );
                      return r.href ? (
                        <Link key={i} href={r.href}>
                          {body}
                        </Link>
                      ) : (
                        body
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
