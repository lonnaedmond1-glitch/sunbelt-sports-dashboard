# Dashboard Fix Worklog

Branch: `dashboard-fix-live-audit`

## Current status

I identified the two live files controlling the dashboard:

- `app/dashboard/page.tsx`
- `lib/sheets-data.ts`

## Confirmed issues in live code

1. Dashboard health logic only supports `green | amber | red` and does not support `Not Started`.
2. KPI row is still built around broad totals instead of current operational questions.
3. Quick Job Health is still using the old health logic.
4. This Week's Jobs is still using old schedule logic.
5. Lowboy block is incomplete and has encoding issues.
6. Schedule data layer is still wired to old sheet IDs/sources.

## Current patch order

1. Rewire `lib/sheets-data.ts` schedule source
2. Add proper dashboard status model
3. Rebuild KPI row
4. Rebuild Quick Job Health
5. Rebuild This Week's Jobs
6. Clean Lowboy block

## Source truths to preserve

- Schedule source should come from the current workbook flow
- Contract status and dashboard health status must stay separate
- `Not Started` must be a real visible state
- Unstarted jobs must not be shown as risk

## Watching progress

This file will be updated as the dashboard patch moves.
