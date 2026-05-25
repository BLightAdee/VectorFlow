import * as opentype from 'opentype.js';

interface PathCommand {
  type: string;
  args: number[];
}

/**
 * Tokenizes an SVG path 'd' string into commands and coordinates.
 */
function tokenizeSvgPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  // Regex to match letters (commands) or numbers (including negatives, decimals, scientific notation)
  const regex = /([a-df-z])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/gi;
  let match;
  let currentCmd: string | null = null;
  let currentArgs: number[] = [];

  while ((match = regex.exec(d)) !== null) {
    if (match[1]) {
      // It's a command
      if (currentCmd) {
        commands.push({ type: currentCmd, args: currentArgs });
      }
      currentCmd = match[1];
      currentArgs = [];
    } else if (match[2]) {
      // It's a coordinate/number
      currentArgs.push(parseFloat(match[2]));
    }
  }
  if (currentCmd) {
    commands.push({ type: currentCmd, args: currentArgs });
  }
  return commands;
}

/**
 * Parses an SVG path string 'd' and populates an opentype.Path.
 * Flipped Y coordinates to map SVG (Y points down, 800 is baseline)
 * to Font Space (Y points up, 0 is baseline).
 */
export function parseSvgToOpentypePath(d: string, baselineY = 800): opentype.Path {
  const path = new opentype.Path();
  const tokens = tokenizeSvgPath(d);

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  
  // Keep track of the last control point for smooth curves (S/s, T/t)
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommandType = '';

  for (const token of tokens) {
    const cmd = token.type;
    const args = token.args;
    let argIdx = 0;

    const transformY = (y: number) => baselineY - y;

    switch (cmd) {
      case 'M': // Absolute MoveTo
        while (argIdx < args.length) {
          curX = args[argIdx++];
          curY = args[argIdx++];
          path.moveTo(curX, transformY(curY));
          startX = curX;
          startY = curY;
          // For first command or multiple M commands, the first acts as a moveTo
        }
        break;
      case 'm': // Relative MoveTo
        while (argIdx < args.length) {
          curX += args[argIdx++];
          curY += args[argIdx++];
          path.moveTo(curX, transformY(curY));
          startX = curX;
          startY = curY;
        }
        break;

      case 'L': // Absolute LineTo
        while (argIdx < args.length) {
          curX = args[argIdx++];
          curY = args[argIdx++];
          path.lineTo(curX, transformY(curY));
        }
        break;
      case 'l': // Relative LineTo
        while (argIdx < args.length) {
          curX += args[argIdx++];
          curY += args[argIdx++];
          path.lineTo(curX, transformY(curY));
        }
        break;

      case 'H': // Absolute Horizontal LineTo
        while (argIdx < args.length) {
          curX = args[argIdx++];
          path.lineTo(curX, transformY(curY));
        }
        break;
      case 'h': // Relative Horizontal LineTo
        while (argIdx < args.length) {
          curX += args[argIdx++];
          path.lineTo(curX, transformY(curY));
        }
        break;

      case 'V': // Absolute Vertical LineTo
        while (argIdx < args.length) {
          curY = args[argIdx++];
          path.lineTo(curX, transformY(curY));
        }
        break;
      case 'v': // Relative Vertical LineTo
        while (argIdx < args.length) {
          curY += args[argIdx++];
          path.lineTo(curX, transformY(curY));
        }
        break;

      case 'C': // Absolute Cubic Bezier: C x1 y1, x2 y2, x y
        while (argIdx < args.length) {
          const x1 = args[argIdx++];
          const y1 = args[argIdx++];
          const x2 = args[argIdx++];
          const y2 = args[argIdx++];
          curX = args[argIdx++];
          curY = args[argIdx++];
          path.curveTo(x1, transformY(y1), x2, transformY(y2), curX, transformY(curY));
          lastControlX = x2;
          lastControlY = y2;
        }
        break;
      case 'c': // Relative Cubic Bezier
        while (argIdx < args.length) {
          const x1 = curX + args[argIdx++];
          const y1 = curY + args[argIdx++];
          const x2 = curX + args[argIdx++];
          const y2 = curY + args[argIdx++];
          curX += args[argIdx++];
          curY += args[argIdx++];
          path.curveTo(x1, transformY(y1), x2, transformY(y2), curX, transformY(curY));
          lastControlX = x2;
          lastControlY = y2;
        }
        break;

      case 'S': // Absolute Smooth Cubic Bezier: S x2 y2, x y
        while (argIdx < args.length) {
          const x2 = args[argIdx++];
          const y2 = args[argIdx++];
          curX = args[argIdx++];
          curY = args[argIdx++];
          
          let x1 = curX;
          let y1 = curY;
          if (['C', 'c', 'S', 's'].includes(lastCommandType)) {
            x1 = 2 * curX - lastControlX;
            y1 = 2 * curY - lastControlY;
          }
          
          path.curveTo(x1, transformY(y1), x2, transformY(y2), curX, transformY(curY));
          lastControlX = x2;
          lastControlY = y2;
        }
        break;
      case 's': // Relative Smooth Cubic Bezier
        while (argIdx < args.length) {
          const x2 = curX + args[argIdx++];
          const y2 = curY + args[argIdx++];
          const nextX = curX + args[argIdx++];
          const nextY = curY + args[argIdx++];
          
          let x1 = curX;
          let y1 = curY;
          if (['C', 'c', 'S', 's'].includes(lastCommandType)) {
            x1 = 2 * curX - lastControlX;
            y1 = 2 * curY - lastControlY;
          }
          
          curX = nextX;
          curY = nextY;
          path.curveTo(x1, transformY(y1), x2, transformY(y2), curX, transformY(curY));
          lastControlX = x2;
          lastControlY = y2;
        }
        break;

      case 'Q': // Absolute Quadratic Bezier: Q x1 y1, x y
        while (argIdx < args.length) {
          const x1 = args[argIdx++];
          const y1 = args[argIdx++];
          curX = args[argIdx++];
          curY = args[argIdx++];
          path.quadraticCurveTo(x1, transformY(y1), curX, transformY(curY));
          lastControlX = x1;
          lastControlY = y1;
        }
        break;
      case 'q': // Relative Quadratic Bezier
        while (argIdx < args.length) {
          const x1 = curX + args[argIdx++];
          const y1 = curY + args[argIdx++];
          curX += args[argIdx++];
          curY += args[argIdx++];
          path.quadraticCurveTo(x1, transformY(y1), curX, transformY(curY));
          lastControlX = x1;
          lastControlY = y1;
        }
        break;

      case 'T': // Absolute Smooth Quadratic Bezier: T x y
        while (argIdx < args.length) {
          curX = args[argIdx++];
          curY = args[argIdx++];
          
          let x1 = curX;
          let y1 = curY;
          if (['Q', 'q', 'T', 't'].includes(lastCommandType)) {
            x1 = 2 * curX - lastControlX;
            y1 = 2 * curY - lastControlY;
          }
          
          path.quadraticCurveTo(x1, transformY(y1), curX, transformY(curY));
          lastControlX = x1;
          lastControlY = y1;
        }
        break;
      case 't': // Relative Smooth Quadratic Bezier
        while (argIdx < args.length) {
          const nextX = curX + args[argIdx++];
          const nextY = curY + args[argIdx++];
          
          let x1 = curX;
          let y1 = curY;
          if (['Q', 'q', 'T', 't'].includes(lastCommandType)) {
            x1 = 2 * curX - lastControlX;
            y1 = 2 * curY - lastControlY;
          }
          
          curX = nextX;
          curY = nextY;
          path.quadraticCurveTo(x1, transformY(y1), curX, transformY(curY));
          lastControlX = x1;
          lastControlY = y1;
        }
        break;

      case 'Z':
      case 'z':
        path.close();
        curX = startX;
        curY = startY;
        break;

      default:
        console.warn(`Unsupported SVG path command: ${cmd}`);
    }

    lastCommandType = cmd;
  }

  return path;
}

