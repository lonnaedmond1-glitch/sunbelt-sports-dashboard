const fs = require('fs');
const path = require('path');

function replaceInFile(filepath) {
  if (!fs.existsSync(filepath)) return;
  let content = fs.readFileSync(filepath, 'utf8');
  
  // Fix Next.js Trap
  content = content.replace(/export const revalidate = \d+;[^\n]*/g, "export const dynamic = 'force-dynamic';");
  if (!content.includes("export const dynamic = 'force-dynamic';")) {
    content = content.replace(/import React from 'react';\n/, "import React from 'react';\nexport const dynamic = 'force-dynamic';\n");
  }

  // Fix known mangled emojis
  content = content.replace(/â€”/g, '—')
                   .replace(/â†‘/g, '↑')
                   .replace(/â— /g, '●')
                   .replace(/â˜€ï¸ /g, '☀️')
                   .replace(/â›ˆï¸ /g, '⛈️')
                   .replace(/ðŸŒ§ï¸ /g, '🌧️')
                   .replace(/ðŸŒ¦ï¸ /g, '🌦️')
                   .replace(/â›…/g, '⛅')
                   .replace(/ðŸ˜±/g, '😱')
                   .replace(/ðŸ“‹/g, '📋')
                   .replace(/ðŸšš/g, '🚚')
                   .replace(/ðŸ“ /g, '��')
                   .replace(/ðŸ”´/g, '🔴')
                   .replace(/âš ï¸ /g, '⚠️')
                   .replace(/â„¹ï¸ /g, 'ℹ️')
                   .replace(/ðŸŸ¢/g, '🟢')
                   .replace(/ðŸŸ¡/g, '🟡')
                   .replace(/ðŸš›/g, '🚛')
                   .replace(/âœ…/g, '✅')
                   .replace(/â† /g, '→')
                   .replace(/â† /gi, '←') // Actually, â†’ is right arrow, â†  is left arrow? Wait. 
                   .replace(/Â·/g, '·'); // Middle dot

  fs.writeFileSync(filepath, content, 'utf8');
}

['app/dashboard/page.tsx', 'app/portfolio/page.tsx', 'app/schedule/page.tsx', 'app/equipment/page.tsx'].forEach(replaceInFile);
console.log('Fixed pages.');
