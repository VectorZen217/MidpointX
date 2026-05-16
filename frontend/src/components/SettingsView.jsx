import React, { useState, useEffect } from 'react';
import { Save, Key, Cpu, Settings as SettingsIcon, AlertCircle, CheckCircle } from 'lucide-react';

const SettingsView = () => {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }
  const [ollamaModels, setOllamaModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);

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

