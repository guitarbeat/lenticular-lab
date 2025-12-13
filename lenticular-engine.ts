
import { Frame, JobSettings, CalibrationSettings } from './types';

/**
 * Generates the final interlaced lenticular image.
 */
export const generateLenticularImage = async (
  frames: Frame[],
  settings: JobSettings,
  canvas: HTMLCanvasElement,
  onLog: (msg: string) => void,
  cachedImages: Map<string, HTMLImageElement> = new Map()
): Promise<string> => {
  const { 
    hppi, vppi, widthMm, heightMm, 
    marginTopMm, marginBottomMm, marginLeftMm, marginRightMm,
    lpi, direction, alignmentPos 
  } = settings;

  onLog(`Job Started.`);
  onLog(`Settings: ${hppi}h x ${vppi}v PPI`);
  onLog(`Phys Size: ${widthMm}mm x ${heightMm}mm`);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("No Canvas Context");

  // Calculate Pixels for Content
  const contentWidthPx = Math.ceil((widthMm / 25.4) * hppi);
  const contentHeightPx = Math.ceil((heightMm / 25.4) * vppi);
  
  // Calculate Pixels for Margins
  const marginTopPx = Math.ceil((marginTopMm / 25.4) * vppi);
  const marginBottomPx = Math.ceil((marginBottomMm / 25.4) * vppi);
  const marginLeftPx = Math.ceil((marginLeftMm / 25.4) * hppi);
  const marginRightPx = Math.ceil((marginRightMm / 25.4) * hppi);
  
  const totalWidthPx = contentWidthPx + marginLeftPx + marginRightPx;
  const totalHeightPx = contentHeightPx + marginTopPx + marginBottomPx;

  if (canvas.width !== totalWidthPx || canvas.height !== totalHeightPx) {
    canvas.width = totalWidthPx;
    canvas.height = totalHeightPx;
  }
  
  // Fill Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load Image Elements (Using cache if available)
  const imgElements = await Promise.all(frames.map(f => {
      if (cachedImages.has(f.id)) {
          const cached = cachedImages.get(f.id);
          if (cached) return Promise.resolve({ img: cached, frame: f });
      }
      return new Promise<{img: HTMLImageElement, frame: Frame}>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve({ img: i, frame: f });
        i.onerror = reject;
        i.src = f.src;
      });
  }));

  // Handle Direction
  // We keep the pair of (Image, FrameData) together when reversing
  const seqData = direction === 'RL' ? [...imgElements].reverse() : imgElements;

  // Interlacing Logic
  const pPx = hppi / lpi; // Pixels per pitch (lens width in pixels)
  const stripPx = pPx / frames.length; // Width of a single frame strip
  const numLenses = Math.ceil(contentWidthPx / pPx);
  
  const drawOffsetX = marginLeftPx;
  const drawOffsetY = marginTopPx;

  // Render Strategy: Clipping Masks
  // This allows us to handle frame offsets (xOffset/yOffset) easily without complex slicing math.
  // We iterate through lenses, then frames. For each strip, we set a clip region and draw the full image offset correctly.
  
  // Optimization: Pre-calculate scaling for each image to fit the content box
  // Normally lenticular frames should be same size, but we scale them to fit the defined physical dimensions
  
  for (let l = 0; l < numLenses; l++) {
    const lensX = l * pPx;
    if (lensX >= contentWidthPx) break;

    for (let f = 0; f < seqData.length; f++) {
      const { img, frame } = seqData[f];
      
      // Destination Strip Rect
      const destX = drawOffsetX + lensX + (f * stripPx);
      const destY = drawOffsetY;
      const destW = stripPx; // This might be sub-pixel, which is fine for canvas
      const destH = contentHeightPx;

      ctx.save();
      
      // Define Clip Path for this strip
      ctx.beginPath();
      ctx.rect(destX, destY, destW, destH);
      ctx.clip();

      // Draw Image
      // We scale the image to fill the content area, then apply the frame's specific offset
      // Offset is in pixels relative to the output resolution
      const xPos = drawOffsetX + frame.xOffset;
      const yPos = drawOffsetY + frame.yOffset;
      
      ctx.drawImage(img, xPos, yPos, contentWidthPx, contentHeightPx);
      
      ctx.restore();
    }
  }

  // Draw Alignment Margins
  if (marginTopPx > 0 || marginBottomPx > 0) {
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    
    const centerContentX = drawOffsetX + (contentWidthPx / 2);
    
    const drawPattern = (centerX: number, yStart: number, height: number, invert: boolean = false) => {
        const w = pPx * 4;
        const h = height;
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(centerX - w/2, yStart, w, h);
        
        ctx.beginPath();
        // Center Line
        ctx.moveTo(centerX, yStart); 
        ctx.lineTo(centerX, yStart + h);
        
        // Pitch lines
        for(let i=1; i<=2; i++) {
             ctx.moveTo(centerX - (i*pPx), yStart); ctx.lineTo(centerX - (i*pPx), yStart + h);
             ctx.moveTo(centerX + (i*pPx), yStart); ctx.lineTo(centerX + (i*pPx), yStart + h);
        }
        ctx.stroke();
    };

    if (marginTopPx > 0) {
        drawPattern(centerContentX, 0, marginTopPx);
        if (alignmentPos !== 'internal') {
             drawPattern(drawOffsetX + pPx * 2, 0, marginTopPx); 
             drawPattern(drawOffsetX + contentWidthPx - pPx * 2, 0, marginTopPx); 
        }
    }
    
    if (marginBottomPx > 0) {
        const y = totalHeightPx - marginBottomPx;
        drawPattern(centerContentX, y, marginBottomPx);
        if (alignmentPos !== 'internal') {
             drawPattern(drawOffsetX + pPx * 2, y, marginBottomPx); 
             drawPattern(drawOffsetX + contentWidthPx - pPx * 2, y, marginBottomPx);
        }
    }
    
    // Crop Marks
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    const bracketLen = 20;
    
    // TL
    ctx.beginPath(); ctx.moveTo(drawOffsetX, drawOffsetY - bracketLen); ctx.lineTo(drawOffsetX, drawOffsetY); ctx.lineTo(drawOffsetX - bracketLen, drawOffsetY); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(drawOffsetX + contentWidthPx, drawOffsetY - bracketLen); ctx.lineTo(drawOffsetX + contentWidthPx, drawOffsetY); ctx.lineTo(drawOffsetX + contentWidthPx + bracketLen, drawOffsetY); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(drawOffsetX, drawOffsetY + contentHeightPx + bracketLen); ctx.lineTo(drawOffsetX, drawOffsetY + contentHeightPx); ctx.lineTo(drawOffsetX - bracketLen, drawOffsetY + contentHeightPx); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(drawOffsetX + contentWidthPx, drawOffsetY + contentHeightPx + bracketLen); ctx.lineTo(drawOffsetX + contentWidthPx, drawOffsetY + contentHeightPx); ctx.lineTo(drawOffsetX + contentWidthPx + bracketLen, drawOffsetY + contentHeightPx); ctx.stroke();
  }

  onLog(`Processing Complete.`);
  return canvas.toDataURL("image/png");
};


