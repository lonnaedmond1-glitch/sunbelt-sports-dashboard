'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard',         label: 'Dashboard', icon: '📊' },
  { href: '/portfolio',         label: 'Portfolio', icon: '📋' },
  { href: '/schedule',          label: 'Schedule',  icon: '📅' },
  { href: '/equipment',         label: 'Equipment', icon: '🚜' },
  { href: '/fleet',             label: 'Fleet',     icon: '🚚' },
  { href: '/project-scorecard', label: 'Scorecard', icon: '🏆' },
  { href: '/sales',             label: 'Sales',     icon: '💰' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-16 hover:w-52 bg-[#1F2327] z-[60] flex flex-col transition-all duration-300 group overflow-hidden shadow-xl bg-turf-lines">
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-5 border-b border-white/10 flex-shrink-0">
        <img src="/sunbelt-sports-logo.png" alt="Sunbelt Sports" className="h-8 w-auto flex-shrink-0" style={{ filter: 'brightness(0) invert(1)' }} />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 p-2 mt-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-3 rounded transition-all text-sm font-display whitespace-nowrap
                ${isActive
                  ? 'bg-[#198754]/15 text-[#3CC68A] border-l-[3px] border-[#198754]'
                  : 'text-white/55 hover:text-white/90 hover:bg-white/5 border-l-[3px] border-transparent'
                }`}
            >
              <span className="text-lg flex-shrink-0 w-6 text-center">{item.icon}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-[#198754] animate-pulse flex-shrink-0"></div>
          <span className="text-[10px] text-white/40 font-display uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Live</span>
        </div>
      </div>
    </aside>
  );
}
