import React from 'react';
import { UNICODE_BLOCKS } from '../utils/unicodeBlocks';
import { Layers, CheckSquare, Square, Info } from 'lucide-react';

interface UnicodeSelectorProps {
  selectedBlockIds: string[];
  onChange: (ids: string[]) => void;
}

export const UnicodeSelector: React.FC<UnicodeSelectorProps> = ({
  selectedBlockIds,
  onChange,
}) => {
  const handleToggle = (id: string) => {
    if (selectedBlockIds.includes(id)) {
      onChange(selectedBlockIds.filter(blockId => blockId !== id));
    } else {
      onChange([...selectedBlockIds, id]);
    }
  };

  const handleSelectAll = () => {
    onChange(UNICODE_BLOCKS.map(b => b.id));
  };

  const handleClear = () => {
    // Keep at least basic letters
    onChange(['basic-latin-letters']);
  };

  // Calculate total selected characters
  const selectedBlocks = UNICODE_BLOCKS.filter(b => selectedBlockIds.includes(b.id));
  const totalCharacters = selectedBlocks.reduce((acc, block) => acc + block.getCharacters().length, 0);

  return (
    <div className="glass-panel p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-indigo-400" />
          <h3 className="text-md font-semibold text-slate-200">Unicode Blocks</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold bg-indigo-500/5 px-2 py-1 rounded transition-colors"
          >
            All
          </button>
          <button
            onClick={handleClear}
            className="text-[11px] text-slate-400 hover:text-slate-200 font-semibold bg-white/2 px-2 py-1 rounded transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
        {UNICODE_BLOCKS.map((block) => {
          const isSelected = selectedBlockIds.includes(block.id);
          const charsCount = block.getCharacters().length;

          return (
            <div
              key={block.id}
              onClick={() => handleToggle(block.id)}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all duration-200 ${
                isSelected
                  ? 'bg-indigo-500/5 border-indigo-500/30 text-white'
                  : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/2 hover:border-white/10 hover:text-slate-200'
              }`}
            >
              <button className={`mt-0.5 transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`}>
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold font-display">{block.name}</span>
                  <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded-full font-mono font-semibold text-slate-400 border border-white/5">
                    {charsCount} glyphs
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400 font-light">
                  {block.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Target glyph count summary */}
      <div className="flex items-center gap-2.5 bg-indigo-500/5 border border-indigo-500/10 p-3.5 rounded-xl mt-1">
        <Info size={16} className="text-indigo-400 shrink-0" />
        <div className="text-xs flex-1">
          <p className="text-slate-300">
            Target Output Size: <strong className="text-white font-mono font-semibold">{totalCharacters} Glyphs</strong>
          </p>
          <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
            AI compiles glyphs in small parallel batches. Est. time: ~{Math.ceil(totalCharacters / 8) * 10} seconds.
          </p>
        </div>
      </div>
    </div>
  );
};
