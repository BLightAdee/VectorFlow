export interface StyleReport {
  strokeThickness: string;
  serifType: string;
  slant: string;
  roundness: string;
  description: string;
}

export interface GeneratedGlyph {
  char: string;
  code: number;
  path: string;
  width: number;
}

export type ApiProvider = 'gemini' | 'openai';

interface ApiConfig {
  provider: ApiProvider;
  apiKey: string;
  model: string;
}

/**
 * Parses the base64 part of a Canvas/Image data URL.
 */
function extractBase64Data(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

/**
 * Analyzes the user-provided handwriting / style sample image to produce a style report.
 */
export async function analyzeFontStyle(
  imageSrc: string,
  config: ApiConfig
): Promise<StyleReport> {
  const { provider, apiKey, model } = config;
  const { mimeType, base64 } = extractBase64Data(imageSrc);

  const prompt = `Analyze this brand logo, wordmark, or custom graphic typography sample image. 
Break down its key brand visual DNA, geometric rules, and typography styling motifs so that you can extend this branding style into a complete, cohesive font family.
Provide a JSON object containing the analysis. You must output a valid JSON object matching this TypeScript structure:
{
  "strokeThickness": "thin" | "medium" | "thick" | "bold" | "black",
  "serifType": "sans-serif" | "slab-serif" | "serif" | "display" | "geometric" | "decorative" | "script" | "futuristic" | "stencil",
  "slant": "vertical" | "slanted-right" | "slanted-left",
  "roundness": "sharp-corners" | "chamfered" | "circular" | "organic" | "blocky" | "elliptical" | "normal",
  "description": "2-3 sentences explaining unique graphic design features (e.g., stroke contrast ratios, decorative terminal finishes, inline/stencil cuts, branding geometric motifs)"
}
Return ONLY the raw JSON object. Do not wrap it in markdown code blocks.`;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API returned error code ${response.status}`);
    }

    const resJson = await response.json();
    const textResult = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error('Gemini API returned an empty response.');
    }
    return JSON.parse(textResult.trim()) as StyleReport;
  } else {
    // OpenAI Provider
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageSrc,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI API returned error code ${response.status}`);
    }

    const resJson = await response.json();
    const textResult = resJson.choices?.[0]?.message?.content;
    if (!textResult) {
      throw new Error('OpenAI API returned an empty response.');
    }
    return JSON.parse(textResult.trim()) as StyleReport;
  }
}

/**
 * Generates vector glyphs for a batch of characters based on the reference style.
 */
