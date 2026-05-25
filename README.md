# VectorFlow — Logo & Branding Font Creator Desktop App

VectorFlow is a premium, AI-powered desktop application built for Windows, macOS, and Linux that lets you transform brand logos, custom lettering, and graphic typography into fully usable, installable TrueType fonts (`.ttf`). 

Using a client-side **Bring Your Own Key (BYOK)** security design, VectorFlow extracts the visual DNA, stroke contrast, serifs, and geometric motifs of isolated brand symbols, letting you vectorize them directly or expand them into a complete typography family using Gemini or OpenAI models.

---

> [!WARNING]
> ### ⚠️ VIBE CODED PROJECT & SUPPORT DISCLAIMER
> **Please Read Before Use:**
> 1. **No Maintenance or Enhancements**: This is a simple, **vibe-coded** project. The creator does **NOT** plan on maintaining, supporting, or enhancing this program in any capacity.
> 2. **No Quality or Integrity Guarantees**: This software is provided "as-is" without any warranties, express or implied. The creator does **NOT** guarantee the absolute integrity, correctness, safety, or functional reliability of the source code or its outputs.
> 3. **Use at Your Own Risk**: Any usage of this software, its local compilers, or its API credentials integration is entirely at your own discretion and risk.

---

## 🚀 Key Features

*   **Desktop Standalone Shell**: Packed with **Electron** for a native desktop application experience on Windows, macOS, and Linux.
*   **Logo Color Eyedropper Sampler**: Click directly on any uploaded colored logo to sample its ink pixel, letting you filter and binarize specific letters dynamically from complex or colorful brand graphics.
*   **Interactive Scissors (Pixel Splicer)**: Use the built-in precision draw tool to cut connecting cursive ligatures and connected script letters (e.g. connected script like Coca-Cola or Kellogg's) into independent mappable letter crops.
*   **Typography-Aware Normalization**: Automatically centers, scales, and aligns your brand crops to standard typographic baselines ($Y=800$), cap-heights ($Y=200$), and descender limits ($Y=950$) inside a $1000 \times 1000$ viewport.
*   **Sequential Auto-Mapper**: Type a character sequence (e.g. `abcdefghijklmnopqrstuvwxyz`) and map a whole isolated sheet of characters sequentially in a single click.
*   **AI Branding Style DNA Synthesis**: Morph pre-spaced, perfect Roboto skeleton templates to inherit your brand's unique terminal cuts, roundness, slant, and stencil features using the AI.

---

## 🛠️ Installation & Setup

Ensure you have **Node.js** (v18+) installed.

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the App in Development Mode (Vite Dev Server + Electron shell)
```bash
npm run electron:dev
```

### 3. Build & Package Standalone Desktop Installers
To build and package the native executables for your current operating system (Windows `.exe`, macOS `.app`, Linux `.deb`):
```bash
npm run electron:build
```
The compiled binaries will be outputted to the `dist_electron/` directory.

---

## 🔒 BYOK Security Design
VectorFlow operates **100% locally client-side**. Your Gemini or OpenAI API keys are stored securely *only* inside your system's browser local storage cache. Keys are never transmitted to any third-party backend servers; they are sent directly to official Google and OpenAI API endpoints.
