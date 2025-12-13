
import { PhysicsSettings, JobSettings } from './types';

/**
 * Calculates the optical Field of View (FOV) of a lenticular lens based on its physical properties.
 * It uses Snell's law and geometry of the lens segment.
 */
export const calculateFOV = (
  lpi: number,
  radiusMicrons: number,
  thicknessMicrons: number,
  refractiveIndex: number
): number => {
  const p = 25400 / lpi; // pitch in microns
  const r = radiusMicrons;
  const e = thicknessMicrons;
  const n = refractiveIndex;
  
  if (r <= 0 || p <= 0) return 0;
  if (p > 2 * r) return 0; // Pitch cannot be larger than diameter

  const A_rad = Math.asin(p / (2 * r));
  // Sagitta calculation
  const f = r - Math.sqrt(r * r - (p / 2) * (p / 2));
  const h = e - f;
  
  if (h <= 0) return 0; // Thickness issue

  const R_rad = A_rad - Math.atan(p / h);
  const n_air = 1.0003;
  
  // Snell's Law
  const sinI = (n * Math.sin(R_rad)) / n_air;
  
  if (Math.abs(sinI) > 1) return 0; // Total internal reflection or geometry error

  const I_rad = Math.asin(sinI);
  const O_rad = 2 * (A_rad - I_rad); // Full cone angle
  
  return (O_rad * 180 / Math.PI);
};

/**
 * Renders the lenticular simulation view.
 * This function simulates what the eye sees at a specific viewing angle (simX) relative to the print.
 */
export const renderSimulationFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  images: HTMLImageElement[],
  jobSettings: JobSettings,
  physicsSettings: PhysicsSettings,
  simX: number // 0.0 to 1.0
) => {
  const { widthMm, direction } = jobSettings;
  const { viewingDistanceMm } = physicsSettings;
  const fovDegrees = calculateFOV(jobSettings.lpi, physicsSettings.radiusMicrons, physicsSettings.thicknessMicrons, physicsSettings.refractiveIndex);

  // Clear Canvas
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  if (images.length === 0) return;
  if (fovDegrees <= 0) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("INVALID PHYSICS PARAMETERS", width/2, height/2);
      return;
  }

  const aspect = images[0].width / images[0].height;
  
  // Calculate draw dimensions to contain image within canvas
  let drawW = width;
  let drawH = width / aspect;
  if (drawH > height) {
    drawH = height;
    drawW = height * aspect;
  }
  const offX = Math.floor((width - drawW) / 2);
  const offY = Math.floor((height - drawH) / 2);

  // Parallax Rendering Logic
  const step = 2; // Render resolution (pixel steps)
  const moveRangeMm = 600; // Physical range of eye movement simulated
  const eyePhysX = (simX - 0.5) * moveRangeMm;
  const dist = viewingDistanceMm;
  const numFrames = images.length;
  const fovRad = fovDegrees * Math.PI / 180;

  // We draw the base image first
  for (let x = 0; x < drawW; x += step) {
     const u = x / drawW; 
     const physPointX = (u - 0.5) * widthMm;

     const vecX = physPointX - eyePhysX;
     const vecY = -dist; 

     const angle = Math.atan2(vecX, Math.abs(vecY));

     // Map angle to frame index based on FOV
     let t = (angle / fovRad) + 0.5;
     
     if (direction === 'RL') t = 1.0 - t;

     // Wrap or clamp logic can vary, here we cycle or clamp within the "cone"
     t = t - Math.floor(t);

     const frameFloat = t * (numFrames - 1);
     const idx = Math.floor(frameFloat);
     const nextIdx = Math.min(idx + 1, numFrames - 1);
     const mix = frameFloat - idx;

     const img = images[idx];
     const nextImg = images[nextIdx];

     const sx = (x / drawW) * img.width;
     const sw = (step / drawW) * img.width;

     // Draw primary frame slice
     ctx.drawImage(img, sx, 0, sw, img.height, offX + x, offY, step, drawH);
     
     // Blend next frame for smoothness
     if (mix > 0.05) {
         ctx.globalAlpha = mix;
         ctx.drawImage(nextImg, sx, 0, sw, nextImg.height, offX + x, offY, step, drawH);
         ctx.globalAlpha = 1;
     }
  }

  // --- Post Processing for CRT / Lens Effect ---
  // Only apply expensive pixel effects if canvas is reasonably sized to prevent lag
  if (width * height < 2000000) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const copy = new Uint8ClampedArray(data); // Create copy for sampling
      const width4 = width * 4;

      for (let y = 0; y < height; y++) {
          const rowStart = y * width4;
          
          // Scanline effect: darken every other line
          const scanlineFactor = (y % 2 === 0) ? 0.95 : 0.85; 

          // Lens Chromatic Aberration Simulation
          // Simulate simple channel separation by offsetting R and B channels
          // The offset increases slightly towards edges of the screen (though linear here for speed)
          const rOffset = -2 * 4; // Shift Red Left
          const bOffset = 2 * 4;  // Shift Blue Right

          for (let i = 0; i < width4; i += 4) {
             const idx = rowStart + i;
             
             // Red Channel
             if (idx + rOffset >= rowStart && idx + rOffset < rowStart + width4) {
                data[idx] = copy[idx + rOffset] * scanlineFactor;
             } else {
                data[idx] = copy[idx] * scanlineFactor;
             }
             
             // Green Channel (Center)
             data[idx + 1] = copy[idx + 1] * scanlineFactor;
             
             // Blue Channel
             if (idx + bOffset >= rowStart && idx + bOffset < rowStart + width4) {
                data[idx + 2] = copy[idx + bOffset] * scanlineFactor;
             } else {
                data[idx + 2] = copy[idx + 2] * scanlineFactor;
             }
             
             // Alpha remains
          }
      }
      ctx.putImageData(imageData, 0, 0);
  }

  // Vignette
  ctx.globalCompositeOperation = 'multiply';
  const grad = ctx.createRadialGradient(width/2, height/2, height/2.5, width/2, height/2, height);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.8, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
};
