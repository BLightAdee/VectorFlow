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
> **Touching & Script Letters Solution (The Coca-Cola Challenge)**
> Logo lettering often touches, overlaps, or uses connected cursive scripts. To solve this, we are implementing two advanced features:
> 1. **Interactive Pixel Scissor Editor (Cutter Modal)**:
>    - Clicking on any crop segment opens an **Interactive Split Editor** modal.
>    - Draws the segment scaled up on a canvas. The user can draw with a **Scissors Tool** (erasing connecting strokes with background color ink) to physically cut the ligature between touching letters.
>    - Clicking "Apply Split" re-runs the connected component slicer *specifically on this cropped segment canvas*, instantly splitting the single blob into multiple perfectly isolated letter segments (e.g. splitting "oca" into "o", "c", and "a").
> 2. **Logo Color Sampler (Eyedropper)**:
>    - Users can click anywhere on the uploaded logo image preview to **sample the target letter color**!
>    - The binarization algorithm will instantly switch to color-distance mode, checking the Euclidean distance of each pixel to the sampled color.
>    - Includes a **Color Tolerance** slider in the UI to dynamically adjust the binarization, perfectly isolating letters from multi-colored, complex, or noisy backgrounds!

> [!NOTE]
> **Typography-Aware Coordinate Normalization**
> Mapped logo characters are automatically normalized into a 1000x1000 coordinate grid. They sit perfectly centered on baseline (Y=800) and scale to cap-height (Y=200), standard lowercase (Y=450), or descender (Y=950) spaces.

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
│   │   ├── SegmentMapper.tsx (Interactive logo letter slicer, color sampler & scissors editor)
│   │   ├── UnicodeSelector.tsx (Unicode block picker)
│   │   ├── GlyphGrid.tsx (Displays vector matrix & detailed SVG coordinate inspector)
│   │   └── FontSandbox.tsx (Interactive typing testing arena & TTF export)
│   ├── utils/
│   │   ├── geminiApi.ts (Logo-aware style extraction & vector synthesis)
│   │   ├── imageSegmenter.ts (Binarization, Color-distance thresholding & BFS)
│   │   ├── svgParser.ts (SVG tokenizer, Y-coordinate flip, curve smoothing)
│   │   └── unicodeBlocks.ts (Unicode blocks ranges & definitions)
```

---

## Component Specifications

### 1. Logo Slicer, Eyedropper & Scissors (`SegmentMapper.tsx` & `imageSegmenter.ts`)
- **Color Eyedropper**: Renders a preview of the main uploaded logo. Clicking on it extracts the `(R, G, B)` value. Sets the binarizer to check color distance instead of raw brightness.
- **Slicing Controls**:
  - **Color Tolerance / Contrast Slider**: Adjusts contrast or color tolerance dynamically.
  - **Slicing Sensitivity Slider**: Sets BFS merge distance threshold.
- **Scissors Editor (Split Modal)**:
  - Renders a modal canvas for cutting connected components.
  - Re-slices the segment locally on edit completion and injects the new sub-segments into the segments list.
- Mapped letters are traced on a 1000x1000 normalized canvas.

### 2. Branding AI Style Report & Generation (`geminiApi.ts`)
- Generates unmapped letters by morphing Roboto templates using the exact vector paths of the mapped logo letters as direct brand style references.

### 3. Font Compiler & Spacing Engine (`svgParser.ts`)
- Flipped Y-coordinates: `fontY = 800 - svgY` for opentype compatibility.
- Estimates advance widths dynamically using character bounding boxes.

---

## Verification Plan

### Manual Verification
1. **Color Eyedropper Test**: Upload a color logo. Click on a colored letter. Verify that the crops instantly update to isolate only that color.
2. **Interactive Scissors Test**: Click on a combined cursive segment (e.g. connected "lo"). Draw a thin cut between "l" and "o". Click Apply Split and confirm it divides into two independent segments.
3. **Auto-Mapping**: Click Auto-Map and check sequential assignments.
4. **Perfect Alignment Sandbox**: Compile the font in the Sandbox tab and type. Confirm that all directly traced and AI-generated glyphs align perfectly on the baseline.
