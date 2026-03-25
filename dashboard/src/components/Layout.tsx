import { NavLink, Outlet } from 'react-router-dom';
import { ShieldCheck, Activity, Database, ShieldAlert, Library, BarChart3, Settings, Blocks, Eye, FlaskConical } from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/observatory', label: 'Observatory', icon: Eye },
  { path: '/incidents', label: 'Incident Feed', icon: Activity },
  { path: '/audit', label: 'Audit Trail', icon: Database },
  { path: '/integrations', label: 'Integrations', icon: Blocks },
  { path: '/repos', label: 'Repositories', icon: Library },
  { path: '/knowledge', label: 'Knowledge Base', icon: Library },
  { path: '/guardrails', label: 'Guardrails', icon: ShieldAlert },
  { path: '/spend', label: 'Token Spend', icon: BarChart3 },
  { path: '/studio', label: 'Incident Studio', icon: FlaskConical },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-300">
      {/* ── Sidebar ── */}
      <aside className="w-64 flex flex-col border-r border-slate-800/60 bg-slate-900/40 backdrop-blur-xl shrink-0">
        
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800/60 shrink-0">
          <ShieldCheck className="w-6 h-6 text-cyber-cyan neon-text-cyan mr-3" />
          <span className="text-lg font-bold text-white tracking-widest uppercase">
            Sentinel<span className="text-cyber-cyan">Ops</span>
          </span>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1">
          <div className="text-xs font-mono text-slate-500 mb-2 px-3 tracking-wider uppercase">
            Operations Menu
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive 
                    ? 'bg-slate-800/80 text-white shadow-sm ring-1 ring-slate-700/50' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                )
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User Footer (Mock) */}
        <div className="p-4 border-t border-slate-800/60 shrink-0 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
            <Settings className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-sm">
            <div className="font-medium text-slate-300">Admin_SE</div>
            <div className="text-xs text-cyber-green/80 flex items-center tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-green mr-1.5 shadow-[0_0_5px_#10b981]"></span>
              SYSTEM ONLINE
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Ambient background glow */}
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-cyber-cyan/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-cyber-purple/5 blur-[150px] rounded-full pointer-events-none" />
        
        <Outlet />
      </main>
    </div>
  );
}
