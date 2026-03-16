import { NextResponse } from 'next/server';

const SHEET_ID = '1uvHDu3GmBpJhXLNw_bm-rYqXGcQxO1tbBUBSvhsz2zw';
const BID_LOG_GID = '928358188';
const BACKLOG_GID = '1136500140';

// Simple CSV parser
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentWord = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentWord += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentWord += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentWord);
        currentWord = '';
      } else if (char === '\n' || char === '\r') {
        row.push(currentWord);
        result.push(row);
        row = [];
        currentWord = '';
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
      } else {
        currentWord += char;
      }
    }
  }
  if (currentWord || row.length > 0) {
    row.push(currentWord);
    result.push(row);
  }
  return result;
}

function parseFloatSafe(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
}

export async function GET() {
  try {
    // Fetch 2026 Bid Log
    const bidLogRes = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${BID_LOG_GID}`, { next: { revalidate: 60 } });
    const bidLogText = await bidLogRes.text();
    const bidLogData = parseCSV(bidLogText);

    // Fetch Backlog
    const backlogRes = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${BACKLOG_GID}`, { next: { revalidate: 60 } });
    const backlogText = await backlogRes.text();
    const backlogData = parseCSV(backlogText);

    const bids: any[] = [];
    const commitments: any[] = [];

    // Parse Bid Log (Header is usually row 1)
    // Find header row index
    let bidHeaderIdx = 1;
    for (let i = 0; i < Math.min(10, bidLogData.length); i++) {
        if (bidLogData[i].includes('Win / Loss / Pending') || bidLogData[i].includes('Customer')) {
            bidHeaderIdx = i;
            break;
        }
    }

    for (let i = bidHeaderIdx + 1; i < bidLogData.length; i++) {
      const row = bidLogData[i];
      if (!row || row.length < 5) continue;
      
      const jobName = row[3]?.trim();
      const status = row[5]?.trim() || 'Pending';
      if (!jobName) continue; // Skip empty rows

      const bid = {
        jobNo: row[0]?.trim(),
        dateBid: row[1]?.trim(),
        customer: row[2]?.trim(),
        jobName: jobName,
        location: row[4]?.trim(),
        status: status,
        feedback: row[6]?.trim(),
        probability: row[7]?.trim(),
        proposal: parseFloatSafe(row[8]),
        awarded: parseFloatSafe(row[9]),
      };
      
      bids.push(bid);
    }

    // Parse Backlog - The sheet has no standard headers, data starts arbitrarily
    for (let i = 2; i < backlogData.length; i++) {
        const row = backlogData[i];
        if (!row || row.length < 13) continue;

        const jobName = row[12]?.trim() || row[16]?.trim();
        if (!jobName || jobName.toLowerCase().includes('high school') === false && jobName.length < 5) continue; // Filter out noise

        const contractAmtStr = row[14]?.trim() || row[17]?.trim() || row[15]?.trim() || '0';
        const contractAmount = parseFloatSafe(contractAmtStr);
        if (!jobName && contractAmount === 0) continue;

        const commitment = {
            jobNo: row[7]?.trim() || '',
            jobName: jobName,
            status: 'Active',
            state: '',
            contractAmount: contractAmount,
            billedToDate: 0, // No billed data in this sheet
            pctBilled: '0%',
            projectedStart: '',
        };

        commitments.push(commitment);
    }

    return NextResponse.json({
      success: true,
      data: {
        bids,
        commitments
      }
    });

  } catch (error: any) {
    console.error('Estimating sync error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
