'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OperationsEvidence, OperationsNextAction, OperationsActionType } from '@/lib/dashboard-intelligence';

export function RegenerateBriefButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const regenerate = () => {
    setMessage('');
    startTransition(async () => {
      try {
        const res = await fetch('/api/intelligence/dashboard/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'dashboard_button' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMessage('Brief refreshed');
        router.refresh();
      } catch {
        setMessage('Refresh failed');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={regenerate}
        disabled={isPending}
        className="rounded-md border border-[#3C4043] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#3C4043] transition hover:bg-[#F1F3F4] disabled:opacity-60"
      >
        {isPending ? 'Regenerating' : 'Regenerate Brief'}
      </button>
      {message && <span className="text-[10px] font-bold text-[#757A7F]">{message}</span>}
    </div>
  );
}

export function OperationsActionControls({
  action,
  evidence,
}: {
  action: OperationsNextAction;
  evidence: OperationsEvidence[];
}) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const evidenceMap = useMemo(() => new Map(evidence.map(item => [item.id, item])), [evidence]);
  const actionEvidence = action.sourceEvidenceIds.map(id => evidenceMap.get(id)).filter(Boolean) as OperationsEvidence[];
  const sourceUrl = actionEvidence.find(item => item.sourceUrl)?.sourceUrl || '';
  const payloadHref = typeof action.actionPayload.href === 'string' ? action.actionPayload.href : '';
  const jobNumber = typeof action.actionPayload.jobNumber === 'string' ? action.actionPayload.jobNumber : '';
  const jobUrl = jobNumber ? `/jobs/${jobNumber}` : payloadHref.startsWith('/jobs/') ? payloadHref : '';

  const postAction = async (actionType: OperationsActionType, extra: Record<string, unknown> = {}) => {
    setBusy(actionType);
    setMessage('');
    try {
      const res = await fetch('/api/intelligence/dashboard/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: action.id,
          actionTitle: action.title,
          actionType,
          owner: action.owner,
          status: actionType === 'MARK_RESOLVED' ? 'DONE' : actionType === 'SNOOZE' ? 'SNOOZED' : 'IN_PROGRESS',
          sourceEvidenceIds: action.sourceEvidenceIds,
          actionPayload: { ...action.actionPayload, ...extra, actionType },
          note: extra.note || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.mailto) window.location.href = data.mailto;
      setMessage(data.message || 'Saved');
    } catch {
      setMessage('Action failed');
    } finally {
      setBusy('');
    }
  };

  const promptAndPost = (actionType: OperationsActionType) => {
    if (actionType === 'ASSIGN_OWNER') {
      const owner = window.prompt('Owner name');
      if (!owner) return;
      void postAction(actionType, { owner, note: `Assigned owner: ${owner}` });
      return;
    }
    if (actionType === 'SNOOZE') {
      const snoozeUntil = window.prompt('Snooze until date/time');
      if (!snoozeUntil) return;
      void postAction(actionType, { snoozeUntil, note: `Snoozed until ${snoozeUntil}` });
      return;
    }
    if (actionType === 'CREATE_REMINDER') {
      const reminderAt = window.prompt('Reminder date/time');
      if (!reminderAt) return;
      void postAction(actionType, { reminderAt, note: `Reminder set for ${reminderAt}` });
      return;
    }
    if (actionType === 'MARK_RESOLVED') {
      const note = window.prompt('Resolution note or evidence');
      if (!note) return;
      void postAction(actionType, { note });
      return;
    }
    if (actionType === 'ESCALATE') {
      const note = window.prompt('Escalation note');
      void postAction(actionType, { note: note || 'Escalated from dashboard brief.' });
      return;
    }
    void postAction(actionType);
  };

  const buttonClass = "rounded-md border border-[#D6DADC] bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#3C4043] transition hover:bg-[#F1F3F4] disabled:opacity-60";

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {sourceUrl && (
        <Link href={sourceUrl} className="rounded-md bg-[#3C4043] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:opacity-85">
          Open source
        </Link>
      )}
      {jobUrl && (
        <Link href={jobUrl} className="rounded-md bg-[#3C4043] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:opacity-85">
          Open job
        </Link>
      )}
      {(['CREATE_TASK', 'ASSIGN_OWNER', 'SEND_EMAIL_DRAFT', 'CREATE_REMINDER', 'ESCALATE', 'SNOOZE', 'MARK_RESOLVED'] as OperationsActionType[]).map(actionType => (
        <button
          key={`${action.id}-${actionType}`}
          type="button"
          onClick={() => promptAndPost(actionType)}
          disabled={busy === actionType}
          className={actionType === 'SEND_EMAIL_DRAFT'
            ? "rounded-md border border-[#0BBE63]/30 bg-[#E8F8EF] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#0A8F4A] transition hover:opacity-85 disabled:opacity-60"
            : buttonClass}
        >
          {busy === actionType ? 'Saving' : actionType === 'SEND_EMAIL_DRAFT' ? 'Email draft' : actionType.replace(/_/g, ' ').toLowerCase()}
        </button>
      ))}
      {message && (
        <span className={`px-2 py-1 text-[10px] font-bold ${message === 'Action failed' ? 'text-[#E04343]' : 'text-[#0A8F4A]'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
