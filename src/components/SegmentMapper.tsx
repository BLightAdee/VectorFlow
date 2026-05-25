import React, { useState, useEffect } from 'react';
import { extractImageSegments } from '../utils/imageSegmenter';
import type { ImageSegment } from '../utils/imageSegmenter';
// @ts-ignore
import ImageTracer from 'imagetracerjs';
import { 
  Scissors, 
  MapPin, 
  ArrowRight, 
  ShieldAlert, 
  Check, 
  RefreshCw
} from 'lucide-react';

interface SegmentMapperProps {
  uploadedImage: string;
  onComplete: (compositeImage: string, tracedPaths: Record<string, string>) => void;
  onReset: () => void;
}

export const SegmentMapper: React.FC<SegmentMapperProps> = ({
  uploadedImage,
  onComplete,
  onReset,
}) => {
  // Slicing control states
  const [binarizeThreshold, setBinarizeThreshold] = useState(127);
  const [mergeThreshold, setMergeThreshold] = useState(25);
  
  const [segments, setSegments] = useState<ImageSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // Maps character to segment id (e.g. { 'a': 'segment-0' })
  const [autoMapSeq, setAutoMapSeq] = useState('abcdefghijklmnopqrstuvwxyz');
  const [error, setError] = useState('');

  // Extract segments when uploaded image or sliders change
  useEffect(() => {
    const analyzeImage = async () => {
      setLoading(true);
      setError('');
      try {
        const extracted = await extractImageSegments(
          uploadedImage, 
          12, // minSize
          15, // padding
          mergeThreshold, 
          binarizeThreshold
        );
        setSegments(extracted);
        if (extracted.length === 0) {
          setError('No distinct character segments were detected. Adjust the sliders to capture more detail or try a higher-contrast logo image.');
        }
      } catch (err: any) {
        console.error(err);
        setError('Failed to process image segmentation. Ensure the file is a valid PNG or JPG.');
      } finally {
        setLoading(false);
      }
    };

    analyzeImage();
  }, [uploadedImage, binarizeThreshold, mergeThreshold]);

  // Handle assigning a segment to a character
  const handleMap = (char: string, segmentId: string) => {
    if (!char) return;
    
    setMappings(prev => {
      const next = { ...prev };
      
      // Clean up previous mapping for this exact character
      delete next[char];

      // Remove this segment from any other character mapping to preserve 1-to-1
      if (segmentId !== 'unmapped') {
        Object.entries(next).forEach(([c, sId]) => {
          if (sId === segmentId) {
            delete next[c];
          }
        });
        next[char] = segmentId;
      }
      
      return next;
    });
  };

  // Sequential Auto-Mapper
  const handleAutoMap = () => {
    const chars = autoMapSeq.split('').filter(c => c.trim());
    const next: Record<string, string> = {};
    const count = Math.min(segments.length, chars.length);
    
    for (let i = 0; i < count; i++) {
      next[chars[i]] = segments[i].id;
    }
    setMappings(next);
  };

  const handleClearMappings = () => {
    setMappings({});
  };

  // We require at least 1 mapped letter to finalize, but recommend mapping as many as possible
  const mappedCharsCount = Object.keys(mappings).length;
  const isFinalizable = mappedCharsCount > 0;

  // Typography-Aware Coordinate Normalization Tracing
  const normalizeAndTraceSegment = (segment: ImageSegment, char: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Create scanner canvas to detect exact ink bounds
        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = img.width;
        scanCanvas.height = img.height;
        const scanCtx = scanCanvas.getContext('2d');
        if (!scanCtx) {
          resolve('');
          return;
        }
        scanCtx.drawImage(img, 0, 0);

        const imgData = scanCtx.getImageData(0, 0, img.width, img.height);
        const pixels = imgData.data;
        let minX = img.width;
        let maxX = 0;
        let minY = img.height;
        let maxY = 0;
        let hasInk = false;

        // Scan pixels for white ink
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const idx = (y * img.width + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx+1];
            const b = pixels[idx+2];
            const bright = (r + g + b) / 3;
            
            if (bright > 100) { // Ink pixel (white on black)
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              hasInk = true;
            }
          }
        }

        const inkX = hasInk ? minX : 0;
        const inkY = hasInk ? minY : 0;
        const inkW = hasInk ? (maxX - minX + 1) : img.width;
        const inkH = hasInk ? (maxY - minY + 1) : img.height;

        // Classify guidelines for this character
        const ascenders = 'bdfhktl';
        const descenders = 'gjpqy';
        const standardLowercase = 'acenorsuvwxz';
        
        let targetTopY = 200;   // Default (Cap-height)
        let targetBottomY = 800; // Default (Baseline)

        if (char >= 'A' && char <= 'Z') {
          targetTopY = 200;
          targetBottomY = 800;
        } else if (char >= '0' && char <= '9') {
          targetTopY = 200;
          targetBottomY = 800;
        } else if (ascenders.includes(char)) {
          targetTopY = 200;
          targetBottomY = 800;
        } else if (descenders.includes(char)) {
          targetTopY = 450;
          targetBottomY = 950;
        } else if (standardLowercase.includes(char)) {
          targetTopY = 450;
          targetBottomY = 800;
        }

        const targetH = targetBottomY - targetTopY;

        // Compute scaling factor and keep aspect ratio
        const scale = targetH / inkH;
        const scaledW = inkW * scale;

        // Center the character horizontally inside the 1000px box
        const targetX = Math.max(50, (1000 - scaledW) / 2);

        // Render mapped character onto 1000x1000 normalized canvas
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1000;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f0f12'; // Solid dark gray bg
          ctx.fillRect(0, 0, 1000, 1000);

          ctx.drawImage(
            img,
            inkX, inkY, inkW, inkH, // Source bounds
            targetX, targetTopY, scaledW, targetH // Destination bounds
          );

          try {
            // @ts-ignore
            const svgString = ImageTracer.canvasToSVG(canvas, {
              ltres: 1,
              qtres: 1,
              colorsampling: 0,
              numberofcolors: 2,
              minarea: 4
            });
            const match = svgString.match(/d="([^"]+)"/);
            resolve(match ? match[1] : '');
          } catch (e) {
            console.error('Vectorizing segment failed:', e);
            resolve('');
          }
        } else {
          resolve('');
        }
      };
      img.src = segment.dataUrl;
    });
  };

  // Vectorize and submit mapped glyphs
  const handleFinalize = async () => {
    if (!isFinalizable) return;

    setLoading(true);
    try {
      const tracedPaths: Record<string, string> = {};

      // 1. Vectorize and normalize each mapped character
      for (const [char, segmentId] of Object.entries(mappings)) {
        const segment = segments.find(s => s.id === segmentId);
        if (!segment) continue;

        const pathData = await normalizeAndTraceSegment(segment, char);
        if (pathData) {
          tracedPaths[char] = pathData;
        }
      }

      // 2. Generate a single 1200x800 composite canvas containing up to 6 mapped logo letters for AI analysis
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = 1200;
      compositeCanvas.height = 800;
      const cCtx = compositeCanvas.getContext('2d');
      
      if (cCtx) {
        cCtx.fillStyle = '#0f0f12';
        cCtx.fillRect(0, 0, 1200, 800);

        // Sort mapped characters alphabetically to make it highly structured
        const sortedMapped = Object.keys(mappings).sort();
        const firstSix = sortedMapped.slice(0, 6);

        const loadedImages = await Promise.all(
          firstSix.map(char => {
            return new Promise<{ char: string; img: HTMLImageElement | null }>((resolve) => {
              const segmentId = mappings[char];
              const segment = segments.find(s => s.id === segmentId);
              if (!segment) {
                resolve({ char, img: null });
                return;
              }
              const img = new Image();
              img.onload = () => resolve({ char, img });
              img.onerror = () => resolve({ char, img: null });
              img.src = segment.dataUrl;
            });
          })
        );

        loadedImages.forEach((item, idx) => {
          if (!item.img) return;
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const x = col * 400;
          const y = row * 400;

          // Draw cropped segment centered in the grid block
          cCtx.drawImage(item.img, x + 50, y + 50, 300, 300);

          cCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          cCtx.lineWidth = 2;
          cCtx.strokeRect(x, y, 400, 400);

          cCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          cCtx.font = 'bold 16px sans-serif';
          cCtx.fillText(`Branding Anchor: '${item.char}'`, x + 20, y + 36);
        });

        onComplete(compositeCanvas.toDataURL('image/png'), tracedPaths);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to vectorize your logo shapes. Please adjust threshold and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel w-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="p-5 border-b border-white/5 bg-white/2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Scissors size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-md font-bold text-slate-200">Branding Extraction Console</h3>
              <span className="logo-badge px-2 py-0.5 text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/25">LOGO PIVOT</span>
            </div>
            <p className="text-xs text-slate-400">Isolate logo glyphs and map them to standard font characters</p>
          </div>
        </div>

        <button
          onClick={onReset}
          className="btn-secondary py-1.5 px-3 text-xs text-slate-400 border-white/5 hover:text-white"
        >
          Cancel / Upload New Logo
        </button>
      </div>

      {/* Dynamic Slicing Adjustments Panel */}
      <div className="p-4 bg-[#0a0a0d] border-b border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
            <span>Binarization Contrast Threshold ({binarizeThreshold})</span>
            <span className="text-[9px] text-slate-600 lowercase font-mono">Tweak if letters are fuzzy or fading</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="40"
              max="220"
              value={binarizeThreshold}
              onChange={(e) => setBinarizeThreshold(parseInt(e.target.value))}
              className="flex-1 accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
            <span>Slicing Merge Distance ({mergeThreshold}px)</span>
            <span className="text-[9px] text-slate-600 lowercase font-mono">Increase if dots/accents split, decrease if letters touch</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="70"
              value={mergeThreshold}
              onChange={(e) => setMergeThreshold(parseInt(e.target.value))}
              className="flex-1 accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
            />
          </div>
        </div>
      </div>

      {loading && segments.length === 0 ? (
        <div className="p-16 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 pulse-glow">
            <RefreshCw className="animate-spin" size={24} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-indigo-300">Slicing Brand Elements...</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Applying contrast thresholds, isolating graphic shapes, and sorting boundaries.
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 flex flex-col items-center text-center gap-4 min-h-[250px]">
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full">
            <ShieldAlert size={28} />
          </div>
          <div className="max-w-md">
            <h4 className="text-sm font-bold text-slate-200">Processing Blocked</h4>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">{error}</p>
          </div>
          <button onClick={onReset} className="btn-primary py-2 px-5 text-xs mt-2">
            Try a Different Image
          </button>
        </div>
      ) : (
        <div className="p-5 flex flex-col gap-6">
          {/* Mapping Wizard Panel */}
          <div className="glass-panel p-4 bg-indigo-500/2 border-indigo-500/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                <MapPin size={13} />
                <span>Branding Map Console</span>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={autoMapSeq}
                  onChange={(e) => setAutoMapSeq(e.target.value.replace(/\s+/g, ''))}
                  placeholder="abcdefghijklmnopqrstuvwxyz"
                  className="text-[10px] bg-[#0c0c0f] text-slate-300 border border-white/5 rounded px-2 py-1 w-44 font-mono focus:outline-none focus:border-indigo-500/40"
                  title="List of characters to map to the detected segments in order"
                />
                <button 
                  onClick={handleAutoMap}
                  disabled={segments.length === 0}
                  className="text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 font-semibold px-2.5 py-1 rounded border border-indigo-500/20 transition-all"
                >
                  Auto-Map Sequence
                </button>
                {mappedCharsCount > 0 && (
                  <button 
                    onClick={handleClearMappings}
                    className="text-[10px] bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 font-semibold px-2.5 py-1 rounded border border-rose-500/10 transition-all"
                  >
                    Clear Map
                  </button>
                )}
              </div>
            </div>

            {/* Live horizontal mapped character indicators */}
            <div className="flex flex-wrap gap-1.5 min-h-[30px] items-center py-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mr-1">Active Font DNA Map ({mappedCharsCount}):</span>
              {mappedCharsCount === 0 ? (
                <span className="text-[10px] text-slate-500 italic">No letters mapped yet. Map segments below!</span>
              ) : (
                Object.keys(mappings).sort().map(char => (
                  <span 
                    key={char} 
                    className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono font-bold"
                  >
                    '{char}'
                    <button 
                      onClick={() => handleMap(char, 'unmapped')}
                      className="text-rose-400 hover:text-rose-300 font-bold ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="flex justify-between items-center border-t border-white/5 pt-3 mt-1">
              <span className="text-[10px] text-slate-400 font-medium">
                Mapped segments are vector-injected directly. Unmapped letters will be synthesized by AI matching this style.
              </span>
              
              <button
                onClick={handleFinalize}
                disabled={!isFinalizable}
                className="btn-primary py-2 px-5 text-xs font-bold gap-1.5"
              >
                <Check size={14} />
                Vectorize & Compile Logo DNA
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Sliced Segments Visual Grid with local inputs */}
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Scissors size={14} className="text-indigo-400" />
                <span>Isolated Logo/Graphic Segments ({segments.length})</span>
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-3 max-h-[400px] overflow-y-auto pr-1">
              {segments.map((s, idx) => {
                // Find if this segment is already mapped
                const mappedChar = Object.entries(mappings).find(([_, sId]) => sId === s.id)?.[0] || '';

                return (
                  <div
                    key={s.id}
                    className={`group relative rounded-xl border p-3 flex flex-col items-center justify-between gap-2.5 bg-[#0f0f12] overflow-hidden select-none transition-all duration-200 ${
                      mappedChar
                        ? 'border-indigo-500 bg-indigo-500/2 shadow-lg shadow-indigo-500/5'
                        : 'border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="w-full aspect-square max-h-20 bg-black/40 rounded-lg p-1.5 flex items-center justify-center border border-white/5">
                      <img src={s.dataUrl} className="max-w-full max-h-full object-contain rounded" alt={`Block ${idx}`} />
                    </div>
                    
                    <div className="w-full flex flex-col gap-1 items-center">
                      <span className="text-[9px] font-mono text-slate-600">
                        Seg {idx + 1}
                      </span>
                      
                      <div className="flex items-center gap-1.5 w-full mt-0.5">
                        <span className="text-[9px] text-slate-500 font-semibold uppercase">Map:</span>
                        <input
                          type="text"
                          maxLength={1}
                          value={mappedChar}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              handleMap(val, s.id);
                            } else if (mappedChar) {
                              handleMap(mappedChar, 'unmapped');
                            }
                          }}
                          placeholder="char"
                          className="w-full bg-[#050508] border border-white/5 hover:border-white/10 focus:border-indigo-500/40 rounded px-1.5 py-0.5 text-center text-xs font-mono font-bold text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Mapped badge */}
                    {mappedChar && (
                      <div className="absolute top-1.5 right-1.5 bg-indigo-600 text-white text-[10px] font-bold w-4.5 h-4.5 rounded-full border border-indigo-400 flex items-center justify-center shadow-md animate-scale-in">
                        {mappedChar}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