/**
 * Generates a Calibration Chart.
 */
export const generateCalibrationChart = async (
    settings: JobSettings,
    testSettings: CalibrationSettings,
    canvas: HTMLCanvasElement,
    onLog: (msg: string) => void
  ): Promise<string> => {
    const { hppi, vppi, widthMm, heightMm, unit } = settings;
    const { centerLpi, stripCount, stepLpi } = testSettings;

    onLog(`Calibration Started.`);
    onLog(`Resolution: ${hppi} PPI`);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No Context");

    // Dimensions
    const widthPx = Math.ceil((widthMm / 25.4) * hppi);
    const heightPx = Math.ceil((heightMm / 25.4) * vppi);

    if (canvas.width !== widthPx || canvas.height !== heightPx) {
        canvas.width = widthPx;
        canvas.height = heightPx;
    }

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#000000';

    const stripHeight = heightPx / stripCount;
    const startLpi = centerLpi - (Math.floor(stripCount / 2) * stepLpi);

    for (let i = 0; i < stripCount; i++) {
        const currentLpi = startLpi + (i * stepLpi);
        const y = i * stripHeight;
        
        // Calculate Pixels Per Pitch
        const pitchPx = hppi / currentLpi;
        
        // Draw Lines
        const lineCount = Math.ceil(widthPx / pitchPx);
        
        ctx.beginPath();
        for (let j = 0; j < lineCount; j++) {
            const x = Math.round(j * pitchPx);
            ctx.rect(x, y, 1, stripHeight);
        }
        ctx.fill();

        // Label
        const text = `${currentLpi.toFixed(2)} LPI`;
        ctx.font = 'bold 16px monospace';
        const textMetrics = ctx.measureText(text);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(10, y + (stripHeight/2) - 10, textMetrics.width + 10, 20);
        
        ctx.fillStyle = '#ff0000';
        ctx.fillText(text, 15, y + (stripHeight/2) + 5);
        ctx.fillStyle = '#000000'; 
    }

    const meta = `Calibration Chart | ${hppi} PPI | Range: ${startLpi.toFixed(2)} - ${(startLpi + (stripCount-1)*stepLpi).toFixed(2)} LPI`;
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(meta, widthPx - ctx.measureText(meta).width - 10, heightPx - 10);

    return canvas.toDataURL("image/png");
};

