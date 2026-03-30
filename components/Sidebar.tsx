'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/portfolio', label: 'Portfolio', icon: '📋' },
  { href: '/schedule', label: 'Schedule', icon: '📅' },
  { href: '/equipment', label: 'Equipment', icon: '🚜' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-16 hover:w-52 bg-[#202325] z-[60] flex flex-col transition-all duration-300 group overflow-hidden shadow-xl bg-turf-lines">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0">
        <img src="/sunbelt-sports-logo.png" alt="Sunbelt Sports" className="h-8 w-auto flex-shrink-0" />
        <span className="font-display font-black text-sm tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white">SUNBELT</span>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 p-2 mt-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-3 rounded transition-all text-sm font-display font-bold whitespace-nowrap
                ${isActive
                  ? 'bg-[#20BC64]/15 text-[#20BC64] border-l-[3px] border-[#20BC64]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5 border-l-[3px] border-transparent'
                }`}
            >
              <span className="text-lg flex-shrink-0 w-6 text-center">{item.icon}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-[#20BC64] animate-pulse flex-shrink-0"></div>
          <span className="text-[10px] text-white/30 font-display font-bold uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Live</span>
        </div>
      </div>
    </aside>
  );
}