/**
 * Estimates the bounding box and width of a parsed SVG path.
 * This ensures natural letter spacing for narrow (i, l) and wide (w, m) letters.
 */
export function estimateGlyphWidth(d: string, padding = 70, defaultWidth = 600, minWidth = 250, maxWidth = 1000): number {
  const tokens = tokenizeSvgPath(d);
  let minX = Infinity;
  let maxX = -Infinity;
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  if (tokens.length === 0) return defaultWidth;

  const updateBounds = (x: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  };

  for (const token of tokens) {
    const cmd = token.type;
    const args = token.args;
    let idx = 0;

    switch (cmd) {
      case 'M':
        while (idx < args.length) {
          curX = args[idx++];
          curY = args[idx++];
          startX = curX;
          startY = curY;
          updateBounds(curX);
        }
        break;
      case 'm':
        while (idx < args.length) {
          curX += args[idx++];
          curY += args[idx++];
          startX = curX;
          startY = curY;
          updateBounds(curX);
        }
        break;
      case 'L':
      case 'C':
      case 'S':
      case 'Q':
      case 'T':
        // These draw lines/curves to the final coordinates
        // We can check all coordinates passed to approximate bounds
        while (idx < args.length) {
          const x = args[idx++];
          const y = args[idx++];
          curX = x;
          curY = y;
          updateBounds(x);
        }
        break;
      case 'l':
      case 'c':
      case 's':
      case 'q':
      case 't':
        while (idx < args.length) {
          const rx = args[idx++];
          const ry = args[idx++];
          curX += rx;
          curY += ry;
          updateBounds(curX);
        }
        break;
      case 'H':
        while (idx < args.length) {
          curX = args[idx++];
          updateBounds(curX);
        }
        break;
      case 'h':
        while (idx < args.length) {
          curX += args[idx++];
          updateBounds(curX);
        }
        break;
      case 'V':
        while (idx < args.length) {
          curY = args[idx++];
        }
        break;
      case 'v':
        while (idx < args.length) {
          curY += args[idx++];
        }
        break;
      case 'Z':
      case 'z':
        curX = startX;
        curY = startY;
        break;
    }
  }

  if (minX === Infinity || maxX === -Infinity) {
    return defaultWidth;
  }

  // Set the width based on the bounding box + dynamic padding
  // Ensure the width falls within logical limits
  let calculatedWidth = Math.ceil(maxX + padding);
  
  // Special case: if minX is very large, shift path to the left to align glyph with origin (left side bearing)
  // But we will let opentype.js handle bounds since the path itself is drawn at coordinates.
  // Actually, standardizing left side bearing:
  // If the character starts too far to the right, we shift it, or just use the bounds.
  // Standardizing: we will return calculatedWidth, bound between minWidth and maxWidth
  calculatedWidth = Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
  return calculatedWidth;
}
