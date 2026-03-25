import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { 
  ShieldAlert, 
  ArrowLeft, 
  GitCommit, 
  GitBranch, 
  Cpu, 
  MessageSquareWarning, 
  SearchCode, 
  Database, 
  CheckCircle2,
  Trello,
  Calendar,
  X,
  BrainCircuit
} from 'lucide-react';
import { cn } from '../lib/utils';

const API_URL = 'http://localhost:8000';

interface RCA {
  root_cause: string;
  causal_commit: string | null;
  causal_repo: string | null;
  five_whys: Array<{ why: number; question: string; answer: string }>;
  action_items: {
    corrective_actions: Array<{ action: string; owner: string; created_at: string; due_date: string }>;
    preventive_actions: Array<{ action: string; owner: string; created_at: string; due_date: string }>;
    systemic_actions: Array<{ action: string; owner: string; created_at: string; due_date: string }>;
  };
  llm_model: string | null;
}

export default function IncidentDetail() {
  const { id } = useParams();
  const [incident, setIncident] = useState<any>(null);
  const [rca, setRca] = useState<RCA | null>(null);
  const [loading, setLoading] = useState(true);
  const [jiraModalAction, setJiraModalAction] = useState<any | null>(null);
  const [creatingJira, setCreatingJira] = useState(false);

  useEffect(() => {
    let interval: any;

    async function fetchData() {
      try {
        const [incRes, rcaRes] = await Promise.all([
          axios.get(`${API_URL}/api/incidents/${id}`),
          axios.get(`${API_URL}/api/incidents/${id}/rca`).catch(() => ({ data: null }))
        ]);
        
        setIncident(incRes.data);
        if (rcaRes.data) {
          setRca(rcaRes.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Start polling if RCA is not yet available
    interval = setInterval(() => {
      if (!rca) {
        fetchData();
      } else {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, !!rca]);

  const formatDateForInput = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
      return d.toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!incident) {
    return <div className="p-8 text-red-400">Incident not found.</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto relative z-10">
      
      {/* ── Header ── */}
      <header className="px-8 py-6 border-b border-slate-800/60 bg-slate-900/30 sticky top-0 backdrop-blur z-20">
        <div className="flex items-center gap-4 mb-4">
          <Link to="/incidents" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{incident.affected_service}</h1>
              <span className={cn(
                "px-2.5 py-1 rounded text-xs font-mono font-bold tracking-wider",
                incident.severity.includes('SEV1') ? "bg-cyber-red/20 text-cyber-red border border-cyber-red/30" : "bg-slate-800 text-slate-300"
              )}>
                {incident.severity.replace('_CRITICAL', '')}
              </span>
            </div>
            <div className="text-sm font-mono text-slate-500 mt-1">ID: {incident.id}</div>
          </div>
        </div>
      </header>

      {/* ── RCA Payload ── */}
      <div className="p-8 pb-32 max-w-5xl mx-auto w-full flex flex-col gap-8">
        
        {/* Core Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel p-5 rounded-xl">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Database className="w-4 h-4"/> Error Rate</div>
            <div className="text-3xl font-light text-white">{incident.error_rate_pct}%</div>
          </div>
          <div className="glass-panel p-5 rounded-xl">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><SearchCode className="w-4 h-4"/> Pattern</div>
            <div className="text-sm font-mono text-cyber-cyan truncate">{incident.error_pattern}</div>
          </div>
          <div className="glass-panel p-5 rounded-xl">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2"><Cpu className="w-4 h-4"/> AI Confidence</div>
            <div className="text-3xl font-light text-white">{incident.confidence ? `${Math.round(incident.confidence * 100)}%` : 'N/A'}</div>
          </div>
        </div>

        {rca ? (
          <>
            {/* Root Cause Summary */}
            <section className="glass-panel rounded-xl p-6 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyber-purple"></div>
              <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-cyber-purple" />
                Root Cause Synthesis
              </h2>
              <p className="text-slate-300 leading-relaxed mb-4">{rca.root_cause}</p>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-wider pt-4 border-t border-white/5">
                <BrainCircuit className="w-4 h-4 text-cyber-cyan" />
                Reasoning Engine: <span className="text-cyber-cyan">{rca.llm_model || 'Unknown Agent'}</span>
              </div>
            </section>

            {/* Causal Commit */}
            {rca.causal_commit && (
              <section className="glass-panel rounded-xl p-6 border-cyber-cyan/20 bg-cyber-cyan/5">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <GitCommit className="w-5 h-5 text-cyber-cyan" />
                  Causal Commit Identified
                </h2>
                <div className="flex items-center gap-4 bg-slate-950/50 border border-slate-800 p-4 rounded-lg font-mono">
                  <GitBranch className="w-5 h-5 text-slate-500" />
                  <div>
                    <div className="text-sm text-slate-400">{rca.causal_repo || 'unknown-repo'}</div>
                    <div className="text-cyber-cyan">{rca.causal_commit}</div>
                  </div>
                </div>
              </section>
            )}

            {/* 5 Whys Timeline */}
            <section>
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 pl-2">
                <MessageSquareWarning className="w-5 h-5 text-cyber-yellow" />
                5-Whys Diagnostic Trace
              </h2>
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
                {rca.five_whys.map((w, i) => (
                  <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-950 bg-slate-800 text-slate-300 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 text-sm font-bold">
                      {i + 1}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass-panel p-5 rounded-xl transition-all duration-300 hover:border-cyber-purple/40">
                      <div className="font-bold text-white mb-2 text-sm">{w.question}</div>
                      <div className="text-slate-400 text-sm leading-relaxed">{w.answer}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Actions */}
            <section className="glass-panel rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-6">Recommended Mitigations</h2>
              
              <div className="space-y-8">
                {/* 1. Corrective */}
                <div>
                  <h3 className="text-xs font-mono font-bold text-cyber-red uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyber-red"></span>
                    Corrective Actions (Immediate)
                  </h3>
                  <ul className="space-y-4 pl-2">
                    {rca.action_items.corrective_actions.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                        <CheckCircle2 className="w-5 h-5 text-cyber-green shrink-0 mt-1" />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div className="text-slate-200 text-sm font-medium pr-4">{item.action}</div>
                            <button 
                              type="button"
                              onClick={() => setJiraModalAction(item)}
                              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-[10px] uppercase font-bold tracking-wider"
                            >
                              <Trello className="w-3 h-3" /> Sync Jira
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <span className="text-slate-600">Owner:</span> {item.owner}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <Calendar className="w-3 h-3 text-slate-600" /> 
                               <span className="text-slate-600">Created:</span> {item.created_at || 'Mar 23, 2026'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <Calendar className="w-3 h-3 text-cyber-red/50" /> 
                               <span className="text-slate-600">Target:</span> {item.due_date || 'Mar 25, 2026'}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Preventive */}
                <div>
                  <h3 className="text-xs font-mono font-bold text-cyber-yellow uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyber-yellow"></span>
                    Preventive Actions (Safeguards)
                  </h3>
                  <ul className="space-y-4 pl-2">
                    {rca.action_items.preventive_actions.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                        <CheckCircle2 className="w-5 h-5 text-cyber-green shrink-0 mt-1" />
                        <div className="flex-1">
                           <div className="flex items-start justify-between">
                            <div className="text-slate-200 text-sm font-medium pr-4">{item.action}</div>
                            <button 
                              type="button"
                              onClick={() => setJiraModalAction(item)}
                              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-[10px] uppercase font-bold tracking-wider"
                            >
                              <Trello className="w-3 h-3" /> Sync Jira
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <span className="text-slate-600">Owner:</span> {item.owner}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <Calendar className="w-3 h-3 text-slate-600" /> 
                               <span className="text-slate-600">Created:</span> {item.created_at || 'Mar 23, 2026'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <Calendar className="w-3 h-3 text-cyber-yellow/50" /> 
                               <span className="text-slate-600">Target:</span> {item.due_date || 'Mar 30, 2026'}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. Systemic */}
                <div>
                  <h3 className="text-xs font-mono font-bold text-cyber-cyan uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyber-cyan"></span>
                    Systemic Actions (Strategic)
                  </h3>
                  <ul className="space-y-4 pl-2">
                    {rca.action_items.systemic_actions.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                        <CheckCircle2 className="w-5 h-5 text-cyber-green shrink-0 mt-1" />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div className="text-slate-200 text-sm font-medium pr-4">{item.action}</div>
                            <button 
                              type="button"
                              onClick={() => setJiraModalAction(item)}
                              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-[10px] uppercase font-bold tracking-wider"
                            >
                              <Trello className="w-3 h-3" /> Sync Jira
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <span className="text-slate-600">Owner:</span> {item.owner}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <Calendar className="w-3 h-3 text-slate-600" /> 
                               <span className="text-slate-600">Created:</span> {item.created_at || 'Mar 23, 2026'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                               <Calendar className="w-3 h-3 text-cyber-cyan/50" /> 
                               <span className="text-slate-600">Target:</span> {item.due_date || 'Apr 15, 2026'}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="text-center p-12 text-slate-500 glass-panel rounded-xl">
             RCA Engine is still processing or analysis failed.
          </div>
        )}
      </div>
      {/* Jira Sync Modal */}
      {jiraModalAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" onClick={() => setJiraModalAction(null)} />
          <div className="relative w-full max-w-lg glass-panel bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl overflow-hidden flex flex-col">
            
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-white/[0.02]">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Trello className="w-5 h-5 text-blue-400" />
                Create Jira Issue
              </h3>
              <button 
                onClick={() => setJiraModalAction(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Issue Summary</label>
                <input 
                  defaultValue={`[SentinelOps] ${incident.affected_service}: ${jiraModalAction.action}`}
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Jira Board</label>
                <select className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-colors">
                  <option>Platform SRE (SRE-1)</option>
                  <option>Checkout API (CH-2)</option>
                  <option>Infrastructure (INF-3)</option>
                  <option>Cyber Security (CS-4)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Assignee</label>
                  <input 
                    defaultValue={jiraModalAction.owner}
                    className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Due Date</label>
                  <input 
                    type="date"
                    defaultValue={formatDateForInput(jiraModalAction.due_date)}
                    className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Context Description</label>
                <textarea 
                  rows={4}
                  defaultValue={`Incident ID: ${incident.id}\nService: ${incident.affected_service}\nRoot Cause: ${rca?.root_cause}\n\nSuggested Action: ${jiraModalAction.action}`}
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-colors resize-none"
                />
              </div>

              <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg flex items-start gap-3">
                 <Cpu className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                 <p className="text-[11px] text-slate-400 leading-relaxed">
                   SentinelOps will automatically link this ticket to the incident audit trail and notify the owner via Slack once created.
                 </p>
              </div>
            </div>

            <div className="p-6 pt-2 border-t border-slate-800 flex gap-3">
              <button 
                onClick={() => setJiraModalAction(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-700 text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setCreatingJira(true);
                  setTimeout(() => {
                    setCreatingJira(false);
                    setJiraModalAction(null);
                  }, 1500);
                }}
                disabled={creatingJira}
                className="flex-[1.5] py-2.5 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creatingJira ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating Ticket...
                  </>
                ) : (
                  <>Create Jira Ticket</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
