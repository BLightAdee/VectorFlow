import React, { useRef, useState, useEffect } from 'react';
import { Undo, Trash2, Sliders, Type, Upload, ArrowRight, Palette, Image as ImageIcon } from 'lucide-react';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

interface DrawingCanvasProps {
  onComplete: (compositeImage: string, tracedPaths: Record<string, string>) => void;
}

const SAMPLE_GLYPHS = [
  { char: 'A', desc: 'Uppercase structure, slant, and cap-height', guide: 'A' },
  { char: 'g', desc: 'Lowercase curves, x-height, and descender length', guide: 'g' },
  { char: '5', desc: 'Numeric weight, terminals, and digit spacing', guide: '5' },
  { char: 'R', desc: 'Bowl shape, leg angle, and stroke contrast', guide: 'R' },
  { char: 'e', desc: 'Crossbar width, internal counter loops, curves', guide: 'e' }
];

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onComplete }) => {
  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const [activeGlyphIdx, setActiveGlyphIdx] = useState(0);
  const [brushSize, setBrushSize] = useState(12);
  const [showGuideLetter, setShowGuideLetter] = useState(true);
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [drawings, setDrawings] = useState<string[]>(Array(SAMPLE_GLYPHS.length).fill(''));
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const undoStackRef = useRef<string[][]>(Array(SAMPLE_GLYPHS.length).fill([]).map(() => []));

  const activeGlyph = SAMPLE_GLYPHS[activeGlyphIdx];

  // Set up and load current drawings into canvas when switching active glyph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTab !== 'draw') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw guidelines
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set background to solid dark gray so that lines are pure white on black (better for vector thresholding!)
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If there is a saved drawing for this glyph, draw it
    if (drawings[activeGlyphIdx]) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = drawings[activeGlyphIdx];
    }
  }, [activeGlyphIdx, activeTab]);

  // Handle Drawing Start
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const pos = getEventCoords(e, canvas);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff'; // Pure white ink (contrast with dark bg)
    ctx.lineWidth = brushSize;

    // Push state before draw for undo
    saveToUndo();
  };

  // Handle Drawing
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Stop scrolling on mobile when drawing
    e.preventDefault();

    const pos = getEventCoords(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  // Handle Drawing End
  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    saveCurrentCanvas();
  };

  // Utility to get touch/mouse coordinates relative to canvas
  const getEventCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // Save current canvas content to drawing array
  const saveCurrentCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setDrawings(prev => {
      const copy = [...prev];
      copy[activeGlyphIdx] = dataUrl;
      return copy;
    });
  };

  // Push state to Undo Stack
  const saveToUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    const currentStack = [...undoStackRef.current[activeGlyphIdx]];
    currentStack.push(dataUrl);
    // Limit stack size to 25
    if (currentStack.length > 25) currentStack.shift();
    undoStackRef.current[activeGlyphIdx] = currentStack;
  };

  // Undo Function
  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentStack = undoStackRef.current[activeGlyphIdx];
    if (currentStack.length === 0) return;

    const previousState = currentStack.pop();
    undoStackRef.current[activeGlyphIdx] = currentStack;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (previousState) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        saveCurrentCanvas();
      };
      img.src = previousState;
    } else {
      setDrawings(prev => {
        const copy = [...prev];
        copy[activeGlyphIdx] = '';
        return copy;
      });
    }
  };

  // Clear Current Canvas
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveToUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    setDrawings(prev => {
      const copy = [...prev];
      copy[activeGlyphIdx] = '';
      return copy;
    });
  };

  // Check if all drawings are completed
  const isAllDrawingsDone = drawings.every(d => d !== '');

  // Vectorize and trace user drawings using pure JS ImageTracer
  const traceDrawings = async (): Promise<Record<string, string>> => {
    const traced: Record<string, string> = {};
    
    const traceSingle = (dataUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 400;
          tempCanvas.height = 400;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) {
            resolve('');
            return;
          }
          
          tempCtx.drawImage(img, 0, 0);
          
          try {
            // @ts-ignore
            const svgString = ImageTracer.canvasToSVG(tempCanvas, {
              ltres: 1,
              qtres: 1,
              colorsampling: 0,
              numberofcolors: 2,
              minarea: 4
            });
            const match = svgString.match(/d="([^"]+)"/);
            resolve(match ? match[1] : '');
          } catch (e) {
            console.error('Canvas tracing failed:', e);
            resolve('');
          }
        };
        img.src = dataUrl;
      });
    };

    for (let i = 0; i < SAMPLE_GLYPHS.length; i++) {
      const char = SAMPLE_GLYPHS[i].char;
      if (drawings[i]) {
        traced[char] = await traceSingle(drawings[i]);
      }
    }
    
    return traced;
  };

  // Handle Submit drawn sheet
  const submitDrawnSamples = async () => {
    // 1. Vectorize reference drawings
    const tracedPaths = await traceDrawings();

    // 2. Generate a single composite image compiling all 5 drawings in a beautiful grid sheet
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = 1200;
    compositeCanvas.height = 800;
    const cCtx = compositeCanvas.getContext('2d');
    if (!cCtx) return;

    // Background
    cCtx.fillStyle = '#0f0f12';
    cCtx.fillRect(0, 0, 1200, 800);

    let loadedCount = 0;
    const checkAndComplete = () => {
      loadedCount++;
      if (loadedCount === SAMPLE_GLYPHS.length) {
        onComplete(compositeCanvas.toDataURL('image/png'), tracedPaths);
      }
    };

    drawings.forEach((drawingData, idx) => {
      const img = new Image();
      img.onload = () => {
        // Calculate grid position
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = col * 400;
        const y = row * 400;

        // Draw drawing onto composite canvas
        cCtx.drawImage(img, x, y, 400, 400);

        // Draw dynamic grid lines & text labels for AI context
        cCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        cCtx.lineWidth = 2;
        cCtx.strokeRect(x, y, 400, 400);

        cCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        cCtx.font = 'bold 16px sans-serif';
        cCtx.fillText(`Sample: '${SAMPLE_GLYPHS[idx].char}'`, x + 20, y + 36);

        checkAndComplete();
      };
      img.src = drawingData;
    });
  };

  // Handle Drag/Drop File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const submitUploadedSamples = () => {
    if (uploadedImage) {
      onComplete(uploadedImage, {});
    }
  };

  return (
    <div className="glass-panel w-full flex flex-col overflow-hidden">
      {/* Navigation tabs */}
      <div className="flex border-b border-white/5 bg-white/2">
        <button
          onClick={() => setActiveTab('draw')}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
            activeTab === 'draw'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Palette size={16} />
          Draw Samples
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
            activeTab === 'upload'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ImageIcon size={16} />
          Upload Image Sheet
        </button>
      </div>

      {/* DRAW TAB CONTENT */}
      {activeTab === 'draw' && (
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-md font-semibold text-slate-200 flex items-center justify-between">
              <span>Draw Reference Glyphs</span>
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-medium">
                {drawings.filter(d => d !== '').length} / 5 Drawn
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Draw these 5 key characters so the AI learns your handwriting traits, proportions, and weight.
            </p>
          </div>

          {/* Core sample characters tabs */}
          <div className="grid grid-cols-5 gap-1.5 bg-black/40 p-1 rounded-lg border border-white/5">
            {SAMPLE_GLYPHS.map((glyph, idx) => (
              <button
                key={glyph.char}
                onClick={() => setActiveGlyphIdx(idx)}
                className={`py-2 text-center rounded-md font-display transition-all ${
                  activeGlyphIdx === idx
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                    : drawings[idx]
                    ? 'text-indigo-400 bg-indigo-500/5 font-semibold hover:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {glyph.char}
              </button>
            ))}
          </div>

          <div className="bg-[#0f0f12] rounded-lg p-2 border border-white/5 text-center text-xs text-indigo-300/80 font-medium">
            Active: Draw the <strong className="text-white text-sm bg-white/5 px-2 py-0.5 rounded font-display">'{activeGlyph.char}'</strong> — {activeGlyph.desc}
          </div>

          {/* Interactive Drawing Box */}
          <div className="relative w-full aspect-square max-w-[360px] mx-auto rounded-xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Background Guideline Letters to assist drawing */}
            {showGuideLetter && !drawings[activeGlyphIdx] && (
              <div 
                className="absolute inset-0 flex items-center justify-center text-[220px] font-light select-none font-sans pointer-events-none transform -translate-y-8"
                style={{ color: 'rgba(255, 255, 255, 0.045)' }}
              >
                {activeGlyph.guide}
              </div>
            )}

            {/* Guide line rules */}
            {showGuidelines && (
              <div className="canvas-guidelines">
                <div className="guideline cap"><span>Cap Height (200)</span></div>
                <div className="guideline mean"><span>X-Height (450)</span></div>
                <div className="guideline base"><span>Baseline (800)</span></div>
                <div className="guideline desc"><span>Descender (950)</span></div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            />
          </div>

          {/* Canvas Utilities bar */}
          <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5">
            <div className="flex gap-2">
              <button
                onClick={handleUndo}
                disabled={undoStackRef.current[activeGlyphIdx].length === 0}
                className="btn-secondary p-2 rounded-md hover:bg-white/5"
                title="Undo last stroke"
              >
                <Undo size={14} />
              </button>
              <button
                onClick={handleClear}
                className="btn-secondary p-2 rounded-md text-rose-400 border-rose-500/10 hover:bg-rose-500/5 hover:border-rose-500/30"
                title="Clear current workspace"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Settings panel */}
            <div className="flex gap-2 items-center text-xs">
              <div className="flex items-center gap-1 text-slate-400 mr-2">
                <Sliders size={12} />
                <span>Size:</span>
                <input
                  type="range"
                  min="4"
                  max="24"
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-16 accent-indigo-500 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
                />
                <span className="font-semibold text-slate-300 font-mono w-4 text-right">{brushSize}</span>
              </div>

              <button
                onClick={() => setShowGuideLetter(!showGuideLetter)}
                className={`p-1.5 rounded border transition-colors ${
                  showGuideLetter
                    ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                    : 'border-white/5 text-slate-500'
                }`}
                title="Toggle faint background guide letter"
              >
                <Type size={12} />
              </button>

              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className={`p-1.5 rounded border transition-colors ${
                  showGuidelines
                    ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'
                    : 'border-white/5 text-slate-500'
                }`}
                title="Toggle baseline guidelines"
              >
                <Sliders size={12} className="transform rotate-90" />
              </button>
            </div>
          </div>

          <div className="flex gap-2.5 mt-2 justify-between">
            <button
              onClick={() => {
                const nextIdx = (activeGlyphIdx + 1) % SAMPLE_GLYPHS.length;
                setActiveGlyphIdx(nextIdx);
              }}
              className="btn-secondary text-xs flex-1 justify-center py-2.5"
            >
              Skip / Next Letter
            </button>
            <button
              onClick={submitDrawnSamples}
              disabled={!isAllDrawingsDone}
              className="btn-primary text-xs flex-1 justify-center py-2.5 font-bold"
            >
              Learn Style
              <ArrowRight size={14} className="ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD TAB CONTENT */}
      {activeTab === 'upload' && (
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-md font-semibold text-slate-200">Upload Stylized Sheet</h3>
            <p className="text-xs text-slate-400">
              Already have handwriting samples or a pre-made vector/drawn layout? Upload a high-contrast image showing your glyph designs.
            </p>
          </div>

          {uploadedImage ? (
            <div className="flex flex-col gap-3">
              <div className="relative rounded-xl border border-indigo-500/20 overflow-hidden bg-black/40 p-2">
                <img
                  src={uploadedImage}
                  alt="Uploaded font sheet"
                  className="w-full max-h-[300px] object-contain rounded-lg"
                />
                <button
                  onClick={() => setUploadedImage(null)}
                  className="absolute top-4 right-4 bg-black/75 text-rose-400 p-2 rounded-full border border-white/10 hover:bg-black transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <button
                onClick={submitUploadedSamples}
                className="btn-primary w-full justify-center py-3"
              >
                Analyze Stylized Image
                <ArrowRight size={16} className="ml-2" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-indigo-500/30 hover:bg-indigo-500/2 transition-all p-6 group">
              <div className="flex flex-col items-center justify-center text-center gap-3">
                <div className="p-3 bg-white/2 rounded-full border border-white/5 text-slate-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 transition-all">
                  <Upload size={24} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Click to upload sample image</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG or SVG up to 5MB</p>
                </div>
                <div className="bg-indigo-500/5 px-2.5 py-1 rounded border border-indigo-500/10 text-[10px] text-indigo-400 font-medium tracking-wide">
                  High contrast dark on white / white on dark works best
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
};