export async function generateGlyphBatch(
  characters: { char: string; code: number; standardPath?: string; standardWidth?: number }[],
  imageSrc: string,
  styleReport: StyleReport,
  config: ApiConfig,
  tracedPaths: Record<string, string>
): Promise<GeneratedGlyph[]> {
  const { provider, apiKey, model } = config;
  const { mimeType, base64 } = extractBase64Data(imageSrc);

  const prompt = `You are an elite vector graphic designer and master type designer specializing in brand identity.
Your task is to generate beautiful, highly precise, and recognizable SVG outlines for each of the requested characters.
These vector characters must perfectly extend the visual identity, styling rules, and geometric DNA of the brand logo letters (in the image and exact vector paths) and match the provided Style Report.

STYLE REPORT:
- Stroke Thickness: ${styleReport.strokeThickness}
- Serif Type: ${styleReport.serifType}
- Slant: ${styleReport.slant}
- Roundness: ${styleReport.roundness}
- Brand Style Description: ${styleReport.description}

USER'S EXACT TRACED VECTOR LOGO PATHS (USE AS THE MANDATORY BRAND STYLE ANCHORS):
${Object.entries(tracedPaths).map(([char, path]) => `
Character '${char}':
- Mapped Logo Vector Path: "${path}"
`).join('\n')}

REQUESTED CHARACTERS (WITH SKELETON OUTLINES):
${characters.map(c => `
Character '${c.char}' (Unicode decimal: ${c.code}):
- Standard Template Outline Path: "${c.standardPath || 'N/A'}"
- Recommended Advance Width: ${c.standardWidth || 600}
`).join('\n')}

CRITICAL BRANDING VECTOR OUTLINE RULES:

1. DO NOT DRAW SINGLE-STROKE PATHS:
   - Fonts compile paths as filled shapes, not stroked lines! A single stroke line like "M 500 200 L 500 800" will collapse to an invisible glitch.
   - EVERY stem, crossbar, curve, or terminal must be drawn as a closed double-walled boundary shape.
   - Example (Straight Stem): A simple vertical bar 'I' of width 60 must be drawn as a closed rectangle:
     "M 470 200 L 530 200 L 530 800 L 470 800 Z" (This creates a solid 60-pixel thick bar).

2. WINDING RULES FOR HOLES/COUNTERS (CRITICAL FOR A, B, D, O, P, R, a, b, d, o, p, q, etc.):
   - TrueType fonts utilize the Non-Zero Winding rule. To create a hollow hole inside a letter (like inside 'O', 'D', 'A'), you MUST draw the outer contour and inner hole contour in OPPOSITE directions.
   - DRAW OUTER CONTOURS CLOCKWISE (CW).
   - DRAW INNER COUNTERS/HOLES COUNTER-CLOCKWISE (CCW).
   - Example (Letter 'O'):
     Outer circle (Clockwise, top-right-bottom-left): "M 500 200 C 665 200 800 335 800 500 C 800 665 665 800 500 800 C 335 800 200 665 200 500 C 200 335 335 200 500 200 Z"
     Inner hole (Counter-Clockwise, top-left-bottom-right): "M 500 260 C 365 260 260 365 260 500 C 260 635 365 740 500 740 C 635 740 740 635 740 500 C 740 365 635 260 500 260 Z"
     Combined Path (drawn as a single string separated by M): Outer CW path immediately followed by Inner CCW path. This guarantees a perfectly hollow center!

3. USE SMOOTH BEZIER CURVES & BRAND IDENTITY DETAILS:
   - For curved sections (e.g. 'C', 'S', 'G', 'U', lowercase 'a', 'e', 'g', 'o'), use 'C' (cubic bezier) and 'Q' (quadratic bezier) commands with correct control points to draw organic, fluid, and elegant outlines. Do NOT use blocky straight lines to approximate curves!
   - Closely match the logo anchors' design: replicate their specific terminal flares, diagonal cuts, serifs, corners (sharp, beveled, or rounded), inline cuts, or decorative motifs!

4. VIEWPORT & TYPOGRAPHIC GUIDELINES:
   - Grid Coordinates: Draw all paths within a 1000x1000 pixel viewport.
   - X-Axis: 0 (left) to 1000 (right). Center the character horizontally inside this boundary.
   - Y-Axis: 0 (topmost) to 1000 (bottommost).
   - Baseline: Y = 800. The bottom of capital letters and letters without descenders sits exactly on Y = 800.
   - Cap Height: Y = 200. The top of uppercase letters sits exactly on Y = 200.
   - X-Height: Y = 450. The top of standard lowercase letters rests near Y = 450.
   - Descenders: Y = 950. Lowercase descenders ('g', 'p', 'y') extend downwards to near Y = 950.

5. SKELETON OUTLINE MORPHING MANDATE:
   - For each character, you are provided with a pre-spaced "Standard Template Outline Path".
   - Your job is to **morph, skew, thicken, and reshape** this template's coordinates so it adopts the exact visual DNA, terminal treatments, and geometry of the logo letters!
   - By using the template skeleton as your base, the letters are guaranteed to be 100% recognizable and typographically flawless, while perfectly matching the brand logo's visual style.

You must output a valid JSON array of objects. No additional explanation or markdown wraps are allowed.
JSON Output Structure:
[
  {
    "char": "A",
    "code": 65,
    "path": "M 500 200 L 530 200 L 800 800 L 730 800 L 650 600 L 350 600 L 270 800 L 200 800 Z M 500 350 L 390 540 L 610 540 Z",
    "width": 750
  },
  ...
]
Return ONLY the raw JSON array. Do not wrap in markdown or any other tags.`;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API returned error code ${response.status}`);
    }

    const resJson = await response.json();
    const textResult = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error('Gemini API returned an empty response.');
    }
    return JSON.parse(textResult.trim()) as GeneratedGlyph[];
  } else {
    // OpenAI Provider
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageSrc,
              },
            },
          ],
        },
      ],
      temperature: 0.2,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI API returned error code ${response.status}`);
    }

    const resJson = await response.json();
    const textResult = resJson.choices?.[0]?.message?.content;
    if (!textResult) {
      throw new Error('OpenAI API returned an empty response.');
    }
    
    // Sometimes OpenAI wraps the JSON in an object (e.g. { "glyphs": [...] })
    // Let's parse it and make sure we return an array
    const parsed = JSON.parse(textResult.trim());
    if (Array.isArray(parsed)) {
      return parsed as GeneratedGlyph[];
    } else if (parsed.glyphs && Array.isArray(parsed.glyphs)) {
      return parsed.glyphs as GeneratedGlyph[];
    } else if (parsed.characters && Array.isArray(parsed.characters)) {
      return parsed.characters as GeneratedGlyph[];
    } else {
      // Find any array inside the object
      const keys = Object.keys(parsed);
      for (const key of keys) {
        if (Array.isArray(parsed[key])) {
          return parsed[key] as GeneratedGlyph[];
        }
      }
      throw new Error('Could not parse character array from OpenAI response.');
    }
  }
}

/**
 * Fetches the list of models dynamically from the chosen API provider using the provided API Key.
 */
export async function fetchAvailableModels(
  provider: ApiProvider,
  apiKey: string
): Promise<{ id: string; name: string }[]> {
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Gemini models: ${response.status}`);
    }
    const data = await response.json();
    const modelsList = (data.models || [])
      .filter((m: any) => 
        m.supportedGenerationMethods?.includes('generateContent') && 
        (m.name.includes('flash') || m.name.includes('pro'))
      )
      .map((m: any) => {
        const id = m.name.replace(/^models\//, '');
        return {
          id: id,
          name: m.displayName || id,
        };
      });
    
    // Sort so flash models come first and recommended models are visible
    return modelsList.sort((a: any, b: any) => {
      if (a.id.includes('3.5-flash')) return -1;
      if (b.id.includes('3.5-flash')) return 1;
      if (a.id.includes('2.5-flash')) return -1;
      if (b.id.includes('2.5-flash')) return 1;
      return a.id.localeCompare(b.id);
    });
  } else {
    const url = 'https://api.openai.com/v1/models';
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAI models: ${response.status}`);
    }
    const data = await response.json();
    return (data.data || [])
      .filter((m: any) => 
        m.id.startsWith('gpt-4') || 
        m.id.startsWith('o1') || 
        m.id.startsWith('o3') || 
        m.id.startsWith('gpt-3.5')
      )
      .map((m: any) => ({
        id: m.id,
        name: m.id,
      }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
  }
}

