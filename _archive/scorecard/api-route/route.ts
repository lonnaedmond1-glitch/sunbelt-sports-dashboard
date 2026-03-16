import { NextResponse } from 'next/server';

// Live QuickBooks data exported to Google Sheets
const QB_SHEET_ID = '1LYmHPUfoSW_UQq0mtQ7s9APvDJlymh_9trYRxc3lSss';
const PL_GID = '0';           // Profit & Loss
const BS_GID = '1219933569';  // Balance Sheet
const AR_GID = '811286112';   // AR Aging Summary
const CS_GID = '1255706057';  // Sales by Customer

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim()); current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function parseMoney(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,\s"]/g, '')) || 0;
}

async function fetchTab(gid: string): Promise<string[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${QB_SHEET_ID}/export?format=csv&gid=${gid}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!res.ok) return [];
    const text = await res.text();
    return text.split('\n').map(l => l.replace(/\r$/, ''));
  } catch { return []; }
}

function findRow(lines: string[], label: string): string[] {
  for (const line of lines) {
    if (line.toLowerCase().includes(label.toLowerCase())) {
      return parseCSVLine(line);
    }
  }
  return [];
}

function findRowValue(lines: string[], label: string, col = 1): number {
  const row = findRow(lines, label);
  return row.length > col ? parseMoney(row[col]) : 0;
}

export async function GET() {
  try {
    const [plLines, bsLines, arLines, csLines] = await Promise.all([
      fetchTab(PL_GID), fetchTab(BS_GID), fetchTab(AR_GID), fetchTab(CS_GID),
    ]);

    // ─── P&L Data ───
    const totalIncome = findRowValue(plLines, 'Total for Income');
    const constructionIncome = findRowValue(plLines, 'Total for 4000 Construction Income');
    const totalCOGS = findRowValue(plLines, 'Total for Cost of Goods Sold');
    const grossProfit = findRowValue(plLines, 'Gross Profit');
    const totalExpenses = findRowValue(plLines, 'Total for Expenses');
    const netIncome = findRowValue(plLines, 'Net Income');
    const directJobCost = findRowValue(plLines, 'Total for 5000 Direct Job Cost');

    // Income breakdown
    const incomeBreakdown: { category: string; amount: number }[] = [];
    for (const line of plLines) {
      const cols = parseCSVLine(line);
      const label = cols[0] || '';
      if (label.startsWith('4') && !label.startsWith('Total') && cols[1]) {
        const amt = parseMoney(cols[1]);
        if (amt !== 0) incomeBreakdown.push({ category: label, amount: amt });
      }
    }

    // ─── Balance Sheet Data ───
    const bankTotal = findRowValue(bsLines, 'Total for Bank Accounts');
    const arTotal = findRowValue(bsLines, 'Total for Accounts Receivable');
    const apTotal = findRowValue(bsLines, 'Total for Accounts Payable');
    const currentAssets = findRowValue(bsLines, 'Total for Current Assets');
    const currentLiabilities = findRowValue(bsLines, 'Total for Current Liabilities');
    const arApRatio = apTotal > 0 ? Math.round((arTotal / apTotal) * 100) / 100 : 0;

    // ─── AR Aging Data ───
    // Find the grand total row (exact match "TOTAL" in first column)
    let arTotalRow: string[] = [];
    for (const line of arLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.trim() === 'TOTAL') { arTotalRow = cols; break; }
    }
    const arAging = {
      current: arTotalRow.length > 1 ? parseMoney(arTotalRow[1]) : 0,
      '1_30': arTotalRow.length > 2 ? parseMoney(arTotalRow[2]) : 0,
      '31_60': arTotalRow.length > 3 ? parseMoney(arTotalRow[3]) : 0,
      '61_90': arTotalRow.length > 4 ? parseMoney(arTotalRow[4]) : 0,
      over90: arTotalRow.length > 5 ? parseMoney(arTotalRow[5]) : 0,
      total: arTotalRow.length > 6 ? parseMoney(arTotalRow[6]) : 0,
    };

    // Top AR customers (by total)
    const arByCustomer: { customer: string; current: number; d1_30: number; d31_60: number; d61_90: number; over90: number; total: number }[] = [];
    for (const line of arLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.startsWith('Total for ') && cols[6]) {
        const cust = cols[0].replace('Total for ', '');
        arByCustomer.push({
          customer: cust,
          current: parseMoney(cols[1]),
          d1_30: parseMoney(cols[2]),
          d31_60: parseMoney(cols[3]),
          d61_90: parseMoney(cols[4]),
          over90: parseMoney(cols[5]),
          total: parseMoney(cols[6]),
        });
      }
    }
    arByCustomer.sort((a, b) => b.total - a.total);

    // ─── Sales by Customer ───
    let csTotalRow: string[] = [];
    for (const line of csLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.trim() === 'TOTAL') { csTotalRow = cols; break; }
    }
    const totalSales = csTotalRow.length > 1 ? parseMoney(csTotalRow[1]) : 0;
    const salesByCustomer: { customer: string; amount: number }[] = [];
    for (const line of csLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.startsWith('Total for ') && cols[1]) {
        salesByCustomer.push({ customer: cols[0].replace('Total for ', ''), amount: parseMoney(cols[1]) });
      }
    }
    salesByCustomer.sort((a, b) => b.amount - a.amount);

    // ─── Computed Metrics ───
    const grossMarginPct = totalIncome > 0 ? Math.round((grossProfit / totalIncome) * 1000) / 10 : 0;
    const netMarginPct = totalIncome > 0 ? Math.round((netIncome / totalIncome) * 1000) / 10 : 0;
    const currentRatio = currentLiabilities > 0 ? Math.round((currentAssets / currentLiabilities) * 100) / 100 : 0;

    // Report period from line 3
    const reportPeriod = plLines[2]?.replace(/"/g, '').trim() || 'Unknown';

    const data = {
      reportPeriod,
      // Financial
      cashFlow: { current: bankTotal },
      accountsReceivable: { current: arTotal },
      accountsPayable: { current: apTotal },
      arApRatio: { current: arApRatio },
      currentRatio: { current: currentRatio },
      currentAssets: { current: currentAssets },
      currentLiabilities: { current: currentLiabilities },
      // Revenue
      totalRevenueFY: { current: totalIncome },
      constructionIncome: { current: constructionIncome },
      totalSales: { current: totalSales },
      grossProfit: { current: grossProfit },
      grossMarginPct: { current: grossMarginPct },
      netIncome: { current: netIncome },
      netMarginPct: { current: netMarginPct },
      totalCOGS: { current: totalCOGS },
      directJobCost: { current: directJobCost },
      totalExpenses: { current: totalExpenses },
      // AR Aging
      arAging,
      arByCustomer: arByCustomer.slice(0, 15),
      // Sales pipeline
      salesByCustomer: salesByCustomer.slice(0, 15),
      numCustomers: salesByCustomer.length,
      // Income breakdown
      incomeBreakdown,
    };

    return NextResponse.json({ data, source: 'quickbooks_export', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[sync/scorecard] Error:', error);
    return NextResponse.json({ error: 'Failed to sync scorecard', data: {} }, { status: 500 });
  }
}
