interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageSegment {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

/**
 * Automatically detects and extracts individual drawn characters from a single uploaded image.
 * Uses binarization, connected component analysis, and bounding-box merging.
 */
 export async function extractImageSegments(
  imageSrc: string,
  minSize = 12,
  padding = 15,
  mergeThreshold = 25,
  customThreshold?: number
): Promise<ImageSegment[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // 1. Render image onto canvas
        const canvas = document.createElement('canvas');
        const scale = Math.min(1000 / img.width, 1000 / img.height, 1); // Downsample for fast analysis
        canvas.width = Math.ceil(img.width * scale);
        canvas.height = Math.ceil(img.height * scale);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not create 2D canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // 2. Fetch pixel data
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const width = imgData.width;
        const height = imgData.height;

        // 3. Determine if background is light or dark by sampling border pixels
        let borderSum = 0;
        let borderCount = 0;
        for (let x = 0; x < width; x++) {
          // Top row
          let idx = x * 4;
          borderSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
          borderCount++;
          // Bottom row
          idx = ((height - 1) * width + x) * 4;
          borderSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
          borderCount++;
        }
        for (let y = 1; y < height - 1; y++) {
          // Left col
          let idx = (y * width) * 4;
          borderSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
          borderCount++;
          // Right col
          idx = (y * width + (width - 1)) * 4;
          borderSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
          borderCount++;
        }
        
        const avgBorderBrightness = borderSum / borderCount;
        const isLightBg = avgBorderBrightness > 127;

        // 4. Create binary grid (1 for ink, 0 for paper)
        // Apply Otsu-like or simple dynamic thresholding
        const inkThreshold = customThreshold !== undefined ? customThreshold : (isLightBg ? 160 : 95);
        const binaryGrid = new Uint8Array(width * height);
        
        for (let i = 0; i < width * height; i++) {
          const idx = i * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          const brightness = (r + g + b) / 3;
          
          if (isLightBg) {
            // Light background: dark pixels are ink
            binaryGrid[i] = brightness < inkThreshold ? 1 : 0;
          } else {
            // Dark background: light pixels are ink
            binaryGrid[i] = brightness > inkThreshold ? 1 : 0;
          }
        }

        // 5. Connected Component Analysis (BFS to detect character blobs)
        const visited = new Uint8Array(width * height);
        const rawBoxes: BoundingBox[] = [];

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (binaryGrid[idx] === 1 && visited[idx] === 0) {
              // Found unvisited ink pixel, perform BFS to map the blob
              let minX = x;
              let maxX = x;
              let minY = y;
              let maxY = y;

              const queue: [number, number][] = [[x, y]];
              visited[idx] = 1;

              let qIdx = 0;
              while (qIdx < queue.length) {
                const [cx, cy] = queue[qIdx++];
                
                // Track bounds
                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                // Check 4 neighbors (Up, Down, Left, Right)
                const neighbors = [
                  [cx, cy - 1],
                  [cx, cy + 1],
                  [cx - 1, cy],
                  [cx + 1, cy]
                ];

                for (const [nx, ny] of neighbors) {
                  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = ny * width + nx;
                    if (binaryGrid[nIdx] === 1 && visited[nIdx] === 0) {
                      visited[nIdx] = 1;
                      queue.push([nx, ny]);
                    }
                  }
                }
              }

              // Save bounding box if it passes minimum size threshold
              const w = maxX - minX + 1;
              const h = maxY - minY + 1;
              if (w >= minSize && h >= minSize) {
                rawBoxes.push({ x: minX, y: minY, w, h });
              }
            }
          }
        }

        // 6. Merge overlapping or very close bounding boxes (e.g. disjoint components like i dots, accents)
        const mergedBoxes: BoundingBox[] = [];
        const used = new Uint8Array(rawBoxes.length);

        for (let i = 0; i < rawBoxes.length; i++) {
          if (used[i] === 1) continue;
          used[i] = 1;

          let currentBox = { ...rawBoxes[i] };
          let foundMerge = true;

          while (foundMerge) {
            foundMerge = false;
            for (let j = 0; j < rawBoxes.length; j++) {
              if (used[j] === 1) continue;

              const other = rawBoxes[j];
              
              // Check if they are extremely close (horizontal / vertical distance)
              const hOverlap = !(currentBox.x + currentBox.w + mergeThreshold < other.x || other.x + other.w + mergeThreshold < currentBox.x);
              const vOverlap = !(currentBox.y + currentBox.h + mergeThreshold < other.y || other.y + other.h + mergeThreshold < currentBox.y);

              if (hOverlap && vOverlap) {
                // Merge boxes
                const newX = Math.min(currentBox.x, other.x);
                const newY = Math.min(currentBox.y, other.y);
                const newW = Math.max(currentBox.x + currentBox.w, other.x + other.w) - newX;
                const newH = Math.max(currentBox.y + currentBox.h, other.y + other.h) - newY;
                
                currentBox = { x: newX, y: newY, w: newW, h: newH };
                used[j] = 1;
                foundMerge = true;
              }
            }
          }
          
          mergedBoxes.push(currentBox);
        }

        // 7. Crop the merged character boxes from the original image (high-res)
        const segments: ImageSegment[] = [];
        
        mergedBoxes.forEach((box, index) => {
          // Map downscaled bounding box coordinates back to original image scale
          const origX = Math.max(0, Math.floor(box.x / scale) - padding);
          const origY = Math.max(0, Math.floor(box.y / scale) - padding);
          const origW = Math.min(img.width - origX, Math.ceil(box.w / scale) + padding * 2);
          const origH = Math.min(img.height - origY, Math.ceil(box.h / scale) + padding * 2);

          if (origW < minSize || origH < minSize) return;

          // Crop on temporary canvas
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = origW;
          cropCanvas.height = origH;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            // Draw cropped region
            cropCtx.drawImage(img, origX, origY, origW, origH, 0, 0, origW, origH);
            
            // Clean up: if background is light, make background transparent and ink pure black for beautiful tracing!
            // Or make background solid black and ink pure white (standard VectorFlow drawing format)
            // Let's force it to solid black bg with pure white drawings because imagetracerjs and standard canvas
            // tracers work perfectly on white-on-black!
            const cropImgData = cropCtx.getImageData(0, 0, origW, origH);
            const cropPixels = cropImgData.data;
            
            for (let i = 0; i < cropPixels.length; i += 4) {
              const r = cropPixels[i];
              const g = cropPixels[i+1];
              const b = cropPixels[i+2];
              const bright = (r + g + b) / 3;
              
              if (isLightBg) {
                // If light bg, dark ink -> invert to white on black
                if (bright < 160) {
                  cropPixels[i] = 255;
                  cropPixels[i+1] = 255;
                  cropPixels[i+2] = 255;
                } else {
                  cropPixels[i] = 15;
                  cropPixels[i+1] = 15;
                  cropPixels[i+2] = 18; //Solid dark gray background
                }
              } else {
                // Dark background already: just threshold to pure high-contrast white on dark
                if (bright > 95) {
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

            segments.push({
              id: `segment-${index}`,
              x: origX,
              y: origY,
              width: origW,
              height: origH,
              dataUrl: cropCanvas.toDataURL('image/png')
            });
          }
        });

        // Sort segments left-to-right (horizontal sorting makes it extremely easy for users to map them in alphabetical order!)
        segments.sort((a, b) => {
          // If vertical separation is large (multiple lines), sort by row first
          const yDiff = Math.abs(a.y - b.y);
          if (yDiff > 80) {
            return a.y - b.y;
          }
          return a.x - b.x;
        });

        resolve(segments);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for segmentation'));
    img.src = imageSrc;
  });
}
