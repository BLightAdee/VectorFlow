# Implementation Plan - Logo & Branding Font Creator (BYOK)

An elegant, premium web application that allows users to convert a brand logo, stylized wordmark, or custom lettering image into a fully usable TrueType font (.ttf) using Gemini AI (or OpenAI). It extracts the visual DNA, geometric principles, and styling motifs of the logo letters, and extends them into a complete, cohesive branding font family.

## Visual Design & Theme
- **Theme**: Dark obsidian luxury dashboard (`#0A0A0C` background) with rich indigo (`#4F46E5`), deep violet (`#8B5CF6`), and glowing teal (`#14B8A6`) accents.
- **Vibe**: Elite graphic design studio tool. High-contrast displays, smooth micro-animations, glassmorphic cards, and detailed typographic guides.

---

## User Review Required

> [!IMPORTANT]
> **API Key Safety & Local Storage**
> The application uses a Bring Your Own Key (BYOK) model. The API keys (Gemini / OpenAI) are stored **only** locally in the user's browser `localStorage`. No keys are sent to any external server other than the official AI endpoints.

> [!IMPORTANT]
> **Logo-to-Font Design Pipeline & Pivots**
> Rather than standard handwriting, the application is optimized for **Logo/Graphic Wordmarks**:
> 1. **Logo-Aware Binarization**: Logos often use vibrant color schemes, gradient fills, or dark-on-light configurations. We will implement a dynamic binarization algorithm that automatically extracts high-contrast vector boundaries regardless of logo coloring.
> 2. **Adjustable Extraction Sensitivity**: Logos often have closely spaced or touching characters. We will provide an interactive **Merge Distance** and **Binarization Threshold** slider in the UI, allowing users to tune the slicing engine in real-time to perfectly isolate logo glyphs.
> 3. **Branding Style DNA Extraction**: The AI analysis prompts are rewritten to focus on **brand identity design principles**:
>    - Stroke weight contrast, geometric/optical ratios.
>    - Terminal treatments (serifs, flared, sheared, rounded, blocked).
>    - Internal counters (squarish, circular, triangular).
>    - Specific branding motifs (inline cuts, stencil breaks, futuristic slashes).
> 4. **Typographic Guideline Alignment**: Mapped logo characters are automatically normalized into a 1000x1000 coordinate grid. They sit perfectly centered on baseline (Y=800) and scale to cap-height (Y=200).

> [!NOTE]
> **Dynamic Grid Injection**
> Mapped logo glyphs are traced with `imagetracerjs` and injected directly into the font's character map for 100% exact vector reproduction. For any missing letters, the AI synthesizes them by morphing anatomical template skeletons (Roboto-Regular) using the extracted branding rules and the vector shapes of the mapped logo letters as direct references.

---

## Proposed Architecture & File Structure

The project resides in the `FontCreator` directory with the following structure:

```
FontCreator/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── index.css (Custom styling system, HSL variables, glassmorphism)
│   ├── App.tsx (Main dashboard, state management, flow control)
│   ├── components/
│   │   ├── ApiKeyModal.tsx (BYOK modal)
│   │   ├── DrawingCanvas.tsx (Supports drawing stylized glyphs or uploading logos)
│   │   ├── SegmentMapper.tsx (Interactive logo letter slicer & character mapper)
│   │   ├── UnicodeSelector.tsx (Unicode block picker)
│   │   ├── GlyphGrid.tsx (Displays vector matrix & detailed SVG coordinate inspector)
│   │   └── FontSandbox.tsx (Interactive typing testing arena & TTF export)
│   ├── utils/
│   │   ├── geminiApi.ts (Logo-aware style extraction & vector synthesis)
│   │   ├── imageSegmenter.ts (Binarization & adjustable BFS connected components)
│   │   ├── svgParser.ts (SVG tokenizer, Y-coordinate flip, curve smoothing)
│   │   └── unicodeBlocks.ts (Unicode blocks ranges & definitions)
```

---

## Component Specifications

### 1. Logo Slicer & Mapper (`SegmentMapper.tsx` & `imageSegmenter.ts`)
- Isolates glyphs from the uploaded logo image using BFS.
- **New Feature**: Adds visual sliders for **Slicing Sensitivity** (merge threshold) and **Binarization Contrast** to instantly re-slice complex logos.
- Display crop segments in a grid. Below each segment, a text input lets the user map it to any character (e.g. if the logo has "G", "o", "o", "g", "l", "e", they map those crops to the respective letters).
- Includes **Auto-Map Sequence** to automatically map logo letters in horizontal reading order.
- Applies **Typography-Aware Normalization** to scale and center traced paths onto the 1000x1000 baseline.

### 2. Branding AI Style Report & Generation (`geminiApi.ts`)
- Refines `analyzeFontStyle` to extract branding-focused stylistic features from the logo image.
- Refines `generateGlyphBatch` to synthesize unmapped letters. The prompt instructs the AI to use the exact vector paths of the mapped logo letters as the primary design foundation, copying their stroke thickness, curves, terminal treatments, and decorative cuts to the new letters.

### 3. Font Compiler & Spacing Engine (`svgParser.ts`)
- Flipped Y-coordinates: `fontY = 800 - svgY` for opentype compatibility.
- Estimates advance widths dynamically using character bounding boxes to avoid overlapping text in sandboxes.
- Includes a Bezier smoothing filter to ensure compiled vector paths look clean.

---

## Verification Plan

### Manual Verification
1. **Logo Upload & Real-Time Tuning**: Upload a color logo image. Adjust the **Binarization Contrast** and **Slicing Sensitivity** sliders. Verify that the character crops instantly update and clearly isolate individual stylized letters.
2. **Auto-Mapping Logo Text**: Upload a logo image with letters in order, click Auto-Map, and check if assignments map correctly.
3. **Typography Normalization**: Open a mapped logo letter in the Inspector. Verify that it sits perfectly centered and spans exactly from baseline to cap-height without shifting.
4. **Sandbox Branding Test**: Type word combinations in the Sandbox and check if AI-generated letters match the logo's style (e.g. geometric consistency, terminal finishes).
5. **Install TTF**: Export the `.ttf` font, install it on Windows, and verify it registers as a high-fidelity system font.
