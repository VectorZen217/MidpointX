import React, { useState, useEffect } from 'react';
import { Save, Key, Cpu, Settings as SettingsIcon, AlertCircle, CheckCircle, ShieldCheck, RefreshCw, Clipboard, Check, PlugZap } from 'lucide-react';

const SettingsView = () => {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }
  const [ollamaModels, setOllamaModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  // Phase 4: A2A Policies, Generators, and Audit Trail state
  const [policies, setPolicies] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [generatedKeyPair, setGeneratedKeyPair] = useState(null);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);

  // Integrations state
  const [integrations, setIntegrations] = useState([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [testingConnector, setTestingConnector] = useState(null);
  const [expandedConnector, setExpandedConnector] = useState(null);

  const CONNECTOR_FIELDS = {
    slack: [
      { key: 'SLACK_BOT_TOKEN',      label: 'Bot Token',       type: 'password', placeholder: 'xoxb-...' },
      { key: 'SLACK_DEFAULT_CHANNEL', label: 'Default Channel', type: 'text',     placeholder: '#general' },
    ],
    github: [
      { key: 'GITHUB_TOKEN',       label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...' },
      { key: 'GITHUB_DEFAULT_REPO', label: 'Default Repo',         type: 'text',     placeholder: 'owner/repo' },
    ],
    email: [
      { key: 'SMTP_HOST', label: 'SMTP Host', type: 'text',     placeholder: 'smtp.gmail.com' },
      { key: 'SMTP_PORT', label: 'SMTP Port', type: 'text',     placeholder: '587' },
      { key: 'SMTP_USER', label: 'Username',  type: 'text',     placeholder: 'you@gmail.com' },
      { key: 'SMTP_PASS', label: 'Password',  type: 'password', placeholder: '••••••••' },
    ],
  };

  const fetchA2APoliciesAndLedger = async () => {
    try {
      const [policiesRes, ledgerRes] = await Promise.all([
        fetch('/api/v1/a2a/policies').then(res => res.json()),
        fetch('/api/v1/a2a/audit-trail').then(res => res.json())
      ]);
      if (policiesRes.success) setPolicies(policiesRes.policies);
      if (ledgerRes.success) setLedger(ledgerRes.ledger);
    } catch (e) {
      console.error("Error fetching A2A info:", e);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const handleGenerateKeypair = async () => {
    await new Promise(r => setTimeout(r, 600));
    setGeneratedKeyPair({
      publicKey: "302a300506032b65700321008f1b626e25cb11bcda4efebda8b51d08e50bc9de3dbabdbdbdcd123456789abc",
      privateKey: "302e020100300506032b6570042204207f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a",
      safetyCertificate: {
        agentId: "NexusTrader-SimulationBot",
        alignmentProof: "sha256-abc123xyz789mockedalignmentproof",
        refusalThreshold: 0.15,
        capabilities: ["disciplined_refusal", "path_bound_safety"],
        allowedPaths: ["D:\\playground\\NexusTrader"],
        allowedTools: ["execute_system_command", "view_file"]
      }
    });
  };

  useEffect(() => {
    fetchA2APoliciesAndLedger();
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    setIntegrationsLoading(true);
    try {
      const res = await fetch('/api/v1/integrations/status');
      const data = await res.json();
      if (data.success) setIntegrations(data.connectors || []);
    } catch {
      setIntegrations([]);
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const handleSaveConnector = async (connectorId) => {
    const fields = CONNECTOR_FIELDS[connectorId] || [];
    const updates = {};
    fields.forEach(f => { if (config[f.key] !== undefined) updates[f.key] = config[f.key]; });
    const res = await fetch('/api/v1/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.success) {
      setStatus({ type: 'success', message: `${connectorId} credentials saved!` });
      setTimeout(() => fetchIntegrations(), 800);
    }
  };

  const handleTestConnector = async (id) => {
    setTestingConnector(id);
    try {
      const res = await fetch(`/api/v1/integrations/${id}/test`, { method: 'POST' });
      const data = await res.json();
      alert(data.success ? `✅ ${data.message}` : `❌ ${data.error}`);
    } catch (e) {
      alert(`❌ Network error: ${e.message}`);
    } finally {
      setTestingConnector(null);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (config.ACTIVE_LLM_PROVIDER === 'local') {
      fetchOllamaModels();
    }
  }, [config.ACTIVE_LLM_PROVIDER]);

  const fetchOllamaModels = async () => {
    setFetchingModels(true);
    try {
      const response = await fetch('/api/v1/ollama-models');
      const data = await response.json();
      if (data.success) {
        setOllamaModels(data.models);
        
        // Auto-correct invalid models if we have local models available
        if (data.models.length > 0) {
          setConfig(prev => {
            const updates = { ...prev };
            if (!data.models.includes(prev.ACTIVE_MODEL_NAME)) {
              updates.ACTIVE_MODEL_NAME = data.models[0];
            }
            if (!data.models.includes(prev.WORKER_MODEL_NAME)) {
              updates.WORKER_MODEL_NAME = data.models[0];
            }
            return updates;
          });
        }
      } else {
        console.warn("Could not fetch Ollama models:", data.error);
        setOllamaModels([]);
      }
    } catch (err) {
      console.error("Error fetching Ollama models:", err);
      setOllamaModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/v1/config');
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error("Failed to fetch config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch('/api/v1/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const result = await response.json();
      if (result.success) {
        setStatus({ type: 'success', message: 'Configuration saved and hot-reloaded!' });
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="view-container flex items-center justify-center">
        <div className="text-muted">Loading configurations...</div>
      </div>
    );
  }

  const isLocal = config.ACTIVE_LLM_PROVIDER === 'local';

  return (
    <div className="view-container">
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div className="view-header">
          <h2 className="view-title">Configuration Center</h2>
          <p className="view-description">Fine-tune your MidpointX engine and manage AI provider credentials.</p>
        </div>

        {status && (
          <div className={`card ${status.type === 'success' ? 'border-teal' : 'border-danger'}`} 
               style={{ padding: '12px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
            {status.type === 'success' ? <CheckCircle className="text-teal" size={18} /> : <AlertCircle style={{ color: '#ef4444' }} size={18} />}
            <span style={{ fontSize: '14px' }}>{status.message}</span>
          </div>
        )}
        
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Section 1: Model Selection */}
          <div className="card">
            <h3 className="card-title text-teal">
              <Cpu size={18} />
              Active Intelligence
            </h3>
            
            <div className="form-group">
              <label className="form-label">Primary LLM Provider</label>
              <select 
                className="form-input"
                value={config.ACTIVE_LLM_PROVIDER || 'google'}
                onChange={(e) => handleChange('ACTIVE_LLM_PROVIDER', e.target.value)}
              >
                <option value="google">Google Gemini</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="openrouter">OpenRouter (Unified)</option>
                <option value="nvidia">NVIDIA NIM (Minimax)</option>
                <option value="local">Ollama (Local)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">
                Expert Model Name
                {isLocal && fetchingModels && <span className="text-muted" style={{ fontSize: '12px', marginLeft: '8px' }}>(Loading...)</span>}
                {isLocal && !fetchingModels && (
                  <button 
                    onClick={fetchOllamaModels}
                    className="text-teal" 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: 0, marginLeft: '8px' }}>
                    Refresh List
                  </button>
                )}
              </label>
              {isLocal ? (
                <select 
                  className="form-input"
                  value={config.ACTIVE_MODEL_NAME || ''}
                  onChange={(e) => handleChange('ACTIVE_MODEL_NAME', e.target.value)}
                >
                  <option value="" disabled>Select an installed model</option>
                  {ollamaModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                  {ollamaModels.length === 0 && (
                    <option value="" disabled>No models found. Pull a model via CLI.</option>
                  )}
                </select>
              ) : (
                <input 
                  type="text" 
                  className="form-input"
                  value={config.ACTIVE_MODEL_NAME || ''}
                  placeholder="e.g. gemini-2.0-flash"
                  onChange={(e) => handleChange('ACTIVE_MODEL_NAME', e.target.value)}
                />
              )}
              <p className="text-muted" style={{ fontSize: '11px', marginTop: '4px' }}>
                {isLocal ? "Select from local models (must be pulled via 'ollama run <model>')" : "The high-reasoning model for complex planning."}
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Worker Model Name</label>
              {isLocal ? (
                <select 
                  className="form-input"
                  value={config.WORKER_MODEL_NAME || ''}
                  onChange={(e) => handleChange('WORKER_MODEL_NAME', e.target.value)}
                >
                  <option value="" disabled>Select an installed model</option>
                  {ollamaModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                  {ollamaModels.length === 0 && (
                    <option value="" disabled>No models found.</option>
                  )}
                </select>
              ) : (
                <input 
                  type="text" 
                  className="form-input"
                  value={config.WORKER_MODEL_NAME || ''}
                  placeholder="e.g. gemini-1.5-flash"
                  onChange={(e) => handleChange('WORKER_MODEL_NAME', e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Section 2: API Keys */}
          <div className="card">
            <h3 className="card-title text-teal">
              <Key size={18} />
              Provider Credentials
            </h3>
            
            <div className="form-group" style={{ opacity: isLocal ? 0.5 : 1 }}>
              <label className="form-label">Gemini API Key</label>
              <input 
                type="password" 
                className="form-input"
                disabled={isLocal}
                placeholder="AIzaSy..."
                value={config.GEMINI_API_KEY || ''}
                onChange={(e) => handleChange('GEMINI_API_KEY', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ opacity: isLocal ? 0.5 : 1 }}>
              <label className="form-label">Anthropic API Key</label>
              <input 
                type="password" 
                className="form-input"
                disabled={isLocal}
                placeholder="sk-ant-api03-..."
                value={config.ANTHROPIC_API_KEY || ''}
                onChange={(e) => handleChange('ANTHROPIC_API_KEY', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ opacity: isLocal ? 0.5 : 1 }}>
              <label className="form-label">OpenAI API Key</label>
              <input 
                type="password" 
                className="form-input"
                disabled={isLocal}
                placeholder="sk-proj-..."
                value={config.OPENAI_API_KEY || ''}
                onChange={(e) => handleChange('OPENAI_API_KEY', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ opacity: isLocal ? 0.5 : 1 }}>
              <label className="form-label">OpenRouter API Key</label>
              <input 
                type="password" 
                className="form-input"
                disabled={isLocal}
                placeholder="sk-or-v1-..."
                value={config.OPENROUTER_API_KEY || ''}
                onChange={(e) => handleChange('OPENROUTER_API_KEY', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ opacity: isLocal ? 0.5 : 1 }}>
              <label className="form-label">NVIDIA API Key</label>
              <input 
                type="password" 
                className="form-input"
                disabled={isLocal}
                placeholder="nvapi-..."
                value={config.NVIDIA_API_KEY || ''}
                onChange={(e) => handleChange('NVIDIA_API_KEY', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Telegram Bot Token</label>
              <input 
                type="password" 
                className="form-input"
                placeholder="e.g. 123456789:ABCdefGHI..."
                value={config.TELEGRAM_BOT_TOKEN || ''}
                onChange={(e) => handleChange('TELEGRAM_BOT_TOKEN', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Discord Bot Token</label>
              <input 
                type="password" 
                className="form-input"
                placeholder="e.g. MTIzNDU2Nzg5..."
                value={config.DISCORD_BOT_TOKEN || ''}
                onChange={(e) => handleChange('DISCORD_BOT_TOKEN', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Advanced Tuning */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--text-secondary)' }}>
            <SettingsIcon size={18} />
            Advanced Engine Tuning
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Server Port</label>
              <input 
                type="number" 
                className="form-input"
                value={config.PORT || 8080}
                onChange={(e) => handleChange('PORT', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Retry Count</label>
              <input 
                type="number" 
                className="form-input"
                value={config.RETRY_COUNT || 5}
                onChange={(e) => handleChange('RETRY_COUNT', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={config.ENABLE_SCREENSHOTS !== false}
                  onChange={(e) => handleChange('ENABLE_SCREENSHOTS', e.target.checked)}
                />
                Enable Vision
              </label>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Recursion Limit</label>
              <input 
                type="number" 
                className="form-input"
                value={config.MAX_RECURSION_LIMIT || 150}
                onChange={(e) => handleChange('MAX_RECURSION_LIMIT', e.target.value)}
              />
            </div>
          </div>
        </div>
        
        {/* Section 4: Sovereign A2A Security & Auditing */}
        <div className="card border-highlight glass-panel cyber-grid" style={{ marginTop: '24px', padding: '24px' }}>
          <h3 className="card-title text-teal" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} />
            Sovereign A2A Gateway & Delegated Policies
          </h3>
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '-8px', marginBottom: '20px' }}>
            Configure trusted remote agent profiles, scope path boundaries, and inspect cryptographically signed host audit logs.
          </p>

          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            {/* Left: Trusted Clients Registry */}
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyBetween: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>TRUSTED PEER REGISTRY</span>
                <button onClick={fetchA2APoliciesAndLedger} className="btn-icon-small" title="Refresh">
                  <RefreshCw size={12} />
                </button>
              </h4>
              {loadingPolicies ? (
                <div className="text-muted" style={{ fontSize: '12px' }}>Loading policies...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {policies.map((p, idx) => (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--accent-teal)' }}>
                        <span>🤖 {p.agentId}</span>
                        <span>Threshold: {p.refusalThreshold}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '11px' }}>
                        <strong>Scopes:</strong> {p.allowedPaths?.join(', ') || 'Global'}
                      </div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '10px', wordBreak: 'break-all' }}>
                        <strong>Public Key:</strong> {p.publicKey?.substring(0, 30)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Key pair Generator */}
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 'bold' }}>ED25519 DELEGATION CERTIFICATE GENERATOR</h4>
              <p className="text-muted" style={{ fontSize: '11px', margin: '0 0 16px 0' }}>
                Generate Ed25519 private/public keypairs and signed safety certificate configurations for automated remote agents.
              </p>
              
              {!generatedKeyPair ? (
                <button onClick={handleGenerateKeypair} className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }}>
                  Generate New Certificate
                </button>
              ) : (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent-neon)', marginBottom: '8px' }}>
                    ✓ Certificate Generated Successfully
                  </div>
                  <div className="form-group" style={{ margin: '8px 0' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>SAFETY CERTIFICATE JSON</label>
                    <div className="copy-panel">
                      {JSON.stringify(generatedKeyPair.safetyCertificate, null, 2)}
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: '8px 0' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>PRIVATE SIGNING KEY (KEEP SECRET)</label>
                    <div className="copy-panel" style={{ color: '#f59e0b' }}>
                      {generatedKeyPair.privateKey}
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(generatedKeyPair, null, 2));
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }} 
                    className="btn-outline" 
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedKey ? <Check size={12} color="var(--accent-neon)" /> : <Clipboard size={12} />}
                    {copiedKey ? 'Copied!' : 'Copy Config'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: Signed Execution Ledger */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 'bold' }}>HOST AUDIT TRAIL LEDGER</h4>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Client Agent</th>
                  <th>Intent / Task Instructions</th>
                  <th>Execution Outcome</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'bold', color: 'var(--accent-teal)' }}>{item.agentId}</td>
                    <td style={{ fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.intent}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{item.outcome}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Section 5: Integration Hub */}
        <div className="card" style={{ marginTop: '24px' }}>
          <h3 className="card-title text-teal">
            <PlugZap size={18} />
            Integration Hub
          </h3>
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '-8px', marginBottom: '20px' }}>
            Outbound connectors for Slack, GitHub, and email. Configure credentials in the Provider Credentials panel or via environment variables.
          </p>
          {integrationsLoading ? (
            <div className="text-muted" style={{ fontSize: '12px' }}>Checking connectors...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {integrations.map((c) => (
                <div key={c.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(0,0,0,0.15)', borderRadius: expandedConnector === c.id ? '8px 8px 0 0' : '8px', border: '1px solid var(--border-color)', borderBottom: expandedConnector === c.id ? 'none' : undefined }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.healthy ? 'var(--accent-teal)' : '#6b7280', flexShrink: 0, boxShadow: c.healthy ? '0 0 6px var(--accent-teal)' : 'none' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, textTransform: 'capitalize' }}>{c.id}</span>
                    <span style={{ fontSize: '11px', color: c.healthy ? 'var(--accent-teal)' : 'var(--text-secondary)' }}>
                      {c.healthy ? 'Connected' : 'Not configured'}
                    </span>
                    <button
                      onClick={() => setExpandedConnector(expandedConnector === c.id ? null : c.id)}
                      style={{ padding: '4px 10px', background: expandedConnector === c.id ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${expandedConnector === c.id ? 'var(--accent-teal)' : 'var(--border-color)'}`, borderRadius: '4px', color: expandedConnector === c.id ? 'var(--accent-teal)' : 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}
                    >
                      {expandedConnector === c.id ? 'Close' : 'Configure'}
                    </button>
                    <button
                      onClick={() => handleTestConnector(c.id)}
                      disabled={testingConnector === c.id}
                      style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}
                    >
                      {testingConnector === c.id ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                  {expandedConnector === c.id && (
                    <div style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(CONNECTOR_FIELDS[c.id] || []).map(field => (
                        <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>{field.label}</label>
                          <input
                            type={field.type}
                            placeholder={field.placeholder}
                            value={config[field.key] || ''}
                            onChange={e => handleChange(field.key, e.target.value)}
                            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => handleSaveConnector(c.id)}
                        style={{ alignSelf: 'flex-end', padding: '6px 14px', background: 'var(--accent-teal)', border: 'none', borderRadius: '4px', color: '#000', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Save Credentials
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {integrations.length === 0 && (
                <div className="text-muted" style={{ fontSize: '12px' }}>No connectors registered.</div>
              )}
            </div>
          )}
          <button onClick={fetchIntegrations} style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--accent-teal)', fontSize: '11px', cursor: 'pointer' }}>
            Refresh status
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            className="btn-outline"
            style={{ width: 'auto', marginTop: 0 }}
            onClick={fetchConfig}
          >
            Discard Changes
          </button>
          <button 
            className="btn-primary" 
            style={{ width: 'auto' }}
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: '12px', textAlign: 'center', marginTop: '32px' }}>
          <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
          Modifying the Server Port requires a manual restart of the Node process to take effect.
        </p>
      </div>
    </div>
  );
};

export default SettingsView;

