import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { 
  Blocks, CheckCircle2, Cloud, Github, Slack, Database, CircleHelp, Settings, 
  Trello, Loader2, Ship, Activity, Search, ShieldCheck 
} from 'lucide-react';

const API_URL = 'http://localhost:8000';

interface Integration {
  id: string;
  name: string;
  icon: any;
  description: string;
  status: 'connected' | 'disconnected';
  color: string;
}

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    { id: 'aws', name: 'AWS Bedrock', icon: Cloud, description: 'LLM Reasoning Engine & Opensearch Vector Store.', status: 'disconnected', color: 'text-cyber-yellow' },
    { id: 'messaging', name: 'Incident Messaging', icon: Slack, description: 'Interactive Incident Response & App Webhooks.', status: 'connected', color: 'text-cyber-purple' },
    { id: 'kubernetes', name: 'Kubernetes', icon: Ship, description: 'VPC-internal cluster management and pod control.', status: 'disconnected', color: 'text-blue-500' },
    { id: 'telemetry', name: 'Real-time Telemetry', icon: Activity, description: 'Golden signal monitoring and performance alerts.', status: 'disconnected', color: 'text-orange-500' },
    { id: 'elk', name: 'ELK Stack', icon: Search, description: 'Historical log correlation and pattern discovery.', status: 'disconnected', color: 'text-cyber-cyan' },
    { id: 's3_audit', name: 'S3 Audit Storage', icon: ShieldCheck, description: 'Sovereign WORM storage for Chain-of-Thought logs.', status: 'disconnected', color: 'text-cyber-green' },
    { id: 'github', name: 'GitHub Enterprise', icon: Github, description: 'Causal commit tracing and PR analysis.', status: 'disconnected', color: 'text-slate-300' },
    { id: 'jira', name: 'Jira Software', icon: Trello, description: 'Automated ticketing for identified root causes.', status: 'disconnected', color: 'text-blue-400' },
    { id: 'database', name: 'Enterprise Database', icon: Database, description: 'Core relational databases (PostgreSQL/Oracle/MySQL).', status: 'disconnected', color: 'text-cyber-cyan' },
    { id: 'vault', name: 'Secrets Vault', icon: Settings, description: 'HashiCorp, CyberArk, or AWS Secrets Manager.', status: 'connected', color: 'text-slate-400' },
  ]);

  const [activeConfig, setActiveConfig] = useState<string | null>(null);
  const [configData, setConfigData] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'error'|'success', text: string} | null>(null);
  
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Determine active connectivity for all integrations based on backend `.env` validation
    axios.get(`${API_URL}/api/integrations/status`).then(res => {
      setIntegrations(prev => prev.map(i => {
        if (res.data[i.id] !== undefined) {
          return { ...i, status: res.data[i.id] ? 'connected' : 'disconnected' };
        }
        return i;
      }));
    }).catch(e => console.error(e));
  }, []);

  const toggleStatus = (id: string) => {
    setIntegrations(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, status: i.status === 'connected' ? 'disconnected' : 'connected' };
      }
      return i;
    }));
  };

  const openConfig = async (id: string) => {
    setActiveConfig(id);
    setMessage(null);
    setConfigData({});
    setLoadingConfig(true);
    try {
      const res = await axios.get(`${API_URL}/api/integrations/${id}`);
      setConfigData(res.data.config || {});
    } catch (e) {
      console.error("Could not load config", e);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleClose = () => {
    setActiveConfig(null);
    setMessage(null);
    setConfigData({});
  };

  const getFormData = () => {
    if (!formRef.current) return {};
    const formData = new FormData(formRef.current);
    const config: Record<string, any> = {};
    formData.forEach((value, key) => config[key] = value);
    return config;
  };

  const handleTest = async () => {
    if (!activeConfig) return;
    setTesting(true);
    setMessage(null);
    try {
      const config = getFormData();
      const res = await axios.post(`${API_URL}/api/integrations/test`, {
        provider_id: activeConfig,
        config
      });
      setMessage({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!activeConfig) return;
    setSaving(true);
    setMessage(null);
    try {
      const config = getFormData();
      await axios.post(`${API_URL}/api/integrations/save`, {
        provider_id: activeConfig,
        config
      });
      // Update local state to show it's connected
      setIntegrations(prev => prev.map(i => i.id === activeConfig ? { ...i, status: 'connected' } : i));
      handleClose();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || err.message });
    } finally {
      setSaving(false);
    }
  };

  const getFormFields = (id: string) => {
    switch(id) {
      case 'messaging': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Messaging Provider</label>
          <select name="provider" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4 cursor-pointer outline-none">
            <option>Slack (Block Kit)</option>
            <option>Microsoft Teams (Workflows)</option>
            <option>Webex</option>
            <option>Discord</option>
          </select>
          <label className="block text-xs font-mono text-slate-400 mb-1">Bot OAuth/Webhook (Vault ARN)</label>
          <input name="bot_token" defaultValue={configData.bot_token || ""} placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">App Secret (Vault ARN)</label>
          <input name="signing_secret" defaultValue={configData.signing_secret || ""} placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Primary Incident Channel</label>
          <input name="channel" defaultValue={configData.channel || "#incidents"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'vault': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Vault Provider</label>
          <select name="provider" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4 cursor-pointer outline-none">
            <option>AWS Secrets Manager</option>
            <option>HashiCorp Vault</option>
            <option>CyberArk</option>
          </select>
          <label className="block text-xs font-mono text-slate-400 mb-1">IAM Role / AppRole Path</label>
          <input name="role" defaultValue={configData.role || "arn:aws:iam::123:role/SentinelOpsSecretsReader"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'aws': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">AWS Region</label>
          <input name="region" defaultValue={configData.region || "us-east-1"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">IAM Role Override (Optional)</label>
          <input name="role_override" placeholder="arn:aws:iam::xxx:role/Bedrock" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">OpenSearch Endpoint</label>
          <input name="opensearch" defaultValue={configData.opensearch || "https://your-collection.us-east-1.aoss.amazonaws.com"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'github': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Enterprise Base URL</label>
          <input name="base_url" defaultValue="https://api.github.com" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Organization</label>
          <input name="org" placeholder="Your Org" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">App Installation Secret (Vault ARN)</label>
          <input name="secret" placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'kubernetes': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">K8s API Server (VPC Internal)</label>
          <input name="api_server" defaultValue={configData.api_server || "https://kubernetes.default.svc"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Service Account Token (Vault ARN)</label>
          <input name="token" defaultValue={configData.token || ""} placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Default Namespace Scope</label>
          <input name="namespace" defaultValue={configData.namespace || "production"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'telemetry': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Telemetry Source</label>
          <select name="source" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4 cursor-pointer outline-none">
            <option>Prometheus (Internal)</option>
            <option>Datadog</option>
            <option>New Relic</option>
            <option>AWS Managed Prometheus</option>
            <option>Dynatrace</option>
            <option>Grafana Cloud</option>
          </select>
          <label className="block text-xs font-mono text-slate-400 mb-1">Endpoint URL</label>
          <input name="url" defaultValue={configData.url || "http://prometheus.monitoring.svc:9090"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Auth Configuration (Vault ARN)</label>
          <input name="auth" placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'elk': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Elasticsearch Endpoint</label>
          <input name="endpoint" defaultValue={configData.endpoint || "http://elasticsearch.logging.svc:9200"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">API Key (Vault ARN)</label>
          <input name="api_key" placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Index Pattern</label>
          <input name="index_pattern" defaultValue={configData.index_pattern || "logs-*"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 's3_audit': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Sovereign Bucket Name</label>
          <input name="bucket" defaultValue={configData.bucket || "sentinelops-audit-storage"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">S3 Region</label>
          <input name="region" defaultValue={configData.region || "us-east-1"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Retention Policy (Years)</label>
          <input name="retention" type="number" defaultValue={configData.retention || "5"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'database': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Database Type</label>
          <select name="db_type" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4 cursor-pointer outline-none">
            <option>PostgreSQL</option><option>MySQL</option><option>Oracle DB</option>
          </select>
          <label className="block text-xs font-mono text-slate-400 mb-1">Connection String URI (Vault Path)</label>
          <input name="uri" defaultValue="secret/path/to/db_uri" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
      case 'jira': return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">Jira Host URL</label>
          <input name="url" defaultValue={configData.url || "https://your-domain.atlassian.net"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">API Token (Vault ARN)</label>
          <input name="secret" placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Default Project Key</label>
          <input name="project" defaultValue={configData.project || "SENTINEL"} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Default Jira Board</label>
          <select name="board" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 cursor-pointer outline-none">
            <option>SRE Operations Board</option>
            <option>Payment Gateway Core</option>
            <option>Mobile App Backend</option>
          </select>
        </>
      );
      default: return (
        <>
          <label className="block text-xs font-mono text-slate-400 mb-1">API Uniform Resource Locator</label>
          <input name="url" placeholder="https://api.thirdparty.com" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 mb-4" />
          <label className="block text-xs font-mono text-slate-400 mb-1">Authentication Secret (Vault ARN)</label>
          <input name="secret" placeholder="arn:aws:secretsmanager:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200" />
        </>
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
      
      <header className="px-8 py-6 border-b border-slate-800/60 bg-slate-900/30 sticky top-0 backdrop-blur z-20 shrink-0">
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <Blocks className="w-8 h-8 text-slate-400" />
          Global Integrations
        </h1>
        <p className="text-slate-500 mt-2">Connect SentinelOps to your existing cloud, communication, and engineering providers.</p>
      </header>

      <div className="flex-1 overflow-y-auto p-8 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {integrations.map((integration) => (
          <div key={integration.id} className="glass-panel p-6 rounded-xl flex flex-col h-full bg-slate-900/50">
            
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-slate-800 ${integration.color}`}>
                <integration.icon className="w-6 h-6" />
              </div>
              
              {integration.status === 'connected' ? (
                <span className="flex items-center gap-1 text-xs font-mono font-medium text-cyber-green bg-cyber-green/10 px-2.5 py-1 rounded border border-cyber-green/20">
                  <CheckCircle2 className="w-3 h-3" /> CONNECTED
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-mono font-medium text-slate-500 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
                  <CircleHelp className="w-3 h-3" /> DISCONNECTED
                </span>
              )}
            </div>

            <h3 className="text-lg font-bold text-white mb-1">{integration.name}</h3>
            <p className="text-sm text-slate-400 leading-relaxed flex-1">{integration.description}</p>
            
            <button 
              onClick={() => openConfig(integration.id)}
              className={`mt-6 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                integration.status === 'connected'
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 hover:bg-cyber-cyan/20'
              }`}
            >
              <Settings className="w-4 h-4" /> 
              Configure
            </button>
            <button 
              onClick={() => toggleStatus(integration.id)}
              className={`mt-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                integration.status === 'connected'
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 hover:bg-cyber-cyan/20'
              }`}
            >
              {integration.status === 'connected' ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        ))}
        </div>
      </div>

      {/* Slide-out Configuration Drawer */}
      {activeConfig && (
        <div className="fixed inset-0 z-50 flex justify-end">
           <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={handleClose} />
           <div className="relative w-[450px] bg-slate-900 border-l border-slate-700 shadow-2xl h-full flex flex-col pt-6 px-6">
              <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-wider flex justify-between items-center">
                 {integrations.find(i => i.id === activeConfig)?.name} Settings
                 <button onClick={handleClose} className="text-slate-400 hover:text-white border border-slate-700 px-2 py-1 rounded-md text-xs">Close</button>
              </h2>
              
              <form ref={formRef} className="flex-1 overflow-y-auto pb-6">
                 {loadingConfig ? (
                    <div className="flex items-center justify-center p-8 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
                 ) : getFormFields(activeConfig)}
                 <div className="mt-4 text-xs text-slate-500 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <p className="font-bold text-slate-300 mb-1">Pro-Tip:</p>
                    <p>Change any text box to <code className="text-cyber-red bg-slate-800 px-1 rounded">fail</code> to simulate a rejected connection test.</p>
                 </div>
              </form>

              <div className="p-4 border-t border-slate-700/50 flex flex-col gap-3 pb-6">
                 {message && (
                   <div className={`p-3 rounded-lg text-sm border flex items-start gap-2 ${message.type === 'success' ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/20' : 'bg-cyber-red/10 text-cyber-red border-cyber-red/20'}`}>
                     {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <CircleHelp className="w-4 h-4 shrink-0 mt-0.5" />}
                     {message.text}
                   </div>
                 )}
                 <button 
                   onClick={handleTest}
                   disabled={testing || saving}
                   className="w-full flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
                 >
                   {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Test Connection
                 </button>
                 <button 
                   onClick={handleSave}
                   disabled={testing || saving}
                   className="w-full py-2.5 flex justify-center items-center gap-2 rounded-lg text-sm font-semibold bg-cyber-cyan text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                 >
                   {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Configuration
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
