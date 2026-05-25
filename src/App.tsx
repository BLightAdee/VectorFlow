import { useState, useEffect } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { DrawingCanvas } from './components/DrawingCanvas';
import { UnicodeSelector } from './components/UnicodeSelector';
import { GlyphGrid } from './components/GlyphGrid';
import { FontSandbox } from './components/FontSandbox';
import { getCharactersForBlocks } from './utils/unicodeBlocks';
import {
  analyzeFontStyle,
  generateGlyphBatch,
} from './utils/geminiApi';
import type {
  ApiProvider,
  StyleReport,
  GeneratedGlyph,
} from './utils/geminiApi';
import {
  Sparkles,
  Key,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Activity,
  AlertCircle,
  ChevronRight
} from 'lucide-react';

export default function App() {
  // 1. API Credentials State
  const [apiConfig, setApiConfig] = useState<{
    provider: ApiProvider;
    apiKey: string;
    model: string;
  } | null>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  // 2. Generation flow & blocks selector
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([
    'basic-latin-letters',
    'basic-latin-digits',
  ]);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [styleReport, setStyleReport] = useState<StyleReport | null>(null);
  const [analyzingStyle, setAnalyzingStyle] = useState(false);
  const [synthesisActive, setSynthesisActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'matrix' | 'sandbox'>('input');

  // 3. Grid state & outputs
  const [generatedGlyphs, setGeneratedGlyphs] = useState<Record<number, GeneratedGlyph>>({});
  const [generatingCodes, setGeneratingCodes] = useState<number[]>([]);
  const [failedCodes, setFailedCodes] = useState<number[]>([]);
  const [progressMsg, setProgressMsg] = useState('');
  const [globalError, setGlobalError] = useState('');

  // Read saved credentials on boot
  useEffect(() => {
    const provider = localStorage.getItem('fontcreator_provider') as ApiProvider | null;
    const apiKey = localStorage.getItem('fontcreator_apikey');
    const model = localStorage.getItem('fontcreator_model');

    if (provider && apiKey && model) {
      setApiConfig({ provider, apiKey, model });
    } else {
      // Prompt modal if credentials are missing
      setKeyModalOpen(true);
    }
  }, []);

  // Get active selected list of characters from blocks
  const targetCharacters = getCharactersForBlocks(selectedBlockIds);

  // Orchestrate style analysis
  const handleStyleStitched = async (stitchedImage: string) => {
    if (!apiConfig) {
      setGlobalError('Please configure your AI API Key first in the settings.');
      setKeyModalOpen(true);
      return;
    }

    setCompositeImage(stitchedImage);
    setAnalyzingStyle(true);
    setGlobalError('');
    setStyleReport(null);

    try {
      const report = await analyzeFontStyle(stitchedImage, apiConfig);
      setStyleReport(report);
      setActiveTab('matrix'); // Automatically advance to synthesis matrix tab!
    } catch (err: any) {
      console.error(err);
      setGlobalError(err.message || 'Style extraction failed. Verify your API key and connection.');
      setCompositeImage(null); // Reset to drawing canvas to try again
    } finally {
      setAnalyzingStyle(false);
    }
  };

  // Run full generation of selected characters in parallel batches
  const triggerSynthesis = async () => {
    if (!apiConfig || !compositeImage || !styleReport) return;

    setSynthesisActive(true);
    setGlobalError('');
    setFailedCodes([]);

    // Find characters that haven't been successfully generated yet
    const pendingChars = targetCharacters.filter(c => !generatedGlyphs[c.code]);
    if (pendingChars.length === 0) {
      setSynthesisActive(false);
      setProgressMsg('All selected characters are already generated.');
      return;
    }

    const batchSize = apiConfig.provider === 'gemini' ? 8 : 6;
    const totalCount = pendingChars.length;
    let completedCount = 0;

    // Process characters in serial batches to avoid rate limit or token limits, but parallel inside the batch!
    for (let i = 0; i < pendingChars.length; i += batchSize) {
      const currentBatch = pendingChars.slice(i, i + batchSize);
      const batchCodes = currentBatch.map(c => c.code);

      setGeneratingCodes(prev => [...prev, ...batchCodes]);
      setProgressMsg(`Synthesizing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(totalCount / batchSize)}...`);

      try {
        const glyphs = await generateGlyphBatch(
          currentBatch,
          compositeImage,
          styleReport,
          apiConfig
        );

        // Save successfully synthesized glyphs to state
        setGeneratedGlyphs(prev => {
          const next = { ...prev };
          glyphs.forEach(g => {
            next[g.code] = g;
          });
          return next;
        });

        completedCount += glyphs.length;
      } catch (err: any) {
        console.error(`Batch failed:`, err);
        // Mark current batch codes as failed
        setFailedCodes(prev => [...prev, ...batchCodes]);
      } finally {
        // Remove current batch codes from loading states
        setGeneratingCodes(prev => prev.filter(code => !batchCodes.includes(code)));
      }
    }

    setSynthesisActive(false);
    setProgressMsg(`Synthesis completed! Processed ${completedCount} characters.`);
  };

  // Trigger regeneration of a single glyph (triggered from inspector)
  const handleRegenerateSingleGlyph = async (code: number) => {
    if (!apiConfig || !compositeImage || !styleReport) return;

    const charMeta = targetCharacters.find(c => c.code === code);
    if (!charMeta) return;

    setGeneratingCodes(prev => [...prev, code]);
    setFailedCodes(prev => prev.filter(c => c !== code));

    try {
      const glyphs = await generateGlyphBatch(
        [charMeta],
        compositeImage,
        styleReport,
        apiConfig
      );

      if (glyphs.length > 0) {
        setGeneratedGlyphs(prev => ({
          ...prev,
          [code]: glyphs[0],
        }));
      }
    } catch (err) {
      console.error(`Regenerate failed for code ${code}:`, err);
      setFailedCodes(prev => [...prev, code]);
    } finally {
      setGeneratingCodes(prev => prev.filter(c => c !== code));
    }
  };

  const handleUpdateGlyphPath = (code: number, newPath: string, newWidth: number) => {
    setGeneratedGlyphs(prev => {
      if (!prev[code]) return prev;
      return {
        ...prev,
        [code]: {
          ...prev[code],
          path: newPath,
          width: newWidth,
        },
      };
    });
  };

  const handleResetWorkspace = () => {
    if (confirm('Are you sure you want to reset your workspace? This will erase all drawn samples and synthesized characters.')) {
      setCompositeImage(null);
      setStyleReport(null);
      setGeneratedGlyphs({});
      setFailedCodes([]);
      setGeneratingCodes([]);
      setProgressMsg('');
      setGlobalError('');
      setActiveTab('input');
    }
  };

  return (
    <div className="app-container">
      {/* HEADER SECTION */}
      <header className="header">
        <div className="logo-container">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-teal-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="text-white" size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="logo-text">VectorFlow</h1>
              <span className="logo-badge">V1.0</span>
            </div>
            <p className="text-xs text-slate-400">AI-Powered Handwriting to TrueType Font Engine</p>
          </div>
        </div>

        {/* Credentials and settings bar */}
        <div className="flex items-center gap-3">
          {apiConfig ? (
            <div className="hidden sm:flex items-center gap-2 bg-indigo-500/5 border border-indigo-500/10 px-3 py-1.5 rounded-lg text-xs">
              <ShieldCheck className="text-indigo-400" size={14} />
              <span className="text-slate-300 font-semibold uppercase tracking-wider text-[10px]">
                {apiConfig.provider} locked
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400 font-mono text-[10px]">{apiConfig.model}</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 bg-rose-500/5 border border-rose-500/15 px-3 py-1.5 rounded-lg text-xs text-rose-300">
              <Key size={14} />
              <span>Key Missing</span>
            </div>
          )}

          <button
            onClick={() => setKeyModalOpen(true)}
            className="btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1.5"
          >
            <Key size={13} />
            BYOK Config
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE GRID */}
      <div className="workspace-layout">
        
        {/* LEFT COLUMN: CONTROLS & DEFINITIONS */}
        <aside className="flex flex-col gap-4">
          {/* 1. Global Setup Instructions / Status */}
          <div className="glass-panel p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
              <Cpu size={16} className="text-teal-400" />
              <h3 className="text-sm font-semibold text-slate-200">Synthesis Engine</h3>
            </div>
            
            <div className="flex flex-col gap-2">
              {/* Step indicator */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Current Stage:</span>
                <span className="font-bold text-white uppercase tracking-wider text-[10px] bg-white/5 px-2 py-0.5 rounded">
                  {!compositeImage ? '1. Style Input' : styleReport ? '3. Generation' : '2. Analyzing Style'}
                </span>
              </div>
              
              {/* Flow descriptions */}
              <p className="text-[11px] leading-relaxed text-slate-400">
                {!compositeImage ? (
                  "Draw the 5 key letters inside the guide grid, or upload your layout sheet to extract visual handwriting traits."
                ) : !styleReport ? (
                  "AI is parsing your image and compiling a stylistic blueprint of your line-weights, slant, and curvatures..."
                ) : (
                  "Style blueprint ready. Select your desired Unicode Blocks below and trigger synthesis to vectorize your font."
                )}
              </p>
            </div>

            {/* Reset Workspace button */}
            {compositeImage && (
              <button
                onClick={handleResetWorkspace}
                className="btn-secondary py-2 justify-center text-xs text-rose-400 border-rose-500/5 hover:bg-rose-500/5 hover:border-rose-500/20"
              >
                Reset App Workspace
              </button>
            )}
          </div>

          {/* 2. Visual AI Style Report (renders once style is analyzed) */}
          {styleReport && (
            <div className="glass-panel p-5 bg-gradient-to-b from-indigo-500/5 to-transparent border-indigo-500/10 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
                <Activity size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-200">Extracted Style Blueprint</h3>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-black/40 p-2 rounded border border-white/5 flex flex-col">
                  <span className="text-slate-500 uppercase tracking-wider">Weight</span>
                  <span className="text-indigo-300 font-bold capitalize mt-0.5">{styleReport.strokeThickness}</span>
                </div>
                <div className="bg-black/40 p-2 rounded border border-white/5 flex flex-col">
                  <span className="text-slate-500 uppercase tracking-wider">Serif</span>
                  <span className="text-indigo-300 font-bold capitalize mt-0.5">{styleReport.serifType}</span>
                </div>
                <div className="bg-black/40 p-2 rounded border border-white/5 flex flex-col">
                  <span className="text-slate-500 uppercase tracking-wider">Slant</span>
                  <span className="text-indigo-300 font-bold capitalize mt-0.5">{styleReport.slant}</span>
                </div>
                <div className="bg-black/40 p-2 rounded border border-white/5 flex flex-col">
                  <span className="text-slate-500 uppercase tracking-wider">Contours</span>
                  <span className="text-indigo-300 font-bold capitalize mt-0.5">{styleReport.roundness}</span>
                </div>
              </div>

              <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                <p className="text-[11px] leading-relaxed text-slate-400 italic font-light">
                  "{styleReport.description}"
                </p>
              </div>
            </div>
          )}

          {/* 3. Unicode Range Block checklist */}
          <UnicodeSelector
            selectedBlockIds={selectedBlockIds}
            onChange={(ids) => {
              if (ids.length > 0) setSelectedBlockIds(ids);
            }}
          />
        </aside>

        {/* RIGHT COLUMN: CORE WORKSPACES & CONSOLES */}
        <main className="flex flex-col gap-4">
          {/* Global error banner */}
          {globalError && (
            <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-rose-200">Execution Blocked</h4>
                <p className="text-xs mt-0.5 text-slate-300">{globalError}</p>
              </div>
            </div>
          )}

          {/* Main Console Tab Selector */}
          <div className="flex border border-white/5 bg-white/2 rounded-xl overflow-hidden p-1 gap-1">
            <button
              onClick={() => setActiveTab('input')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 rounded-lg transition-all ${
                activeTab === 'input'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>1. Canvas Sketchpad</span>
            </button>
            <button
              onClick={() => styleReport && setActiveTab('matrix')}
              disabled={!styleReport}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 rounded-lg transition-all ${
                !styleReport
                  ? 'opacity-40 cursor-not-allowed text-slate-600'
                  : activeTab === 'matrix'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>2. Synthesis Matrix</span>
            </button>
            <button
              onClick={() => styleReport && setActiveTab('sandbox')}
              disabled={!styleReport}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 rounded-lg transition-all ${
                !styleReport
                  ? 'opacity-40 cursor-not-allowed text-slate-600'
                  : activeTab === 'sandbox'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>3. Sandbox Arena</span>
            </button>
          </div>

          {/* LOADING STATE - STYLING Blueprint Analysis */}
          {analyzingStyle && (
            <div className="glass-panel p-10 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden h-[400px]">
              <div className="scanline" />
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 animate-pulse pulse-glow">
                <RefreshCw className="animate-spin" size={28} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-indigo-300">Extracting Font DNA...</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Analyzing handwriting curvatures, line junctions, baseline shifts, and crossbar spacing to generate style report.
                </p>
              </div>
            </div>
          )}

          {/* TAB CONTENT: STEP 1: INPUT SAMPLES DRAWING CANVAS */}
          {activeTab === 'input' && !analyzingStyle && (
            <>
              {!compositeImage ? (
                <DrawingCanvas onComplete={handleStyleStitched} />
              ) : (
                <div className="glass-panel p-8 flex flex-col items-center justify-center text-center gap-6 border-indigo-500/10 bg-indigo-500/2">
                  <div className="w-14 h-14 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                    <ShieldCheck size={28} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Visual Blueprint Loaded</h3>
                    <p className="text-xs text-slate-400 mt-1.5 max-w-md">
                      Your drawing guidelines sheet and handwriting traits have been successfully analyzed by VectorFlow AI.
                    </p>
                  </div>
                  
                  {/* Small preview of stitched guide image */}
                  <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40 p-2 max-w-[240px] shadow-lg">
                    <img src={compositeImage} alt="Stitched guide" className="w-full object-contain h-28 rounded-lg" />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleResetWorkspace}
                      className="btn-secondary py-2 px-5 text-xs text-rose-400 border-rose-500/10 hover:bg-rose-500/5 hover:border-rose-500/25"
                    >
                      Draw New Sample
                    </button>
                    <button
                      onClick={() => setActiveTab('matrix')}
                      className="btn-primary py-2 px-5 text-xs"
                    >
                      Advance to Matrix
                      <ChevronRight size={14} className="ml-1" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB CONTENT: STEP 2: GLYPHS SYNTHESIS MATRIX */}
          {activeTab === 'matrix' && !analyzingStyle && styleReport && (
            <>
              {/* Trigger Synthesis control card */}
              <div className="glass-panel p-5 bg-gradient-to-r from-indigo-500/5 via-transparent to-transparent flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 mt-0.5">
                    <Cpu size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Synthesize Vector Font Glyphs</h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-normal max-w-lg">
                      Generate individual SVG vector contours matching your handwriting blueprint. 
                      Uses local API batch pipelines.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {progressMsg && (
                    <span className="text-xs text-teal-400 font-medium font-mono bg-teal-500/5 px-3 py-1.5 rounded-lg border border-teal-500/10 flex items-center gap-1.5 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                      {progressMsg}
                    </span>
                  )}
                  
                  <button
                    onClick={triggerSynthesis}
                    disabled={synthesisActive || targetCharacters.length === 0}
                    className="btn-primary"
                  >
                    {synthesisActive ? (
                      <>
                        <RefreshCw className="animate-spin" size={16} />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Run Vector Synthesis
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Vector Glyphs Grid */}
              <GlyphGrid
                characters={targetCharacters}
                generatedGlyphs={generatedGlyphs}
                generatingCodes={generatingCodes}
                failedCodes={failedCodes}
                onRegenerateGlyph={handleRegenerateSingleGlyph}
                onUpdateGlyphPath={handleUpdateGlyphPath}
              />
            </>
          )}

          {/* TAB CONTENT: STEP 3: SANDBOX PREVIEW & TTF EXPORTER */}
          {activeTab === 'sandbox' && !analyzingStyle && styleReport && (
            <FontSandbox generatedGlyphs={generatedGlyphs} />
          )}

        </main>
      </div>

      {/* FOOTER */}
      <footer className="mt-8 border-t border-white/5 pt-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-4">
        <p>© 2026 VectorFlow. Operates 100% locally client-side via secure BYOK models.</p>
        <div className="flex gap-4 justify-center">
          <a href="https://github.com/google/opentype.js" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
            opentype.js
          </a>
          <span>•</span>
          <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
            Gemini API
          </a>
        </div>
      </footer>

      {/* BYOK MODAL POPUP */}
      <ApiKeyModal
        isOpen={keyModalOpen}
        onClose={() => setKeyModalOpen(false)}
        initialConfig={apiConfig}
        onSave={(cfg) => {
          setApiConfig(cfg);
          setGlobalError('');
        }}
      />

    </div>
  );
}
