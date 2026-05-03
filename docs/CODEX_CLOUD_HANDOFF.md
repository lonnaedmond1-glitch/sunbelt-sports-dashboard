# Codex Cloud Handoff

Last updated: 2026-05-03

## Active Operating Context

- Dashboard repo: `lonnaedmond1-glitch/sunbelt-sports-dashboard`
- Dashboard branch for resume: `codex/cloud-handoff-dashboard-state`
- Local dashboard path: `/Users/lonnaedmond/Documents/New project/sunbelt-sports-dashboard-src`
- Google Sheet source of truth: `1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY`
- Bound Apps Script project: `1kKeuocEbq2g1vzHcg0smLllDvJTwD9KeHqVvwt8dVynGfV1Ig_d-JCKG`
- Apps Script mirror repo: `lonnaedmond1-glitch/sunbelt-apps-script-control`
- Apps Script branch for resume: `codex/apps-script-rebuild-baseline`

## Current Production Facts

- Google Sheets is the source of truth.
- The dashboard is not live for business users yet; data integrity is blocking deployment.
- Existing systems must still be handled with controlled surgery: read real headers, make one focused change, verify, then report.
- Do not delete tabs or restructure the workbook without explicit approval at the moment of deletion.
- Do not push Apps Script to production without checking the exact diff first.

## Last Verified Apps Script State

- Last rebuild commit: `871ac1e Improve field job alias integrity rebuild`
- Final rebuild function: `runFinalIntegrityRebuild`
- Last verified workbook audit timestamp from prior local session: `2026-05-02 23:17:40`
- `SCORECARD DASHBOARD` was protected from legacy overwrite by making legacy `reconcileNow` / `fullRebuildNow` no-op.
- Temporary web admin hooks used during rebuild execution were removed before this handoff.
- VisionLink credentials are expected in Apps Script properties, not in sheet cells.

## Immediate Next Work

User reported these current dashboard/sheet failures:

- Two equipment tabs are blank.
- Weather tab is blank.
- Schedule appears untouched.
- Schedule is missing Cesar and Juan.

Troubleshoot backwards in this order:

1. Inspect Vercel production deployment and runtime/build logs.
2. Confirm which dashboard routes/API routes render equipment, weather, and schedule.
3. Read the live Google Sheet tab metadata and headers for equipment, weather, and schedule tabs.
4. Identify which Apps Script functions write or should write those tabs.
5. Patch only the failing write path.
6. Run the approved rebuild/sync function.
7. Verify the Sheet tabs and Vercel dashboard output both show populated data.

## Known Local Dashboard State

- Current local branch before this handoff was `test/scorecard-command-view-old-vercel`.
- This handoff branch starts from commit `a97e360 Align operations dashboard data contract`.
- There are untracked local files in the dashboard workspace that were not included in this handoff:
  - `.sunbelt-runtime/`
  - duplicate files ending in ` 2.ts`, ` 3.ts`, ` 2.tsx`, ` 3.tsx`, and `operations-intelligence-webhook 2.gs`
  - `newsletter-engine/.clasp.json`
- Those untracked files were intentionally left untouched.

## Resume Commands

```bash
git clone https://github.com/lonnaedmond1-glitch/sunbelt-sports-dashboard.git
cd sunbelt-sports-dashboard
git checkout codex/cloud-handoff-dashboard-state
```

```bash
git clone https://github.com/lonnaedmond1-glitch/sunbelt-apps-script-control.git
cd sunbelt-apps-script-control
git checkout codex/apps-script-rebuild-baseline
```
