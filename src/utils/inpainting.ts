import { EraserMode } from "../types";

/**
 * Performs client-side high-quality content-aware inpainting/erasing.
 * Uses a hybrid exemplar-based texture synthesis and boundary diffusion algorithm.
 * 
 * @param mainCanvas The canvas containing the original image.
 * @param maskCanvas The canvas containing the drawn mask (red/semi-transparent stroke pixels).
 * @param mode The selected eraser mode ('exemplar', 'healing', or 'smudge').
 */
export function performInpaint(
  mainCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  mode: EraserMode
): ImageData {
  const width = mainCanvas.width;
  const height = mainCanvas.height;

  const mainCtx = mainCanvas.getContext("2d");
  const maskCtx = maskCanvas.getContext("2d");

  if (!mainCtx || !maskCtx) {
    throw new Error("Could not get canvas 2D contexts");
  }

  const mainData = mainCtx.getImageData(0, 0, width, height);
  const maskData = maskCtx.getImageData(0, 0, width, height);

  const outputData = mainCtx.createImageData(width, height);
  outputData.data.set(mainData.data);

  const mData = maskData.data;
  const oData = outputData.data;
  const sData = mainData.data; // source read-only data

  // Step 1: Build a binary mask array (boolean) where true = masked pixel (to keep it fast)
  // We check if the mask canvas has positive opacity (alpha > 5) or high red/color value
  const mask = new Uint8Array(width * height);
  let hasMaskedPixels = false;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    // Masked if alpha channel is > 10
    if (mData[idx + 3] > 10) {
      mask[i] = 1;
      hasMaskedPixels = true;
    } else {
      mask[i] = 0;
    }
  }

  // If nothing is masked, return untouched copy
  if (!hasMaskedPixels) {
    return outputData;
  }

  // Helper to get index safe
  const getIdx = (x: number, y: number) => {
    return (y * width + x) * 4;
  };

  /**
   * MODE 1: HEALING WRAP / DIFFUSION FILL
   * Propagates surrounding pixels inwards using iterative distance-weighted diffusion.
   * Perfect for small spots, blemishes, line wires, and simple backdrops.
   */
  if (mode === 'healing') {
    // We create a temporary array to do double-buffer updates
    const currentR = new Uint8Array(width * height);
    const currentG = new Uint8Array(width * height);
    const currentB = new Uint8Array(width * height);

    // Initial fill: For masked pixels, we fill with nearest available unmasked pixel 
    // to give the iterative diffusion a solid start, avoiding black bleeding.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i]) {
          // Find nearest unmasked along 8 star rays
          let found = false;
          let r = 1;
          const maxSearch = Math.max(30, Math.floor(Math.min(width, height) * 0.05));
          
          while (r < maxSearch && !found) {
            const dirs = [
              [0, -r], [0, r], [-r, 0], [r, 0],
              [-r, -r], [-r, r], [r, -r], [r, r]
            ];
            for (const [dx, dy] of dirs) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const ni = ny * width + nx;
                if (!mask[ni]) {
                  const nOffset = ni * 4;
                  currentR[i] = sData[nOffset];
                  currentG[i] = sData[nOffset + 1];
                  currentB[i] = sData[nOffset + 2];
                  found = true;
                  break;
                }
              }
            }
            r++;
          }
          
          if (!found) {
            // Backup color fallback if search radius is exceeded
            currentR[i] = 128;
            currentG[i] = 128;
            currentB[i] = 128;
          }
        } else {
          const offset = i * 4;
          currentR[i] = sData[offset];
          currentG[i] = sData[offset + 1];
          currentB[i] = sData[offset + 2];
        }
      }
    }

    // Now perform 10 iterations of neighborhood relaxation blur ONLY for the masked pixels
    const nextR = new Uint8Array(currentR);
    const nextG = new Uint8Array(currentG);
    const nextB = new Uint8Array(currentB);

    const iterations = 12;
    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (mask[i]) {
            // Apply 3x3 average filter
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            const offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
            for (const offset of offsets) {
              const ni = i + offset;
              rSum += currentR[ni];
              gSum += currentG[ni];
              bSum += currentB[ni];
              count++;
            }
            nextR[i] = Math.round(rSum / count);
            nextG[i] = Math.round(gSum / count);
            nextB[i] = Math.round(bSum / count);
          }
        }
      }
      currentR.set(nextR);
      currentG.set(nextG);
      currentB.set(nextB);
    }

    // Write back and apply soft feathering on the edges to eliminate rough cuts
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i]) {
          const offset = i * 4;
          // Calculate distance to edge to feather
          let distToEdge = 5;
          for (let r = 1; r <= 4; r++) {
            let edgeFound = false;
            const dirs = [[0, -r], [0, r], [-r, 0], [r, 0]];
            for (const [dx, dy] of dirs) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (!mask[ny * width + nx]) {
                  distToEdge = r;
                  edgeFound = true;
                  break;
                }
              }
            }
            if (edgeFound) break;
          }

          const blendFactor = distToEdge / 5; // 0.2 to 1
          oData[offset] = Math.round(currentR[i] * blendFactor + sData[offset] * (1 - blendFactor));
          oData[offset + 1] = Math.round(currentG[i] * blendFactor + sData[offset + 1] * (1 - blendFactor));
          oData[offset + 2] = Math.round(currentB[i] * blendFactor + sData[offset + 2] * (1 - blendFactor));
        }
      }
    }
  }

  /**
   * MODE 2: EXEMPLAR-BASED TEXTURE FILL
   * Searches a larger ring area for matching texturized patches.
   * Replaces the masked area with original high-resolution textures.
   * Ideal for grass, water, sky, sand, walls, etc.
   */
  else if (mode === 'exemplar') {
    // We execute block-by-block path filling
    const blockSize = 8;
    const searchRadius = 40;

    // Process in blocks of size 8x8
    for (let by = 0; by < height; by += blockSize) {
      for (let bx = 0; bx < width; bx += blockSize) {
        
        // Check if this block contains any masked pixels
        let blockHasMask = false;
        for (let dy = 0; dy < blockSize && by + dy < height; dy++) {
          for (let dx = 0; dx < blockSize && bx + dx < width; dx++) {
            if (mask[(by + dy) * width + (bx + dx)]) {
              blockHasMask = true;
              break;
            }
          }
          if (blockHasMask) break;
        }

        if (!blockHasMask) continue;

        // We have a masked block. Let's find the best matching non-masked block in surrounding region
        let bestX = bx;
        let bestY = by;
        let bestError = Infinity;
        let foundSourceMatch = false;

        // Search in search window [by - searchRadius, by + searchRadius]
        const yStart = Math.max(0, by - searchRadius);
        const yEnd = Math.min(height - blockSize, by + searchRadius);
        const xStart = Math.max(0, bx - searchRadius);
        const xEnd = Math.min(width - blockSize, bx + searchRadius);

        // Step 1: Scan for target boundary values (pixels that are NOT masked to seek resemblance)
        const targetBorders: { dx: number; dy: number; r: number; g: number; b: number }[] = [];
        for (let dy = -2; dy < blockSize + 2; dy++) {
          for (let dx = -2; dx < blockSize + 2; dx++) {
            const ty = by + dy;
            const tx = bx + dx;
            if (ty >= 0 && ty < height && tx >= 0 && tx < width) {
              const ti = ty * width + tx;
              if (!mask[ti]) {
                const offset = ti * 4;
                targetBorders.push({
                  dx, dy,
                  r: sData[offset],
                  g: sData[offset + 1],
                  b: sData[offset + 2],
                });
              }
            }
          }
        }

        // Search for a candidate unmasked block
        // To keep it fast, we scan with a step of 2 or 3 pixels
        for (let sy = yStart; sy < yEnd; sy += 3) {
          for (let sx = xStart; sx < xEnd; sx += 3) {
            
            // Candidate block must be COMPLETELY unmasked
            let candidateIndexClean = true;
            for (let dy = -2; dy < blockSize + 2; dy++) {
              for (let dx = -2; dx < blockSize + 2; dx++) {
                const cy = sy + dy;
                const cx = sx + dx;
                if (cy >= 0 && cy < height && cx >= 0 && cx < width) {
                  if (mask[cy * width + cx]) {
                    candidateIndexClean = false;
                    break;
                  }
                }
              }
              if (!candidateIndexClean) break;
            }

            if (!candidateIndexClean) continue;

            // Compute sum of absolute color differences for the border pixels
            let error = 0;
            for (const border of targetBorders) {
              const cy = sy + border.dy;
              const cx = sx + border.dx;
              const coff = (cy * width + cx) * 4;
              
              error += Math.abs(sData[coff] - border.r) +
                       Math.abs(sData[coff + 1] - border.g) +
                       Math.abs(sData[coff + 2] - border.b);
            }

            // Prefer patches closer in space if errors are roughly equal
            const dist = Math.sqrt((sx - bx) ** 2 + (sy - by) ** 2);
            const spatialPenalty = dist * 0.1;
            const totalError = error + spatialPenalty;

            if (totalError < bestError) {
              bestError = totalError;
              bestX = sx;
              bestY = sy;
              foundSourceMatch = true;
            }
          }
        }

        // Step 3: Write candidate block pixels into output
        if (foundSourceMatch) {
          for (let dy = 0; dy < blockSize; dy++) {
            const ty = by + dy;
            const sy = bestY + dy;
            if (ty >= height) continue;

            for (let dx = 0; dx < blockSize; dx++) {
              const tx = bx + dx;
              const sx = bestX + dx;
              if (tx >= width) continue;

              const tIdx = ty * width + tx;
              if (mask[tIdx]) {
                const targetOffset = tIdx * 4;
                const sourceOffset = (sy * width + sx) * 4;

                // Feather block edges mildly to smooth tile lines
                let blend = 1.0;
                const distToBlockEdge = Math.min(dy, dx, blockSize - 1 - dy, blockSize - 1 - dx);
                if (distToBlockEdge < 2) {
                  blend = distToBlockEdge === 0 ? 0.3 : 0.7;
                }

                oData[targetOffset] = Math.round(sData[sourceOffset] * blend + oData[targetOffset] * (1 - blend));
                oData[targetOffset + 1] = Math.round(sData[sourceOffset + 1] * blend + oData[targetOffset + 1] * (1 - blend));
                oData[targetOffset + 2] = Math.round(sData[sourceOffset + 2] * blend + oData[targetOffset + 2] * (1 - blend));
              }
            }
          }
        }
      }
    }
  }

  /**
   * MODE 3: SMUDGE / GAUSSIAN BLUR
   * Clones neighboring average and applies a nice smudge/blur filter.
   * Outstanding for solid background cleanups, whiteboards, paper, sky.
   */
  else {
    // Fill the mask pixels with boundary colors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i]) {
          const offset = i * 4;
          
          // Probe radial bounds (up to 8 pixels)
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          for (let radius = 1; radius <= 8; radius++) {
            const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
            for (const angle of angles) {
              const px = Math.round(x + Math.cos(angle) * radius);
              const py = Math.round(y + Math.sin(angle) * radius);
              if (px >= 0 && px < width && py >= 0 && py < height) {
                const pi = py * width + px;
                if (!mask[pi]) {
                  const poff = pi * 4;
                  rSum += sData[poff];
                  gSum += sData[poff + 1];
                  bSum += sData[poff + 2];
                  count++;
                }
              }
            }
            if (count > 0) break; // Use closest boundary ring
          }

          if (count > 0) {
            oData[offset] = Math.round(rSum / count);
            oData[offset + 1] = Math.round(gSum / count);
            oData[offset + 2] = Math.round(bSum / count);
          }
        }
      }
    }

    // Apply smooth box blur (smudge pass) exclusively on the filled region
    const blurBuffer = mainCtx.createImageData(width, height);
    blurBuffer.data.set(oData);
    const bData = blurBuffer.data;

    const blurSize = 3;
    for (let y = blurSize; y < height - blurSize; y++) {
      for (let x = blurSize; x < width - blurSize; x++) {
        const i = y * width + x;
        if (mask[i]) {
          const offset = i * 4;
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          
          for (let ky = -blurSize; ky <= blurSize; ky++) {
            for (let kx = -blurSize; kx <= blurSize; kx++) {
              const koffset = ((y + ky) * width + (x + kx)) * 4;
              rSum += bData[koffset];
              gSum += bData[koffset + 1];
              bSum += bData[koffset + 2];
              count++;
            }
          }

          oData[offset] = Math.round(rSum / count);
          oData[offset + 1] = Math.round(gSum / count);
          oData[offset + 2] = Math.round(bSum / count);
        }
      }
    }
  }

  return outputData;
}
