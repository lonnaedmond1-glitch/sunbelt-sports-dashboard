'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Command Center', mark: 'CMD', pill: 'Live' },
  { href: '/portfolio', label: 'Portfolio', mark: 'JOB', pill: 'Jobs' },
  { href: '/schedule', label: 'Schedule', mark: 'SCH', pill: 'Week' },
  { href: '/equipment', label: 'Equipment', mark: 'EQP', pill: 'Rent' },
  { href: '/fleet', label: 'Fleet', mark: 'FLT', pill: 'GPS' },
  { href: '/project-scorecard', label: 'Scorecard', mark: 'EOS', pill: 'EOS' },
  { href: '/sales', label: 'Sales', mark: 'BID', pill: 'Pipe' },
  { href: '/marketing', label: 'Marketing', mark: 'MKT', pill: 'Brand' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative z-[60] flex h-auto w-full flex-col overflow-hidden bg-[#171A1C] px-[18px] py-6 text-white shadow-xl md:fixed md:left-0 md:top-0 md:h-full md:w-[280px] md:overflow-y-auto">
      <div className="mb-6 flex justify-center border-b border-white/10 pb-[18px]">
        <Image
          src="/sunbelt-sports-logo.png"
          alt="Sunbelt Sports"
          width={512}
          height={160}
          className="h-auto max-h-24 w-full max-w-[260px] object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
          style={{ filter: 'brightness(0) invert(1)' }}
          priority
          unoptimized
        />
      </div>

      <div className="mx-2 mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#879094]">Command</div>
      <nav className="grid grid-cols-2 gap-1 md:grid-cols-1" aria-label="Dashboard navigation">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-black transition-colors
                ${isActive
                  ? 'bg-[#20BC64]/20 text-white'
                  : 'text-[#D9DFE1] hover:bg-[#20BC64]/15 hover:text-white'
                }`}
            >
              <span className="flex items-center gap-3">
                <span className={`grid h-7 w-9 place-items-center rounded-lg text-[10px] font-black tracking-tight ${isActive ? 'bg-[#20BC64] text-[#08120C]' : 'bg-white/10 text-[#C9D1D3]'}`}>
                  {item.mark}
                </span>
                <span>{item.label}</span>
              </span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-black text-[#C9D1D3]">{item.pill}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.07] p-4">
        <strong className="mb-1.5 block text-sm">Design Logic</strong>
        <p className="m-0 text-xs leading-relaxed text-[#B9C0C3]">
          Default view shows exceptions first: risk, money, crew mismatch, field data, and capacity.
        </p>
      </div>
    </aside>
  );
}
