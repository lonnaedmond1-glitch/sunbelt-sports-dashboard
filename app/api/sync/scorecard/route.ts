import { NextResponse } from 'next/server';
import { fetchArAging, fetchQboFinancials } from '@/lib/sheets-data';

export async function GET() {
  try {
    const [qboFinancials, arAging] = await Promise.all([
      fetchQboFinancials(),
      fetchArAging(),
    ]);

    const totals = qboFinancials.reduce(
      (acc, row) => ({
        actCost: acc.actCost + row.Act_Cost,
        actIncome: acc.actIncome + row.Act_Income,
        profit: acc.profit + row.Profit,
      }),
      { actCost: 0, actIncome: 0, profit: 0 }
    );

    const data = {
      qboFinancials,
      arAging,
      totals: {
        ...totals,
        profitMargin: totals.actIncome > 0 ? totals.profit / totals.actIncome : 0,
      },
      accountsReceivable: { current: arAging.totals.total },
    };

    return NextResponse.json({
      data,
      source: 'scorecard_qbo_tabs',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sync/scorecard] Error:', error);
    return NextResponse.json({ error: 'Failed to sync scorecard', data: {} }, { status: 500 });
  }
}
