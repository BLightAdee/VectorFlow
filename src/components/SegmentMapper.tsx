import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw,
  Sliders,
  X,
  Droplet
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
  const [mergeThreshold, setMergeThreshold] = useState(15); // Default lower for logos
  
  // Eyedropper / Color sampling state
  const [sampledColor, setSampledColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [colorTolerance, setColorTolerance] = useState(45);
  
  const [segments, setSegments] = useState<ImageSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // Maps character to segment id (e.g. { 'a': 'segment-0' })
  const [autoMapSeq, setAutoMapSeq] = useState('abcdefghijklmnopqrstuvwxyz');
  const [error, setError] = useState('');

  // Scissors / Split Modal state
  const [splittingSegment, setSplittingSegment] = useState<ImageSegment | null>(null);
  const [brushSize, setBrushSize] = useState(8);

  const mainImageRef = useRef<HTMLImageElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // Extract segments when uploaded image, binarize/merge sliders or color sampling parameters change
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
          binarizeThreshold,
          sampledColor || undefined,
          colorTolerance
        );
        setSegments(extracted);
        if (extracted.length === 0) {
          setError('No distinct character segments were detected. Try clicking on a letter in the logo preview below to sample its color, or adjust binarize sliders.');
        }
      } catch (err: any) {
        console.error(err);
        setError('Failed to process image segmentation. Ensure the file is a valid PNG or JPG.');
      } finally {
        setLoading(false);
      }
    };

    analyzeImage();
  }, [uploadedImage, binarizeThreshold, mergeThreshold, sampledColor, colorTolerance]);

  // Handle Logo Eyedropper Color sampling
  const handleLogoClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = mainImageRef.current;
    if (!img) return;

    // Draw image onto temporary canvas to sample pixel color
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    // Get click coordinates relative to rendered image dimensions
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * img.naturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * img.naturalHeight;

    try {
      const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];
      
      setSampledColor({ r, g, b });
      setError('');
    } catch (err) {
      console.warn('Could not sample color from pixel coordinates:', err);
    }
  };

  const handleClearColorFilter = () => {
    setSampledColor(null);
  };

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

  // --- INTERACTIVE PIXEL SCISSORS EDITOR LOGIC ---

  const openSplitModal = (segment: ImageSegment) => {
    setSplittingSegment(segment);
  };

  useEffect(() => {
    if (!splittingSegment) return;
    // Set up canvas when opening split modal
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw background
      ctx.fillStyle = '#0f0f12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw the cropped segment centered with margins
      const scale = Math.min((canvas.width * 0.85) / img.width, (canvas.height * 0.85) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;

      ctx.drawImage(img, x, y, w, h);
    };
    img.src = splittingSegment.dataUrl;
  }, [splittingSegment]);

  const startScissorsDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f0f12'; // Paints the background color to erase/cut connections!
    ctx.lineWidth = brushSize;
  };

  const drawScissorsCut = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopScissorsDraw = () => {
    isDrawingRef.current = false;
  };

  const handleApplySplit = async () => {
    const canvas = modalCanvasRef.current;
    if (!canvas || !splittingSegment) return;

    setLoading(true);
    try {
      const editedDataUrl = canvas.toDataURL('image/png');

      // Re-run component slicer on the edited local canvas
      // Since it's a local edit, binarization is solid black & white, so we use mergeThreshold=2, customThreshold=100
      const subSegments = await extractImageSegments(
        editedDataUrl,
        8, // minSize
        5, // padding
        2, // mergeThreshold (very low to prevent re-merging)
        100 // contrast threshold
      );

      if (subSegments.length > 1) {
        // Successfully split! Replace the old segment with the newly sliced sub-segments
        setSegments(prev => {
          const idx = prev.findIndex(s => s.id === splittingSegment.id);
          if (idx === -1) return prev;

          const updated = [...prev];
          // Assign unique IDs to sub-segments
          const formattedSubSegments = subSegments.map((s, sIdx) => ({
            ...s,
            id: `subsegment-${splittingSegment.id}-${sIdx}`,
            // Map coordinates back roughly
            x: splittingSegment.x + s.x,
            y: splittingSegment.y + s.y
          }));

          updated.splice(idx, 1, ...formattedSubSegments);
          return updated;
        });

        // Clear mappings for the old split character
        setMappings(prev => {
          const next = { ...prev };
          Object.entries(next).forEach(([c, sId]) => {
            if (sId === splittingSegment.id) {
              delete next[c];
            }
          });
          return next;
        });

        setSplittingSegment(null);
      } else {
        alert('Could not find any independent separated blobs. Make sure you draw a complete cut line in black across the connecting letters!');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to split letters. Try drawing thinner or clearer cut lines.');
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
              <span className="logo-badge px-2 py-0.5 text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/25">EYEDROPPER & SCISSORS ACTIVE</span>
            </div>
            <p className="text-xs text-slate-400">Sample logo colors to isolate letters, and use Scissors to split touching/script characters</p>
          </div>
        </div>

        <button
          onClick={onReset}
          className="btn-secondary py-1.5 px-3 text-xs text-slate-400 border-white/5 hover:text-white"
        >
          Cancel / Upload New Logo
        </button>
      </div>

      {/* Uploaded Logo Image Preview panel with interactive Color Eyedropper */}
      <div className="p-4 bg-black/60 border-b border-white/5 flex flex-col md:flex-row gap-5 items-center justify-between">
        <div className="flex flex-col gap-2 flex-1 w-full">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Droplet size={12} className="text-teal-400" />
              <span>Color Filter Sampler (Click logo below to sample letter ink)</span>
            </span>
            {sampledColor && (
              <button
                onClick={handleClearColorFilter}
                className="text-[9px] text-rose-400 hover:text-rose-300 font-bold border border-rose-500/20 bg-rose-500/5 px-2 py-0.5 rounded"
              >
                Clear Color Filter
              </button>
            )}
          </div>
          
          <div className="relative rounded-xl border border-white/5 overflow-hidden max-h-[160px] bg-black/40 flex items-center justify-center p-2 group shadow-inner">
            <img
              ref={mainImageRef}
              src={uploadedImage}
              alt="Logo Eyedropper pad"
              onClick={handleLogoClick}
              className="max-h-[140px] max-w-full object-contain cursor-crosshair rounded border border-white/5 hover:border-indigo-500/35 transition-all"
              title="Click on the logo letter color to isolate it!"
            />
            {sampledColor && (
              <div 
                className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/85 border border-white/10 px-2 py-1 rounded-lg text-[9px] font-mono text-slate-300 shadow-lg"
              >
                <span>Ink Color:</span>
                <div 
                  className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-inner"
                  style={{ backgroundColor: `rgb(${sampledColor.r}, ${sampledColor.g}, ${sampledColor.b})` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Slicing Adjustments Panel */}
        <div className="grid grid-cols-1 gap-4 w-full md:w-80 shrink-0">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
              {sampledColor ? (
                <>
                  <span>Color Matching Tolerance ({colorTolerance})</span>
                  <span className="text-[9px] text-teal-400 lowercase font-mono">Tweak width of matched color</span>
                </>
              ) : (
                <>
                  <span>Binarization Contrast ({binarizeThreshold})</span>
                  <span className="text-[9px] text-slate-600 lowercase font-mono">Tweak if shapes are fading</span>
                </>
              )}
            </label>
            <div className="flex items-center gap-3">
              {sampledColor ? (
                <input
                  type="range"
                  min="15"
                  max="130"
                  value={colorTolerance}
                  onChange={(e) => setColorTolerance(parseInt(e.target.value))}
                  className="flex-1 accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
                />
              ) : (
                <input
                  type="range"
                  min="40"
                  max="220"
                  value={binarizeThreshold}
                  onChange={(e) => setBinarizeThreshold(parseInt(e.target.value))}
                  className="flex-1 accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
              <span>Slicing Sensitivity ({mergeThreshold}px)</span>
              <span className="text-[9px] text-slate-600 lowercase font-mono">Keep low to split overlapping graphics</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="2"
                max="60"
                value={mergeThreshold}
                onChange={(e) => setMergeThreshold(parseInt(e.target.value))}
                className="flex-1 accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
              />
            </div>
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
                    className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-mono font-bold"
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

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3.5 max-h-[400px] overflow-y-auto pr-1">
              {segments.map((s, idx) => {
                // Find if this segment is already mapped
                const mappedChar = Object.entries(mappings).find(([_, sId]) => sId === s.id)?.[0] || '';

                return (
                  <div
                    key={s.id}
                    className={`group relative rounded-xl border p-3 flex flex-col items-center justify-between gap-3 bg-[#0f0f12] overflow-hidden select-none transition-all duration-200 ${
                      mappedChar
                        ? 'border-indigo-500 bg-indigo-500/2 shadow-lg shadow-indigo-500/5'
                        : 'border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="w-full aspect-square max-h-20 bg-black/40 rounded-lg p-1.5 flex items-center justify-center border border-white/5 relative">
                      <img src={s.dataUrl} className="max-w-full max-h-full object-contain rounded" alt={`Block ${idx}`} />
                      
                      {/* Split/Scissors floating trigger */}
                      <button
                        onClick={() => openSplitModal(s)}
                        className="absolute bottom-1 right-1 p-1 bg-black/85 hover:bg-indigo-600 border border-white/5 hover:border-indigo-400 text-slate-400 hover:text-white rounded shadow-md transition-all duration-150"
                        title="Scissors: Draw split lines to separate touching letters!"
                      >
                        <Scissors size={10} />
                      </button>
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

      {/* --- INTERACTIVE PIXEL SCISSORS EDITOR MODAL --- */}
      {splittingSegment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4">
          <div className="glass-panel-glow w-full max-w-md p-5 relative overflow-hidden flex flex-col gap-4 bg-[#0a0a0d] border border-white/10 rounded-2xl">
            <button
              onClick={() => setSplittingSegment(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full border border-white/5 bg-white/2 hover:bg-white/5 transition-colors"
            >
              <X size={16} />
            </button>

            <div>
              <h3 className="text-md font-bold text-slate-200 flex items-center gap-1.5">
                <Scissors size={16} className="text-indigo-400 animate-pulse" />
                <span>Pixel Scissors: Cut Connected Letters</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                Click and drag to draw thin black cut lines. Connect the top and bottom borders of the connecting stroke to split touching cursive or overlapping letters.
              </p>
            </div>

            {/* Interactive Draw Canvas */}
            <div className="relative aspect-square w-full max-w-[320px] mx-auto border border-white/10 rounded-xl bg-[#0f0f12] overflow-hidden shadow-inner">
              <canvas
                ref={modalCanvasRef}
                width={350}
                height={350}
                onMouseDown={startScissorsDraw}
                onMouseMove={drawScissorsCut}
                onMouseUp={stopScissorsDraw}
                onMouseLeave={stopScissorsDraw}
                className="w-full h-full cursor-cell"
              />
            </div>

            {/* Scissor settings */}
            <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-white/5 text-xs">
              <div className="flex items-center gap-1 text-slate-400 flex-1">
                <Sliders size={12} className="text-indigo-400" />
                <span>Scissor Width:</span>
                <input
                  type="range"
                  min="3"
                  max="20"
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-24 accent-indigo-500 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none ml-2"
                />
                <span className="font-mono font-bold text-slate-300 ml-1.5">{brushSize}px</span>
              </div>

              <button
                onClick={() => {
                  // Re-trigger Canvas render to undo edits
                  setSplittingSegment({ ...splittingSegment });
                }}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold"
              >
                Reset Scissor Lines
              </button>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2.5 justify-end border-t border-white/5 pt-3">
              <button
                onClick={() => setSplittingSegment(null)}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySplit}
                className="btn-primary py-1.5 px-4 text-xs font-bold"
              >
                Apply Split Cut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
