const fs = require('fs');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const lines = fs.readFileSync('data/Level10_Meeting.csv', 'utf8').split('\n');
let screaming = [];
let looseEnds = [];

let inScreaming = false;
let inLooseEnds = false;

for (const line of lines) {
  const cols = parseCSVLine(line);
  if (cols.length < 2) continue;
  
  // Screaming Customers
  if (cols[1] === 'Customer / Employee / Company Headlines') inScreaming = true;
  if (inScreaming && cols[1] === 'On Rent') inScreaming = false;
  
  if (inScreaming && cols[2] && cols[2].trim() && cols[2] !== 'What customers are screaming?') {
    screaming.push(cols[2]);
  }

  // Loose Ends
  if (cols[2] === 'Long Term To-do List') inLooseEnds = true;
  if (inLooseEnds && (cols[1] === '30 Minutes' || cols.join('').includes('Internal Scorecard'))) inLooseEnds = false;
  
  if (inLooseEnds && cols[2] === 'Tie Up Loose Ends') {
    looseEnds.push({
      who: cols[3].replace(/"/g, ''),
      details: cols[4].replace(/"/g, '')
    });
  }
}
console.log('Screaming:', screaming);
console.log('Loose Ends:', looseEnds);
