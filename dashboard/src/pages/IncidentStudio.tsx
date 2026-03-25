import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FlaskConical, Send, Terminal, Loader2, CheckCircle2, 
  AlertTriangle, BrainCircuit, Activity, Zap 
} from 'lucide-react';

const API_URL = 'http://localhost:8000';

export default function IncidentStudio() {
  const [logs, setLogs] = useState(`[2026-03-25 14:40:12] ERROR payment_gateway: ZeroDivisionError: division by zero in /api/payments.py:75
[2026-03-25 14:40:13] ERROR payment_gateway: ZeroDivisionError at main.py:12
[2026-03-25 14:40:15] WARN retry_handler: Retrying payment operation...`);
  const [service, setService] = useState('sentinelops-agent');
  const [errorRate, setErrorRate] = useState(85);
  const [severity, setSeverity] = useState('SEV1_CRITICAL');
  
  const [simulating, setSimulating] = useState(false);
  const [llmConfig, setLlmConfig] = useState<any>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    axios.get(`${API_URL}/api/config/llm`)
      .then(res => setLlmConfig(res.data))
      .catch(() => setLlmConfig({ model_name: 'Reasoning Engine', provider: 'AI' }));
  }, []);

  const runSimulation = async () => {
    setSimulating(true);
    setStep(1); // Percepton
    setResult(null);

    try {
      // 1. Trigger Simulation via Internal API
      const response = await axios.post(`${API_URL}/internal/incident`, {
        incident_id: crypto.randomUUID(),
        severity: severity,
        affected_service: service,
        confidence: 0.95, 
        error_pattern: "Simulated Studio Pattern", 
        error_rate_pct: errorRate,
        window_start: new Date(Date.now() - 300000).toISOString(),
        window_end: new Date().toISOString(),
        sanitized_trace: logs
      });

      setStep(2); // Reasoning
      await new Promise(r => setTimeout(r, 2000));
      
      setStep(3); // Complete
      setResult(response.data);
    } catch (err: any) {
      console.error(err);
      setStep(0);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 relative z-10">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-8 h-8 text-cyber-cyan neon-text-cyan" />
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Incident <span className="text-slate-500 tracking-normal">&lt;Studio/&gt;</span>
          </h1>
        </div>
        <p className="text-slate-500 mt-2">Simulate real-world production incidents and verify the SentinelOps response loop.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ── Left: Configuration ── */}
        <div className="glass-panel p-6 rounded-xl space-y-6 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-2 text-cyber-cyan font-mono text-xs tracking-widest uppercase">
            <Zap className="w-4 h-4" /> Lab Configuration
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Service Identifier</label>
            <input 
              value={service} 
              onChange={(e) => setService(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-cyber-cyan transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">Severity Level</label>
              <select 
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 outline-none focus:border-cyber-cyan transition-colors cursor-pointer"
              >
                <option value="SEV1_CRITICAL">SEV1_CRITICAL</option>
                <option value="SEV2_MAJOR">SEV2_MAJOR</option>
                <option value="SEV3_MINOR">SEV3_MINOR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-2 uppercase flex justify-between">
                Error Rate
                <span className={errorRate > 50 ? 'text-cyber-red' : 'text-cyber-green'}>{errorRate}%</span>
              </label>
              <input 
                type="range" min="0" max="100" 
                value={errorRate} 
                onChange={(e) => setErrorRate(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyber-cyan mt-3"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-2 uppercase flex justify-between">
              Raw Production Logs
              <span className="text-slate-600">Sanitizer will auto-apply</span>
            </label>
            <textarea 
              value={logs}
              onChange={(e) => setLogs(e.target.value)}
              rows={8}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 outline-none focus:border-cyber-cyan transition-colors leading-relaxed"
            />
          </div>

          <button 
            onClick={runSimulation}
            disabled={simulating}
            className="w-full py-4 bg-cyber-cyan text-slate-950 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 mt-4"
          >
            {simulating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Fire Simulation Pulse
          </button>
        </div>

        {/* ── Right: Live Pipeline ── */}
        <div className="glass-panel p-6 rounded-xl flex flex-col h-full bg-slate-900/50">
          <div className="flex items-center gap-2 mb-6 text-slate-500 font-mono text-xs tracking-widest uppercase">
            <Activity className="w-4 h-4" /> Live Execution Pipeline
          </div>

          <div className="space-y-8 flex-1">
            
            {/* Step 1: Perception */}
            <div className={`p-4 rounded-lg border transition-all duration-500 ${step >= 1 ? 'border-cyber-cyan/30 bg-cyber-cyan/5' : 'border-slate-800 bg-slate-900/40 opacity-40'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-cyber-cyan text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">1. Perception Engine</h4>
                    <p className="text-[10px] uppercase font-mono text-slate-500">Log Triage & Classification</p>
                  </div>
                </div>
                {step === 1 && <Loader2 className="w-4 h-4 text-cyber-cyan animate-spin" />}
                {step > 1 && <CheckCircle2 className="w-4 h-4 text-cyber-green" />}
              </div>
              {step >= 1 && (
                <div className="mt-3 p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] text-cyber-green leading-relaxed">
                   &gt; Analyzing logs for {service}...<br/>
                   &gt; PII Scrub complete.<br/>
                   &gt; Identified pattern: {logs.includes('ZeroDivisionError') ? 'Arithmetic Error' : 'Uncategorized Anomaly'}
                </div>
              )}
            </div>

            {/* Step 2: Reasoning */}
            <div className={`p-4 rounded-lg border transition-all duration-500 ${step >= 2 ? 'border-cyber-purple/30 bg-cyber-purple/5' : 'border-slate-800 bg-slate-900/40 opacity-40'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-cyber-purple text-white' : 'bg-slate-800 text-slate-500'}`}>
                    <BrainCircuit className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">2. Reasoning Loop</h4>
                    <p className="text-[10px] uppercase font-mono text-slate-500">Autonomous RCA & Git Correlation</p>
                  </div>
                </div>
                {step === 2 && <Loader2 className="w-4 h-4 text-cyber-purple animate-spin" />}
                {step > 2 && <CheckCircle2 className="w-4 h-4 text-cyber-green" />}
              </div>
              {step >= 2 && (
                 <div className="mt-3 p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] text-cyber-purple leading-relaxed">
                    &gt; Initiating Reasoning Loop ({llmConfig?.model_name || 'AI Engine'})...<br/>
                    &gt; Context: {llmConfig?.provider || 'Sovereign'} + Git repository state...<br/>
                    &gt; Dynamic RCA synthesis in progress...
                 </div>
              )}
            </div>

            {/* Step 3: Mitigation */}
            <div className={`p-4 rounded-lg border transition-all duration-500 ${step >= 3 ? 'border-cyber-yellow/30 bg-cyber-yellow/5' : 'border-slate-800 bg-slate-900/40 opacity-40'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-cyber-yellow text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">3. Mitigation Dispatch</h4>
                    <p className="text-[10px] uppercase font-mono text-slate-500">Slack Alerts & Human Gates</p>
                  </div>
                </div>
                {step === 3 && <CheckCircle2 className="w-4 h-4 text-cyber-green" />}
              </div>
              {step >= 3 && (
                <div className="mt-3 p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] text-cyber-yellow leading-relaxed">
                   &gt; Slack payload composed.<br/>
                   &gt; Alert sent to #incidents channel.<br/>
                   &gt; Awaiting human decision...
                </div>
              )}
            </div>

          </div>

          {result && (
            <div className="mt-6 p-4 bg-cyber-green/5 border border-cyber-green/20 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="text-xs font-mono text-cyber-green mb-1 uppercase tracking-tighter">Simulation Pulse Success</div>
              <div className="text-white text-sm">
                Incident <span className="text-cyber-cyan font-mono">{result.incident_id.slice(0,8)}</span> is now active.
              </div>
              <a 
                href={`/incidents/${result.incident_id}`} 
                className="mt-3 inline-block text-xs text-cyber-cyan hover:text-cyan-400 font-bold transition-colors"
              >
                View Detailed RCA & Reasoning Trace &rarr;
              </a>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
