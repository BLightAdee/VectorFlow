import React, { useState, useEffect, useRef } from 'react';
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
  Droplet,
  Trash2,
  Maximize2,
  Info
} from 'lucide-react';

interface SegmentMapperProps {
  uploadedImage: string;
  onComplete: (compositeImage: string, tracedPaths: Record<string, string>) => void;
  onReset: () => void;
}

interface CropArea {
  id: string;
  x: number; // Rendered coordinate space x
  y: number; // Rendered coordinate space y
  w: number;
  h: number;
  char: string; // Mapped character
}

export const SegmentMapper: React.FC<SegmentMapperProps> = ({
  uploadedImage,
  onComplete,
  onReset,
}) => {
  // Binarization & Eyedropper state
  const [binarizeThreshold, setBinarizeThreshold] = useState(127);
  const [sampledColor, setSampledColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [colorTolerance, setColorTolerance] = useState(45);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Interactive Custom Bounding Box Cutout state
  const [cropAreas, setCropAreas] = useState<CropArea[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragAction, setDragAction] = useState<'create' | 'move' | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Mapped characters tracking
  const [activeCharInput, setActiveCharInput] = useState('');
  const [autoMapSeq, setAutoMapSeq] = useState('abcdefghijklmnopqrstuvwxyz');

  const handleClearColorFilter = () => {
    setSampledColor(null);
  };

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);

  // Initialize canvas overlay sizing matching image aspect ratio
  useEffect(() => {
    const handleResize = () => {
      const img = imageRef.current;
      const canvas = canvasOverlayRef.current;
      if (!img || !canvas) return;

      canvas.width = img.clientWidth;
      canvas.height = img.clientHeight;
      drawOverlay();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cropAreas, activeAreaId, currentBox]);

  // Redraw the canvas cropper overlay containing crop rectangles and glowing indicators
  const drawOverlay = () => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw a semi-transparent dark shade outside any active crop rectangles
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Helper to clear crop boxes to show logo clearly underneath
    const clearBox = (x: number, y: number, w: number, h: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.restore();
    };

    // Clear current dragging box
    if (currentBox) {
      clearBox(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
    }

    // Clear all completed crop areas
    cropAreas.forEach((area) => {
      clearBox(area.x, area.y, area.w, area.h);
    });

    // 2. Draw borders & glowing labels
    const drawBoxDecorations = (x: number, y: number, w: number, h: number, isActive: boolean, label: string) => {
      ctx.strokeStyle = isActive ? '#14b8a6' : '#6366f1';
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.setLineDash(isActive ? [] : [4, 4]);
      
      // Draw rectangular border
      ctx.strokeRect(x, y, w, h);
      
      // Draw corner grips
      ctx.fillStyle = isActive ? '#14b8a6' : '#6366f1';
      const gripSize = 5;
      ctx.fillRect(x - 2, y - 2, gripSize, gripSize);
      ctx.fillRect(x + w - 2, y - 2, gripSize, gripSize);
      ctx.fillRect(x - 2, y + h - 2, gripSize, gripSize);
      ctx.fillRect(x + w - 2, y + h - 2, gripSize, gripSize);

      // Draw character label bubble above crop box
      if (label) {
        ctx.setLineDash([]);
        ctx.fillStyle = isActive ? 'rgba(20, 184, 166, 0.9)' : 'rgba(99, 102, 241, 0.85)';
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(` '${label}' `).width;
        
        ctx.beginPath();
        ctx.roundRect(x + 4, y - 18, textWidth + 8, 15, 4);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(` '${label}'`, x + 8, y - 6);
      }
    };

    // Draw active drawing box
    if (currentBox) {
      drawBoxDecorations(currentBox.x, currentBox.y, currentBox.w, currentBox.h, true, 'Draft');
    }

    // Draw all saved crop areas
    cropAreas.forEach((area) => {
      drawBoxDecorations(area.x, area.y, area.w, area.h, area.id === activeAreaId, area.char);
    });
  };

  // Re-draw overlay whenever drag properties change
  useEffect(() => {
    drawOverlay();
  }, [cropAreas, activeAreaId, currentBox]);

  // Color Sampler (Eyedropper) click handler
  const handleLogoColorSample = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imageRef.current;
    if (!img) return;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * img.naturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * img.naturalHeight;

    try {
      const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      setSampledColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
      setError('');
    } catch (err) {
      console.warn('Could not extract pixel color metrics:', err);
    }
  };

  // Mouse Interactions inside Custom Cropper
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked inside an existing crop box (to select/move)
    const clickedArea = [...cropAreas].reverse().find(area => 
      x >= area.x && x <= area.x + area.w &&
      y >= area.y && y <= area.y + area.h
    );

    if (clickedArea) {
      setActiveAreaId(clickedArea.id);
      setActiveCharInput(clickedArea.char);
      setDragStart({ x: x - clickedArea.x, y: y - clickedArea.y }); // Store offset inside box
      setDragAction('move');
    } else {
      // Draw a new bounding box
      setActiveAreaId(null);
      setActiveCharInput('');
      setDragStart({ x, y });
      setDragAction('create');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart || !dragAction) return;

    const canvas = canvasOverlayRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    if (dragAction === 'create') {
      const boxX = Math.min(dragStart.x, x);
      const boxY = Math.min(dragStart.y, y);
      const boxW = Math.abs(dragStart.x - x);
      const boxH = Math.abs(dragStart.y - y);

      if (boxW > 5 && boxH > 5) {
        setCurrentBox({ x: boxX, y: boxY, w: boxW, h: boxH });
      }
    } else if (dragAction === 'move' && activeAreaId) {
      setCropAreas(prev => prev.map(area => {
        if (area.id !== activeAreaId) return area;
        
        // Calculate new X/Y based on mouse drag offset, constrained inside canvas boundaries
        const newX = Math.max(0, Math.min(canvas.width - area.w, x - dragStart.x));
        const newY = Math.max(0, Math.min(canvas.height - area.h, y - dragStart.y));
        return { ...area, x: newX, y: newY };
      }));
    }
  };

  const handleMouseUp = () => {
    if (dragAction === 'create' && currentBox) {
      // Add new crop area
      const newId = `crop-${Date.now()}`;
      const newArea: CropArea = {
        id: newId,
        x: currentBox.x,
        y: currentBox.y,
        w: currentBox.w,
        h: currentBox.h,
        char: '', // Unassigned initially
      };
      
      setCropAreas(prev => [...prev, newArea]);
      setActiveAreaId(newId);
      setActiveCharInput('');
      setCurrentBox(null);
    }
    
    setDragStart(null);
    setDragAction(null);
  };

  // Helper to map active crop selection to a key
  const handleSaveMapping = (char: string) => {
    if (!activeAreaId) return;
    const cleanChar = char.trim().charAt(0);
    
    setCropAreas(prev => prev.map(area => {
      if (area.id !== activeAreaId) return area;
      return { ...area, char: cleanChar };
    }));
    
    setActiveCharInput(cleanChar);
  };

  // Remove a crop selection
  const handleDeleteArea = (id: string) => {
    setCropAreas(prev => prev.filter(area => area.id !== id));
    if (activeAreaId === id) {
      setActiveAreaId(null);
      setActiveCharInput('');
    }
  };

  // Auto-Map sequential alphabet onto current crops (ordered left-to-right)
  const handleAutoMapCrops = () => {
    const chars = autoMapSeq.split('').filter((c: string) => c.trim());
    
    // Sort crop areas left-to-right (horizontal sequence)
    const sortedCrops = [...cropAreas].sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y);
      if (yDiff > 60) return a.y - b.y; // Sort by row first
      return a.x - b.x;
    });

    const count = Math.min(sortedCrops.length, chars.length);
    setCropAreas(prev => prev.map(area => {
      const idx = sortedCrops.findIndex(c => c.id === area.id);
      if (idx !== -1 && idx < count) {
        return { ...area, char: chars[idx] };
      }
      return area;
    }));
  };

  // Trigger high-res canvas cropping, binarization, typography-normalization, and tracing
  const handleFinalize = async () => {
    const img = imageRef.current;
    if (!img || cropAreas.length === 0) return;

    setLoading(true);
    try {
      const tracedPaths: Record<string, string> = {};

      const renderedW = img.clientWidth;
      const renderedH = img.clientHeight;
      const scaleX = img.naturalWidth / renderedW;
      const scaleY = img.naturalHeight / renderedH;

      // Filter and only vectorize fully mapped crops
      const mappedCrops = cropAreas.filter(c => c.char);

      for (const area of mappedCrops) {
        // Translate rendered coords back to natural high-res coordinates
        const origX = Math.max(0, Math.floor(area.x * scaleX));
        const origY = Math.max(0, Math.floor(area.y * scaleY));
        const origW = Math.min(img.naturalWidth - origX, Math.ceil(area.w * scaleX));
        const origH = Math.min(img.naturalHeight - origY, Math.ceil(area.h * scaleY));

        if (origW < 8 || origH < 8) continue;

        // Perform high-res crop on temporary canvas
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = origW;
        cropCanvas.height = origH;
        const cropCtx = cropCanvas.getContext('2d');
        
        if (cropCtx) {
          // 1. Draw raw high-res crop
          cropCtx.drawImage(img, origX, origY, origW, origH, 0, 0, origW, origH);
          
          // 2. Perform color-tolerance or default-contrast binarization
          const cropImgData = cropCtx.getImageData(0, 0, origW, origH);
          const cropPixels = cropImgData.data;
          
          for (let i = 0; i < cropPixels.length; i += 4) {
            const r = cropPixels[i];
            const g = cropPixels[i+1];
            const b = cropPixels[i+2];
            
            if (sampledColor) {
              const dist = Math.sqrt(
                Math.pow(r - sampledColor.r, 2) +
                Math.pow(g - sampledColor.g, 2) +
                Math.pow(b - sampledColor.b, 2)
              );
              if (dist < colorTolerance) {
                // Ink matches sampled letter color
                cropPixels[i] = 255;
                cropPixels[i+1] = 255;
                cropPixels[i+2] = 255;
              } else {
                // Background
                cropPixels[i] = 15;
                cropPixels[i+1] = 15;
                cropPixels[i+2] = 18;
              }
            } else {
              const bright = (r + g + b) / 3;
              // Guess background: border pixels are typically light/paper
              if (bright < binarizeThreshold) {
                // Dark ink -> white on black
                cropPixels[i] = 255;
                cropPixels[i+1] = 255;
                cropPixels[i+2] = 255;
              } else {
                cropPixels[i] = 15;
                cropPixels[i+1] = 15;
                cropPixels[i+2] = 18;
              }
            }
          }
          cropCtx.putImageData(cropImgData, 0, 0);

          // 3. Scan binarized canvas for exact ink bounding bounds
          const binarizedImg = new Image();
          await new Promise<void>((resolveImg) => {
            binarizedImg.onload = () => resolveImg();
            binarizedImg.src = cropCanvas.toDataURL('image/png');
          });

          // Scan coordinates for exact ink bounds
          let minX = origW;
          let maxX = 0;
          let minY = origH;
          let maxY = 0;
          let hasInk = false;

          const scanImgData = cropCtx.getImageData(0, 0, origW, origH);
          const scanPixels = scanImgData.data;

          for (let y = 0; y < origH; y++) {
            for (let x = 0; x < origW; x++) {
              const idx = (y * origW + x) * 4;
              if (scanPixels[idx] > 127) { // Ink pixel
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
          const inkW = hasInk ? (maxX - minX + 1) : origW;
          const inkH = hasInk ? (maxY - minY + 1) : origH;

          // 4. Classify character guidelines
          const ascenders = 'bdfhktl';
          const descenders = 'gjpqy';
          const standardLowercase = 'acenorsuvwxz';
          
          let targetTopY = 200;
          let targetBottomY = 800;

          const char = area.char;

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

          // Uniform scale preservation
          const scale = targetH / inkH;
          const scaledW = inkW * scale;

          // Center horizontally in 1000px viewport
          const targetX = Math.max(50, (1000 - scaledW) / 2);

          // 5. Draw transformed character onto 1000x1000 canvas and trace
          const traceCanvas = document.createElement('canvas');
          traceCanvas.width = 1000;
          traceCanvas.height = 1000;
          const tCtx = traceCanvas.getContext('2d');
          
          if (tCtx) {
            tCtx.fillStyle = '#0f0f12';
            tCtx.fillRect(0, 0, 1000, 1000);

            tCtx.drawImage(
              binarizedImg,
              inkX, inkY, inkW, inkH, // Source rectangle
              targetX, targetTopY, scaledW, targetH // Destination bounds
            );

            try {
              // @ts-ignore
              const svgString = ImageTracer.canvasToSVG(traceCanvas, {
                ltres: 1,
                qtres: 1,
                colorsampling: 0,
                numberofcolors: 2,
                minarea: 4
              });
              const match = svgString.match(/d="([^"]+)"/);
              if (match && match[1]) {
                tracedPaths[char] = match[1];
              }
            } catch (e) {
              console.error(`Vectorizing segment failed for char '${char}':`, e);
            }
          }
        }
      }

      // 6. Generate 1200x800 composite canvas containing up to 6 crops for AIDNA reporting
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = 1200;
      compositeCanvas.height = 800;
      const cCtx = compositeCanvas.getContext('2d');

      if (cCtx) {
        cCtx.fillStyle = '#0f0f12';
        cCtx.fillRect(0, 0, 1200, 800);

        const activeCrops = cropAreas.filter(c => c.char).slice(0, 6);
        
        const loadedCrops = await Promise.all(
          activeCrops.map(crop => {
            return new Promise<{ char: string; dataUrl: string }>((resolve) => {
              // Crop segment again dynamically
              const cX = Math.max(0, Math.floor(crop.x * scaleX));
              const cY = Math.max(0, Math.floor(crop.y * scaleY));
              const cW = Math.min(img.naturalWidth - cX, Math.ceil(crop.w * scaleX));
              const cH = Math.min(img.naturalHeight - cY, Math.ceil(crop.h * scaleY));

              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = cW;
              tempCanvas.height = cH;
              const tempCtx = tempCanvas.getContext('2d');
              
              if (tempCtx) {
                tempCtx.drawImage(img, cX, cY, cW, cH, 0, 0, cW, cH);
                resolve({ char: crop.char, dataUrl: tempCanvas.toDataURL() });
              } else {
                resolve({ char: crop.char, dataUrl: '' });
              }
            });
          })
        );

        const loadedImages = await Promise.all(
          loadedCrops.map(c => {
            return new Promise<{ char: string; img: HTMLImageElement | null }>((resolve) => {
              if (!c.dataUrl) {
                resolve({ char: c.char, img: null });
                return;
              }
              const tempImg = new Image();
              tempImg.onload = () => resolve({ char: c.char, img: tempImg });
              tempImg.onerror = () => resolve({ char: c.char, img: null });
              tempImg.src = c.dataUrl;
            });
          })
        );

        loadedImages.forEach((item, idx) => {
          if (!item.img) return;
          const col = idx % 3;
          const row = Math.floor(idx / 3);
          const x = col * 400;
          const y = row * 400;

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
      setError('Failed to trace your customized crop boxes. Please try re-selecting boundaries.');
    } finally {
      setLoading(false);
    }
  };

  // Adjust canvas dimensions when image finishes loading
  const handleImageLoaded = () => {
    const img = imageRef.current;
    const canvas = canvasOverlayRef.current;
    if (!img || !canvas) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    drawOverlay();
  };

  const selectedArea = cropAreas.find(c => c.id === activeAreaId);
  const mappedCropsCount = cropAreas.filter(c => c.char).length;
  const isFinalizable = mappedCropsCount > 0;

  return (
    <div className="glass-panel w-full flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="p-5 border-b border-white/5 bg-white/2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <Scissors size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-md font-bold text-slate-200">Manual Branding Cutout Studio</h3>
              <span className="logo-badge px-2 py-0.5 text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 font-bold">Manual Bounding-Box</span>
            </div>
            <p className="text-xs text-slate-400">Drag rectangles directly over the logo below to cut out and assign letters manually</p>
          </div>
        </div>

        <button
          onClick={onReset}
          className="btn-secondary py-1.5 px-3 text-xs text-slate-400 border-white/5 hover:text-white"
        >
          Cancel / Upload New Logo
        </button>
      </div>

      {/* Slicing Controls & Color Sampler Dashboard */}
      <div className="p-4 bg-black/60 border-b border-white/5 grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
        {/* Eyedropper / Color Sampler display */}
        <div className="flex flex-col gap-1.5 col-span-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Droplet size={12} className="text-teal-400" />
              <span>Eyedropper Ink Filter</span>
            </span>
            {sampledColor && (
              <button 
                onClick={handleClearColorFilter}
                className="text-[8px] text-rose-400 hover:text-rose-300 font-bold border border-rose-500/20 bg-rose-500/5 px-1.5 py-0.5 rounded transition-all"
              >
                Reset Filter
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 bg-[#0c0c0f] border border-white/5 rounded-lg p-2 min-h-[38px] text-[10px] text-slate-400">
            {sampledColor ? (
              <>
                <span>Active Target Color:</span>
                <div 
                  className="w-4 h-4 rounded-full border border-white/20 shadow-inner"
                  style={{ backgroundColor: `rgb(${sampledColor.r}, ${sampledColor.g}, ${sampledColor.b})` }}
                />
                <span className="font-mono text-slate-500 font-semibold">rgb({sampledColor.r},{sampledColor.g},{sampledColor.b})</span>
              </>
            ) : (
              <span className="italic text-slate-500 flex items-center gap-1">
                <Info size={11} />
                Click directly on letters inside the logo preview below to sample ink color
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Tolerance or Contrast Slider */}
        <div className="flex flex-col gap-1 col-span-1 w-full">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
            {sampledColor ? (
              <>
                <span>Color Tolerance ({colorTolerance})</span>
                <span className="text-[9px] text-teal-400 font-mono">Tweak width of matched color</span>
              </>
            ) : (
              <>
                <span>Binarization Contrast Threshold ({binarizeThreshold})</span>
                <span className="text-[9px] text-slate-600 font-mono">Tweak if letter shapes fade</span>
              </>
            )}
          </label>
          <div className="flex items-center mt-1">
            {sampledColor ? (
              <input
                type="range"
                min="15"
                max="135"
                value={colorTolerance}
                onChange={(e) => setColorTolerance(parseInt(e.target.value))}
                className="w-full accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
              />
            ) : (
              <input
                type="range"
                min="40"
                max="220"
                value={binarizeThreshold}
                onChange={(e) => setBinarizeThreshold(parseInt(e.target.value))}
                className="w-full accent-teal-400 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none"
              />
            )}
          </div>
        </div>

        {/* Global information statistics */}
        <div className="flex flex-col gap-1.5 col-span-1 border-t lg:border-t-0 lg:border-l border-white/5 pt-3.5 lg:pt-0 lg:pl-5 text-xs text-slate-400">
          <div className="flex justify-between items-center">
            <span>Cutout Rectangles:</span>
            <span className="font-mono text-slate-200 font-bold bg-white/5 px-2 py-0.5 rounded">{cropAreas.length} Drawn</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span>Successfully Mapped:</span>
            <span className="font-mono text-teal-400 font-bold bg-teal-500/5 px-2 py-0.5 rounded border border-teal-500/10">{mappedCropsCount} Anchors</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center text-center gap-4 min-h-[350px]">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 pulse-glow">
            <RefreshCw className="animate-spin" size={24} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-indigo-300">Extracting Logo Vectors...</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Vectorizing bounding crop rectangles, applying typography guidelines, and exporting SVG contours.
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-8 flex flex-col items-center text-center gap-4 min-h-[250px]">
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full">
            <ShieldAlert size={28} />
          </div>
          <div className="max-w-md">
            <h4 className="text-sm font-bold text-slate-200">Tracing Blocked</h4>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">{error}</p>
          </div>
          <button onClick={onReset} className="btn-primary py-2 px-5 text-xs mt-2">
            Try a Different Image
          </button>
        </div>
      ) : (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT/CENTER: INTERACTIVE CROP BOARD (Large Canvas Area) */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Maximize2 size={12} className="text-indigo-400" />
              <span>Interactive Logo Canvas (Click and drag box over letters)</span>
            </span>

            <div 
              ref={imageContainerRef}
              className="relative w-full border border-white/10 rounded-2xl overflow-hidden bg-black/60 shadow-2xl flex items-center justify-center"
              style={{ minHeight: '350px' }}
            >
              <img
                ref={imageRef}
                src={uploadedImage}
                alt="Main logo cropper board"
                onLoad={handleImageLoaded}
                onClick={handleLogoColorSample}
                className="w-full max-h-[500px] object-contain rounded-xl select-none pointer-events-none"
              />

              <canvas
                ref={canvasOverlayRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="absolute top-0 left-0 w-full h-full cursor-crosshair z-20"
              />
            </div>

            <p className="text-[10px] text-slate-500 italic text-center">
              💡 Tips: Drag empty spaces to draw a box around any letter. Drag inside existing boxes to move them.
            </p>
          </div>

          {/* RIGHT: MAP SIDEBAR (Dashboard console) */}
          <div className="flex flex-col gap-4">
            {/* Save/Edit active selection panel */}
            <div className="glass-panel p-4 bg-indigo-500/2 border-indigo-500/10 flex flex-col gap-3.5">
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                <MapPin size={13} />
                <span>Selected Cutout Mapping</span>
              </div>

              {selectedArea ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 text-[11px] text-slate-400">
                    <span>Active Box ID:</span>
                    <span className="font-mono text-slate-200">{selectedArea.id.substring(0, 12)}...</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Map to Key:</label>
                    <input
                      type="text"
                      maxLength={1}
                      value={activeCharInput}
                      onChange={(e) => handleSaveMapping(e.target.value)}
                      placeholder="e.g. C"
                      className="flex-1 bg-[#0a0a0d] border border-white/5 focus:border-indigo-500/40 rounded px-2.5 py-1.5 text-center text-sm font-mono font-bold text-white focus:outline-none uppercase"
                    />
                  </div>

                  <button
                    onClick={() => handleDeleteArea(selectedArea.id)}
                    className="btn-secondary py-1.5 justify-center text-xs text-rose-400 border-rose-500/10 hover:bg-rose-500/5 hover:border-rose-500/25 mt-1"
                  >
                    <Trash2 size={13} />
                    Delete Bounding Box
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs italic">
                  Draw or select a bounding box on the logo canvas to assign a character mapping here.
                </div>
              )}
            </div>

            {/* Sequential Auto-Mapping console card */}
            <div className="glass-panel p-4 bg-black/40 border-white/5 flex flex-col gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sliders size={12} className="text-teal-400" />
                <span>Auto-Map Crop Sequence</span>
              </span>

              <div className="flex flex-col gap-2.5">
                <input
                  type="text"
                  value={autoMapSeq}
                  onChange={(e) => setAutoMapSeq(e.target.value.replace(/\s+/g, ''))}
                  placeholder="abcdefghijklmnopqrstuvwxyz"
                  className="text-xs bg-[#0c0c0f] text-slate-300 border border-white/5 rounded-lg px-2.5 py-2 w-full font-mono focus:outline-none focus:border-indigo-500/40 text-center"
                />
                <button
                  onClick={handleAutoMapCrops}
                  disabled={cropAreas.length === 0}
                  className="btn-teal py-2 text-xs w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  Sequential Auto-Map Crops
                </button>
              </div>
            </div>

            {/* List of current crops */}
            <div className="flex flex-col gap-2.5 flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Current Bounding Boxes ({cropAreas.length})
              </span>

              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1 border border-white/5 rounded-xl bg-black/20 p-2 shadow-inner">
                {cropAreas.length === 0 ? (
                  <span className="text-[10px] text-slate-600 italic text-center py-4">No crop areas drawn yet.</span>
                ) : (
                  cropAreas.map((area) => (
                    <div
                      key={area.id}
                      onClick={() => {
                        setActiveAreaId(area.id);
                        setActiveCharInput(area.char);
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer select-none transition-all ${
                        area.id === activeAreaId
                          ? 'border-indigo-500 bg-indigo-500/5 shadow-md'
                          : 'border-white/5 hover:border-white/10 bg-black/40 hover:bg-black/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center font-mono">
                          {area.char ? area.char : '?'}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Box ({Math.floor(area.w)}×{Math.floor(area.h)})
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteArea(area.id);
                        }}
                        className="text-slate-600 hover:text-rose-400 p-1 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Synthesize Vector Font control button */}
            <button
              onClick={handleFinalize}
              disabled={!isFinalizable}
              className="btn-primary py-3 justify-center text-xs font-bold w-full mt-auto shadow-lg shadow-indigo-600/15"
            >
              <Check size={14} />
              Compile Logo DNA
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
