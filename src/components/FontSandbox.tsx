import React, { useState, useEffect } from 'react';
import * as opentype from 'opentype.js';
import type { GeneratedGlyph } from '../utils/geminiApi';
import { parseSvgToOpentypePath } from '../utils/svgParser';
import { Download, Type, RefreshCw, Sparkles, Check } from 'lucide-react';

interface FontSandboxProps {
  generatedGlyphs: Record<number, GeneratedGlyph>;
}

const PANGRAMS = [
  { label: 'English Default', text: 'The quick brown fox jumps over the lazy dog. 1234567890!' },
  { label: 'English Pangram', text: 'Pack my box with five dozen liquor jugs.' },
  { label: 'Cyrillic (Russian)', text: 'Съешь же ещё этих мягких французских булок, да выпей чаю.' },
  { label: 'Greek', text: 'Ήλιος, ουρανός, θάλασσα και γαλάζιο φως.' },
  { label: 'Hiragana (Japanese)', text: 'いろはにほへと ちりぬるを わかよたれそ つねならむ' }
];

export const FontSandbox: React.FC<FontSandboxProps> = ({ generatedGlyphs }) => {
  const [familyName, setFamilyName] = useState('MyCustomHand');
  const [styleName, setStyleName] = useState('Regular');
  const [sandboxText, setSandboxText] = useState('The quick brown fox jumps over the lazy dog.');
  const [fontSize, setFontSize] = useState(48);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.4);
  const [fontUrl, setFontUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);

  // Compile the font using opentype.js and register it in the document
  const compileAndLoadFont = () => {
    const glyphCount = Object.keys(generatedGlyphs).length;
    if (glyphCount === 0) return;

    setCompiling(true);

    try {
      // 1. Create the .notdef glyph (required at index 0 by opentype.js)
      const notdefPath = new opentype.Path();
      notdefPath.moveTo(100, 0);
      notdefPath.lineTo(100, 700);
      notdefPath.lineTo(400, 700);
      notdefPath.lineTo(400, 0);
      notdefPath.lineTo(100, 0);
      notdefPath.close();
      
      const notdefGlyph = new opentype.Glyph({
        name: '.notdef',
        unicode: 0,
        xMin: 100,
        yMin: 0,
        xMax: 400,
        yMax: 700,
        advanceWidth: 500,
        path: notdefPath
      });

      // 2. Map all compiled glyphs
      const fontGlyphs = Object.entries(generatedGlyphs).map(([codeStr, g]) => {
        const code = parseInt(codeStr);
        const fontPath = parseSvgToOpentypePath(g.path);
        
        return new opentype.Glyph({
          name: g.char,
          unicode: code,
          advanceWidth: g.width,
          path: fontPath
        });
      });

      // 3. Construct and write the font binary
      const font = new opentype.Font({
        familyName,
        styleName,
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs: [notdefGlyph, ...fontGlyphs]
      });

      const buffer = font.toArrayBuffer();
      const blob = new Blob([buffer], { type: 'font/ttf' });
      const url = URL.createObjectURL(blob);

      // Clean up previous blob URL
      if (fontUrl) {
        URL.revokeObjectURL(fontUrl);
      }

      setFontUrl(url);

      // 4. Inject Dynamic Font Rule into header
      const styleId = 'dynamic-font-generator-style';
      let styleElement = document.getElementById(styleId) as HTMLStyleElement;
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }

      styleElement.innerHTML = `
        @font-face {
          font-family: "${familyName}";
          src: url("${url}") format("truetype");
          font-weight: normal;
          font-style: normal;
        }
      `;

    } catch (err) {
      console.error('Font compilation failed:', err);
    } finally {
      setCompiling(false);
    }
  };

  // Compile automatically when glyph list updates
  useEffect(() => {
    if (Object.keys(generatedGlyphs).length > 0) {
      compileAndLoadFont();
    }
  }, [generatedGlyphs, familyName, styleName]);

  // Clean up Font URL on unmount
  useEffect(() => {
    return () => {
      if (fontUrl) {
        URL.revokeObjectURL(fontUrl);
      }
    };
  }, [fontUrl]);

  const handleDownload = () => {
    if (!fontUrl) return;
    const a = document.createElement('a');
    a.href = fontUrl;
    a.download = `${familyName}-${styleName}.ttf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const glyphCount = Object.keys(generatedGlyphs).length;

  return (
    <div className="glass-panel p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <Type size={18} className="text-indigo-400" />
          <div>
            <h3 className="text-md font-semibold text-slate-200">Export & Live Sandbox</h3>
            <p className="text-xs text-slate-400">Instantly test typing and download TrueType binary</p>
          </div>
        </div>
        <button
          onClick={compileAndLoadFont}
          disabled={glyphCount === 0 || compiling}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 hover:bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
        >
          {compiling ? <RefreshCw className="animate-spin" size={12} /> : <Sparkles size={12} />}
          Compile Font
        </button>
      </div>

      {glyphCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 border border-dashed border-white/5 rounded-xl bg-black/10">
          <p className="text-xs">Font sandbox is offline.</p>
          <p className="text-[10px] text-slate-500 mt-1">Provide sample drawings and trigger synthesis to unlock sandbox.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Metadata forms */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Font Family Name
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="MyCustomFont"
                className="text-input text-xs py-2 bg-black/40 border-white/5"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Font Style Subfamily
              </label>
              <input
                type="text"
                value={styleName}
                onChange={(e) => setStyleName(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="Regular"
                className="text-input text-xs py-2 bg-black/40 border-white/5"
              />
            </div>
          </div>

          {/* Sandbox style settings sliders */}
          <div className="grid grid-cols-3 gap-3 bg-black/30 p-3 rounded-xl border border-white/5 text-xs text-slate-400">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Size ({fontSize}px)</span>
              <input
                type="range"
                min="18"
                max="96"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="accent-indigo-500 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Tracking ({letterSpacing}px)</span>
              <input
                type="range"
                min="-4"
                max="16"
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(parseInt(e.target.value))}
                className="accent-indigo-500 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Height ({lineHeight})</span>
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="accent-indigo-500 cursor-ew-resize h-1 bg-white/10 rounded-lg appearance-none w-full"
              />
            </div>
          </div>

          {/* Pangram presets */}
          <div className="flex flex-wrap gap-1.5">
            {PANGRAMS.map((pangram) => (
              <button
                key={pangram.label}
                onClick={() => setSandboxText(pangram.text)}
                className="text-[10px] bg-white/2 hover:bg-white/5 text-slate-300 py-1 px-2 rounded-full border border-white/5 transition-colors"
              >
                {pangram.label}
              </button>
            ))}
          </div>

          {/* Realtime sandbox typebox */}
          <div className="relative rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
            <textarea
              value={sandboxText}
              onChange={(e) => setSandboxText(e.target.value)}
              placeholder="Type anything here to test your compiled vector font..."
              rows={4}
              className="w-full bg-[#0a0a0c] text-white p-5 border-none outline-none resize-none placeholder-slate-700 leading-relaxed font-light"
              style={{
                fontFamily: fontUrl ? `"${familyName}"` : 'inherit',
                fontSize: `${fontSize}px`,
                letterSpacing: `${letterSpacing}px`,
                lineHeight: lineHeight,
                transition: 'font-size 0.1s ease'
              }}
            />
            {fontUrl && (
              <div className="absolute bottom-3 right-3 bg-teal-500/10 text-teal-400 text-[10px] font-bold px-2 py-0.5 rounded border border-teal-500/20 select-none flex items-center gap-1 leading-normal font-mono">
                <Check size={10} />
                Dynamic font loaded
              </div>
            )}
          </div>

          {/* Download binary */}
          <button
            onClick={handleDownload}
            disabled={!fontUrl}
            className="btn-primary py-3 justify-center text-sm font-semibold tracking-wide w-full"
          >
            <Download size={16} />
            Download {familyName}-{styleName}.ttf
          </button>
        </div>
      )}
    </div>
  );
};
