import React, { useState, useEffect } from 'react';
import { Key, Sparkles, AlertCircle, Eye, EyeOff, Save, CheckCircle, RefreshCw } from 'lucide-react';
import { fetchAvailableModels } from '../utils/geminiApi';
import type { ApiProvider } from '../utils/geminiApi';

interface ApiKeyModalProps {
  onSave: (config: { provider: ApiProvider; apiKey: string; model: string }) => void;
  initialConfig?: { provider: ApiProvider; apiKey: string; model: string } | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  onSave,
  initialConfig,
  isOpen,
  onClose,
}) => {
  const [provider, setProvider] = useState<ApiProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3.5-flash');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Default fallback models
  const defaultGeminiModels = [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Recommended - Dynamic)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  ];

  const defaultOpenaiModels = [
    { id: 'gpt-4o', name: 'GPT-4o (Recommended)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  ];

  useEffect(() => {
    if (initialConfig) {
      setProvider(initialConfig.provider);
      setApiKey(initialConfig.apiKey);
      setModel(initialConfig.model);
    }
  }, [initialConfig, isOpen]);

  // Dynamic model fetcher
  useEffect(() => {
    const fetchModelsList = async () => {
      if (!apiKey.trim()) {
        const fallbacks = provider === 'gemini' ? defaultGeminiModels : defaultOpenaiModels;
        setModels(fallbacks);
        if (!initialConfig || initialConfig.provider !== provider) {
          setModel(fallbacks[0].id);
        }
        return;
      }

      setLoadingModels(true);
      try {
        const fetched = await fetchAvailableModels(provider, apiKey.trim());
        if (fetched.length > 0) {
          setModels(fetched);
          // Auto-select first model if the current one isn't in fetched list
          if (!fetched.some(m => m.id === model)) {
            setModel(fetched[0].id);
          }
        } else {
          setModels(provider === 'gemini' ? defaultGeminiModels : defaultOpenaiModels);
        }
      } catch (err) {
        console.warn('Dynamic model loading failed, utilizing native backups:', err);
        setModels(provider === 'gemini' ? defaultGeminiModels : defaultOpenaiModels);
      } finally {
        setLoadingModels(false);
      }
    };

    fetchModelsList();
  }, [provider, apiKey]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Please enter a valid API Key.');
      return;
    }
    setError('');
    
    // Save to localStorage
    localStorage.setItem('fontcreator_provider', provider);
    localStorage.setItem('fontcreator_apikey', apiKey.trim());
    localStorage.setItem('fontcreator_model', model);

    onSave({
      provider,
      apiKey: apiKey.trim(),
      model,
    });

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <div 
        className="glass-panel-glow w-full max-w-md p-6 relative overflow-hidden flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating gradient decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Key size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display">Bring Your Own Key</h2>
            <p className="text-xs text-slate-400">Configure your local AI credentials</p>
          </div>
        </div>

        {saved ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 pulse-glow">
              <CheckCircle size={36} />
            </div>
            <h3 className="text-lg font-semibold text-teal-300">Credentials Locked!</h3>
            <p className="text-sm text-slate-400">Saved securely in browser local storage.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Provider Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                API Provider
              </label>
              <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                <button
                  type="button"
                  onClick={() => setProvider('gemini')}
                  className={`py-2 px-3 rounded-md text-sm font-semibold transition-all duration-200 ${
                    provider === 'gemini'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Google Gemini
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('openai')}
                  className={`py-2 px-3 rounded-md text-sm font-semibold transition-all duration-200 ${
                    provider === 'openai'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  OpenAI
                </button>
              </div>
            </div>

            {/* Model Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                <span>AI Model</span>
                {loadingModels && (
                  <span className="text-[10px] text-teal-400 lowercase tracking-normal flex items-center gap-1 font-mono">
                    <RefreshCw size={10} className="animate-spin" /> listing...
                  </span>
                )}
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full text-input bg-[#0d0d11]"
                disabled={loadingModels}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                <span>API Key</span>
                <span className="text-[10px] text-teal-400 lowercase tracking-normal bg-teal-500/10 px-1.5 py-0.5 rounded">
                  Local-only
                </span>
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'gemini'
                      ? 'AIzaSy...'
                      : 'sk-proj-...'
                  }
                  className="w-full text-input pr-10 font-mono bg-[#0d0d11]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-lg text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex gap-2.5 mt-3 border-t border-white/5 pt-4 justify-end">
              {initialConfig && (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary py-2 px-4"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="btn-primary py-2 px-5 bg-gradient-to-r from-indigo-500 to-purple-600"
              >
                <Save size={16} />
                Save Credentials
              </button>
            </div>
          </form>
        )}

        <div className="flex gap-1.5 items-start bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-lg">
          <Sparkles size={14} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-slate-400">
            {provider === 'gemini' ? (
              <>
                Don't have a Gemini API Key? Get one instantly for free at{' '}
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:underline hover:text-indigo-300 transition-colors font-medium"
                >
                  Google AI Studio
                </a>.
              </>
            ) : (
              <>
                You can obtain an OpenAI API Key by logging into your{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:underline hover:text-indigo-300 transition-colors font-medium"
                >
                  OpenAI Developer Platform
                </a>.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
