import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, Legend
} from 'recharts';
import { Eye, Clock, Zap, Target, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';

const API_URL = 'http://localhost:8000';

const COLORS = {
  sev1: '#ef4444', // red-500
  sev2: '#eab308', // yellow-500
  sev3: '#94a3b8', // slate-400
  cyan: '#22d3ee', // cyber-cyan
  purple: '#a855f7', // purple-500
};

export default function Observatory() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await axios.get(`${API_URL}/api/analytics/metrics`);
        setMetrics(res.data);
      } catch (err) {
        console.error("Failed to fetch observatory metrics", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-cyber-cyan animate-spin" />
      </div>
    );
  }

  // Format data for Recharts
  const velocityData = metrics.velocity.map((d: any) => ({
    name: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    incidents: d.incidents
  }));

  const severityData = metrics.severity_distribution.map((d: any) => ({
    name: d.severity.replace('_CRITICAL', '').replace('_HIGH', '').replace('_LOW', ''),
    value: d.count,
    color: d.severity.includes('SEV1') ? COLORS.sev1 : d.severity.includes('SEV2') ? COLORS.sev2 : COLORS.sev3
  }));

  const confidenceData = metrics.confidence_trend.map((d: any) => ({
    name: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: Math.round(d.confidence * 100)
  }));

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
      
      {/* ── Sticky Header ── */}
      <header className="px-8 py-6 border-b border-slate-800/60 bg-slate-900/30 sticky top-0 backdrop-blur z-20 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Eye className="w-8 h-8 text-cyber-cyan neon-text-cyan" />
              Sentinel Observatory
            </h1>
            <p className="text-sm font-mono text-slate-500 mt-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyber-cyan animate-pulse"></span>
              Strategic Operations Intelligence Portfolio
            </p>
          </div>
          
          <div className="flex items-center gap-6">
             <div className="text-right">
                <div className="text-xs font-mono text-slate-500 uppercase tracking-widest">Global MTTR</div>
                <div className="text-2xl font-light text-white flex items-center gap-2">
                   <Clock className="w-5 h-5 text-cyber-cyan" />
                   {metrics.mttr_avg_minutes} <span className="text-sm text-slate-500">min</span>
                </div>
             </div>
             <div className="h-10 w-px bg-slate-800" />
             <div className="text-right">
                <div className="text-xs font-mono text-slate-500 uppercase tracking-widest">Active Anomalies</div>
                <div className="text-2xl font-light text-cyber-red flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5" />
                   {metrics.severity_distribution.reduce((acc: any, curr: any) => acc + curr.count, 0)}
                </div>
             </div>
          </div>
        </div>
      </header>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto p-8 pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8 pb-12">
          
          {/* 1. Incident Velocity */}
          <div className="glass-panel p-6 rounded-xl flex flex-col bg-slate-900/40 min-h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyber-cyan" /> Incident Velocity (7D)
            </h3>
            <div className="flex-1 w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={velocityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#22d3ee' }}
                  />
                  <Line type="monotone" dataKey="incidents" stroke="#22d3ee" strokeWidth={3} dot={{ fill: '#22d3ee', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Severity Portfolio */}
          <div className="glass-panel p-6 rounded-xl flex flex-col bg-slate-900/40 min-h-[400px]">
             <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
              <Target className="w-5 h-5 text-cyber-purple" /> Severity Portfolio
            </h3>
            <div className="flex-1 w-full h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {severityData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                     contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Service Fragility Ranking */}
          <div className="glass-panel p-6 rounded-xl flex flex-col bg-slate-900/40 min-h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6">Service Fragility Ranking</h3>
            <div className="flex-1 w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.top_services} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={12} hide />
                  <YAxis type="category" dataKey="service" stroke="#94a3b8" fontSize={11} width={120} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. AI Reasoning Confidence */}
          <div className="glass-panel p-6 rounded-xl flex flex-col bg-slate-900/40 min-h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
              <Target className="w-5 h-5 text-cyber-cyan" /> AI Reasoning Confidence Trend
            </h3>
            <div className="flex-1 w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={confidenceData}>
                  <defs>
                    <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} axisLine={false} tickLine={false} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#22d3ee" fillOpacity={1} fill="url(#colorConfidence)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Hourly Incident Hotspots */}
          <div className="glass-panel p-6 rounded-xl flex flex-col bg-slate-900/40 min-h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyber-yellow" /> Hourly Incident Hotspots (24h)
            </h3>
            <div className="flex-1 w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.hourly_distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={12} axisLine={false} tickLine={false} tickFormatter={(h) => `${h}h`} />
                  <YAxis stroke="#64748b" fontSize={12} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="count" fill="#eab308" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. Resolution Progress */}
          <div className="glass-panel p-6 rounded-xl flex flex-col bg-slate-900/40 min-h-[400px]">
            <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-cyber-green" /> Resolution Progress
            </h3>
            <div className="flex-1 w-full h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.status_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="count"
                    nameKey="status"
                  >
                    {metrics.status_distribution.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.status === 'RESOLVED' ? COLORS.cyan : COLORS.sev1} />
                    ))}
                  </Pie>
                  <Tooltip 
                     contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