/**
 * Creates a TIFF Blob from ImageData with specific DPI metadata.
 */
export const createTiffBlob = (
  ctx: CanvasRenderingContext2D,
  hppi: number,
  vppi: number
): Blob => {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // We will write uncompressed RGB TIFF (Little Endian)
  const pixelCount = width * height;
  const rgbSize = pixelCount * 3;
  
  // Header: 8 bytes
  // IFD: 2 (count) + 12 * 12 (entries) + 4 (next) = 150 bytes
  // Extra values stored after data but before IFD: 
  //   XResolution (8 bytes)
  //   YResolution (8 bytes)
  //   BitsPerSample (6 bytes)
  
  const headerSize = 8;
  const extraValuesSize = 8 + 8 + 6; 
  const ifdSize = 2 + (12 * 12) + 4; // 12 tags
  
  const fileSize = headerSize + rgbSize + extraValuesSize + ifdSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  let offset = 0;
  
  // 1. Header
  view.setUint16(0, 0x4949, true); // "II" little endian
  view.setUint16(2, 42, true);     // Magic number
  // Offset to IFD. We put IFD at the end.
  const ifdOffset = headerSize + rgbSize + extraValuesSize;
  view.setUint32(4, ifdOffset, true);
  
  offset += 8;
  
  // 2. Pixel Data (RGBA -> RGB)
  const pixelDataStart = offset;
  const pixels = new Uint8Array(buffer, offset, rgbSize);
  let ptr = 0;
  for (let i = 0; i < data.length; i += 4) {
      pixels[ptr++] = data[i];     // R
      pixels[ptr++] = data[i+1];   // G
      pixels[ptr++] = data[i+2];   // B
      // Skip Alpha (data[i+3])
  }
  offset += rgbSize;
  
  // 3. Extra Values
  const xResOffset = offset;
  view.setUint32(offset, Math.round(hppi * 100), true); // numerator
  view.setUint32(offset+4, 100, true); // denominator
  offset += 8;
  
  const yResOffset = offset;
  view.setUint32(offset, Math.round(vppi * 100), true);
  view.setUint32(offset+4, 100, true);
  offset += 8;
  
  const bitsOffset = offset;
  view.setUint16(offset, 8, true);
  view.setUint16(offset+2, 8, true);
  view.setUint16(offset+4, 8, true);
  offset += 6;
  
  // 4. IFD
  // offset is now at ifdOffset
  const tagCount = 12;
  view.setUint16(offset, tagCount, true);
  offset += 2;
  
  const writeTag = (tag: number, type: number, count: number, value: number) => {
      view.setUint16(offset, tag, true);
      view.setUint16(offset+2, type, true); // 3=SHORT, 4=LONG, 5=RATIONAL
      view.setUint32(offset+4, count, true);
      view.setUint32(offset+8, value, true);
      offset += 12;
  };

  writeTag(256, 4, 1, width);          // ImageWidth
  writeTag(257, 4, 1, height);         // ImageLength
  writeTag(258, 3, 3, bitsOffset);     // BitsPerSample (ptr)
  writeTag(259, 3, 1, 1);              // Compression (1=None)
  writeTag(262, 3, 1, 2);              // PhotometricInterpretation (2=RGB)
  writeTag(273, 4, 1, pixelDataStart); // StripOffsets
  writeTag(277, 3, 1, 3);              // SamplesPerPixel (3)
  writeTag(278, 4, 1, height);         // RowsPerStrip (All in one strip)
  writeTag(279, 4, 1, rgbSize);        // StripByteCounts
  writeTag(282, 5, 1, xResOffset);     // XResolution (ptr)
  writeTag(283, 5, 1, yResOffset);     // YResolution (ptr)
  writeTag(296, 3, 1, 2);              // ResolutionUnit (2=Inch)
  
  // Next IFD (0)
  view.setUint32(offset, 0, true);
  
  return new Blob([buffer], { type: 'image/tiff' });
};
