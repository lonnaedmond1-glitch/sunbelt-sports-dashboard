'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Calendar, Truck } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', icon: FolderKanban },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/equipment', label: 'Equipment', icon: Truck },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-16 hover:w-56 bg-[#0a0a0a] z-[60] flex flex-col transition-all duration-300 group overflow-hidden border-r border-white/[0.08]">
      {/* Logo */}
      <div className="flex items-center justify-center px-3 py-4 border-b border-white/[0.08] flex-shrink-0 h-16">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
            <Image 
              src="/sunbelt-sports-logo.svg" 
              alt="Sunbelt Sports" 
              width={40} 
              height={40} 
              className="w-10 h-10 object-contain"
              priority
            />
          </div>
          <span className="font-semibold text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Sunbelt Sports
          </span>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 p-2 mt-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium whitespace-nowrap
                ${isActive
                  ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Live Indicator */}
      <div className="p-3 border-t border-white/[0.08] flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="relative flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
          </div>
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Live Data
          </span>
        </div>
      </div>
    </aside>
  );
}
