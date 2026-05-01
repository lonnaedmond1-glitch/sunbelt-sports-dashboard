'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Command Center' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/equipment', label: 'Equipment' },
  { href: '/rentals', label: 'Rentals' },
  { href: '/fleet', label: 'Fleet' },
  { href: '/project-scorecard', label: 'Scorecard' },
  { href: '/sales', label: 'Sales' },
  { href: '/marketing', label: 'Marketing' },
];

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-[70] border-b border-[rgba(31,41,55,0.15)] bg-[#FAFAF7]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-6 py-4 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link href="/dashboard" className="flex items-center gap-4">
            <Image
              src="/sunbelt-sports-logo.png"
              alt="Sunbelt Sports"
              width={176}
              height={55}
              className="h-10 w-auto object-contain"
              priority
              unoptimized
            />
            <div className="border-l border-[rgba(31,41,55,0.15)] pl-4">
              <p className="ops-display text-[24px] font-extrabold uppercase leading-none text-[#0F172A]">
                Sunbelt Sports Operations
              </p>
              <p className="text-xs font-semibold text-[#475569]">One clear operating question per page.</p>
            </div>
          </Link>
          <div className="text-left md:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#94A3B8]">{todayLabel()}</p>
            <p className="text-xs font-semibold text-[#475569]">Source data refreshes by page</p>
          </div>
        </div>

        <nav className="flex gap-5 overflow-x-auto border-t border-[rgba(31,41,55,0.15)] pt-3" aria-label="Dashboard navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap border-b-2 pb-2 text-sm font-bold transition-colors ${
                  isActive
                    ? 'border-[#0BBE63] text-[#0F172A]'
                    : 'border-transparent text-[#475569] hover:border-[rgba(31,41,55,0.25)] hover:text-[#0F172A]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
