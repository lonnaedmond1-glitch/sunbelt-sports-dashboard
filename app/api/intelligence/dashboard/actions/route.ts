import { NextResponse } from 'next/server';
import { appendDashboardActionEvent } from '@/lib/intelligence-store';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const loggedAt = new Date().toISOString();
  const actionType = String(body.actionType || '');
  const actionPayload = body.actionPayload && typeof body.actionPayload === 'object'
    ? body.actionPayload as Record<string, unknown>
    : {};
  const actionId = String(body.actionId || '');
  if (!actionId || !actionType) {
    return NextResponse.json({ ok: false, error: 'actionId and actionType are required.' }, { status: 400 });
  }

  const sourceEvidenceIds = Array.isArray(body.sourceEvidenceIds)
    ? body.sourceEvidenceIds.map(String)
    : [];

  const event = {
    id: `dashboard-action-${loggedAt}-${actionId}`,
    actionId,
    actionTitle: String(body.actionTitle || body.title || ''),
    actionType,
    owner: body.owner ? String(body.owner) : null,
    status: String(body.status || 'IN_PROGRESS'),
    note: String(body.note || actionPayload.note || ''),
    actionPayload,
    sourceEvidenceIds,
    createdAt: loggedAt,
  };

  const storage = await appendDashboardActionEvent(event);

  console.info(JSON.stringify({
    event: 'dashboard_intelligence_user_action_taken',
    at: loggedAt,
    actionId: event.actionId,
    title: event.actionTitle,
    owner: event.owner || '',
    actionType: event.actionType,
    storageTarget: storage.target,
  }));

  if (actionType === 'SEND_EMAIL_DRAFT') {
    const to = String(actionPayload.emailTo || '');
    const subject = String(actionPayload.emailSubject || event.actionTitle || 'Operations follow-up');
    const bodyText = String(actionPayload.emailBody || event.note || event.actionTitle || 'Please review this operations item.');
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    return NextResponse.json({ ok: true, loggedAt, storage, mailto, message: 'Draft saved' });
  }

  return NextResponse.json({ ok: true, loggedAt, storage, message: 'Saved' });
}
