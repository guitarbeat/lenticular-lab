
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { UploadIcon, DownloadIcon, PlayIcon, PauseIcon, RefreshIcon, TrashIcon, ZoomInIcon, ZoomOutIcon, EyeIcon, LayoutIcon, SettingsIcon, AlertIcon, SwapIcon, ChevronUp, ChevronDown, MenuIcon, XIcon, ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, InfoIcon, MouseIcon } from './icons';
import { Frame, JobSettings, PhysicsSettings, Unit, CalibrationSettings, Preset } from './types';
import { calculateFOV, renderSimulationFrame } from './physics';
import { generateLenticularImage, generateCalibrationChart, createTiffBlob } from './lenticular-engine';

// --- Constants ---
const STORAGE_KEY_JOB = 'lenticular_lab_job_settings';

// --- Helpers ---
const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) setMatches(media.matches);
    const listener = () => setMatches(media.matches);
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, [matches, query]);
  return matches;
}

const DEFAULT_PRESETS: Preset[] = [
    {
        id: '60lpi-inkjet',
        name: '60 LPI Inkjet (600 DPI)',
        job: {
            unit: 'mm', widthMm: 152.4, heightMm: 101.6, hppi: 600, vppi: 600, lpi: 60,
            marginTopMm: 5, marginBottomMm: 5, marginLeftMm: 0, marginRightMm: 0,
            alignmentPos: 'external', direction: 'LR'
        },
        physics: { radiusMicrons: 254, thicknessMicrons: 457, refractiveIndex: 1.56, viewingDistanceMm: 600 }
    }
];

// --- Sub-Components ---

const InfoBubble = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <InfoIcon className="w-3.5 h-3.5 text-textDim group-hover:text-primary transition-colors cursor-help" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-surface border border-border rounded-xl text-[11px] text-text font-medium leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-2xl z-[70] translate-y-1 group-hover:translate-y-0 duration-200">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-surface"></div>
    </div>
  </div>
);

const SectionHeader = ({ step, title, info }: { step?: string, title: string, info?: string }) => (
  <div className="flex flex-col gap-1 mb-4">
    <div className="flex items-center gap-2">
      {step && <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded shadow-lg shadow-primary/20">{step}</span>}
      <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">{title}</h3>
      {info && <InfoBubble text={info} />}
    </div>
  </div>
);

const Input = ({ 
  label, value, onChange, step = 0.1, unit, tooltip, min, error, info 
}: { 
  label: string, value: number, onChange: (v: number) => void, step?: number, unit?: string, tooltip?: string, min?: number, error?: string, info?: string 
}) => (
  <div className="flex flex-col gap-1.5 w-full" title={tooltip}>
    <div className="flex justify-between items-baseline px-0.5">
      <div className="flex items-center">
        <label className="text-[10px] font-black text-textDim uppercase tracking-widest truncate pr-1">{label}</label>
        {info && <InfoBubble text={info} />}
      </div>
      {error && <span className="text-[9px] text-error font-bold animate-pulse">{error}</span>}
    </div>
    <div className={`relative flex items-center bg-background border rounded-xl transition-all duration-200 h-11
      ${error ? 'border-error ring-2 ring-error/10' : 'border-border hover:border-textDim focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'}`}>
      <input 
        type="number" step={step} value={value} min={min}
        onChange={(e) => {
            const newVal = parseFloat(e.target.value);
            if (!isNaN(newVal)) onChange(newVal);
        }}
        className="w-full bg-transparent text-sm text-text font-mono px-4 outline-none h-full"
      />
      {unit && <span className="text-[10px] font-black text-textDim pr-4 select-none">{unit.toUpperCase()}</span>}
    </div>
  </div>
);

const Button = ({ 
    onClick, disabled, active, children, variant = 'primary', className = '', tooltip, isLoading
}: { 
    onClick: (e: any) => void, disabled?: boolean, active?: boolean, children?: React.ReactNode, variant?: 'primary' | 'secondary' | 'danger' | 'ghost', className?: string, tooltip?: string, isLoading?: boolean
}) => {
    let baseClass = "h-11 px-6 rounded-xl text-[11px] font-black tracking-widest transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 uppercase ";
    
    if (disabled) {
        baseClass += "bg-surfaceHighlight/50 text-textDim cursor-not-allowed grayscale ";
    } else if (variant === 'primary') {
        baseClass += active 
            ? "bg-primary text-white shadow-xl shadow-primary/30"
            : "bg-surfaceHighlight hover:bg-primary hover:text-white text-text shadow-md";
    } else if (variant === 'secondary') {
        baseClass += "bg-background border border-border text-text hover:border-primary hover:text-white shadow-sm";
    } else if (variant === 'ghost') {
        baseClass += "bg-transparent text-textDim hover:text-white hover:bg-surfaceHighlight/30";
    }

    return (
        <button onClick={onClick} disabled={disabled || isLoading} className={`${baseClass} ${className}`} title={tooltip}>
            {isLoading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
        </button>
    );
}

const CalibrationGuide = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-surface border border-border w-full max-w-4xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 border-t border-t-white/10">
        <div className="p-8 space-y-10 max-h-[90vh] overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-start">
             <div>
                <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">The Calibration Masterclass</h2>
                <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] mt-1">Why precision is the heart of 3D Lenticular</p>
             </div>
             <button onClick={onClose} className="p-3 bg-surfaceHighlight hover:bg-error/20 hover:text-error rounded-2xl transition-all">
                <XIcon className="w-6 h-6" />
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Column 1: Why it matters */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1 rounded-full w-fit">01. Why Calibrate?</h3>
              <p className="text-[11px] text-textDim leading-relaxed">
                Lenticular lenses are precision optics. A "60 LPI" lens is rarely exactly 60.00. It might be <strong className="text-white">60.12</strong> or <strong className="text-white">59.85</strong>.
              </p>
              <p className="text-[11px] text-textDim leading-relaxed">
                If your digital interlace doesn't match the physical lens <strong className="text-white">perfectly</strong>, the 3D effect will "ghost", jump, or display visible vertical bands. 
                Calibration finds the <strong className="text-primary">Optical Truth</strong> of your hardware.
              </p>
              <div className="p-4 bg-surfaceHighlight/30 rounded-2xl border border-border">
                <span className="text-[9px] font-black uppercase text-textDim block mb-2">The Golden Rule</span>
                <p className="text-[11px] italic text-white">Your interlace pitch must match your lens pitch to within 0.01 LPI for a smooth experience.</p>
              </div>
            </div>

            {/* Column 2: Visual Cues */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1 rounded-full w-fit">02. Visual Signals</h3>
              <div className="space-y-4">
                <div className="bg-background rounded-2xl p-4 border border-border group overflow-hidden">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertIcon className="w-4 h-4 text-error" />
                    <span className="text-[10px] font-black uppercase text-error tracking-widest">The Loser (Banding)</span>
                  </div>
                  <div className="h-12 w-full bg-gradient-to-r from-transparent via-error/5 to-transparent flex gap-1.5 items-center justify-center relative">
                     {[...Array(15)].map((_,i) => (
                       <div key={i} className="w-1.5 h-full bg-error/30 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}/>
                     ))}
                     <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
                  </div>
                  <p className="text-[10px] text-textDim mt-3 leading-tight">If you see dark vertical bars or "shimmering" as you rotate the lens, the pitch is incorrect.</p>
                </div>

                <div className="bg-background rounded-2xl p-4 border border-primary/30 group">
                  <div className="flex items-center gap-3 mb-3">
                    <EyeIcon className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">The Winner (Solid)</span>
                  </div>
                  <div className="h-12 w-full bg-primary/20 rounded-lg overflow-hidden flex items-center justify-center relative">
                     <div className="w-full h-full bg-primary/50 animate-pulse duration-[2000ms]" />
                     <EyeIcon className="absolute w-6 h-6 text-white/40" />
                  </div>
                  <p className="text-[10px] text-textDim mt-3 leading-tight">A perfectly solid field of color means every lenticule is magnifying the exact same sub-pixel. This is your target.</p>
                </div>
              </div>
            </div>

            {/* Column 3: Magnification */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1 rounded-full w-fit">03. Magnification</h3>
              <p className="text-[11px] text-textDim leading-relaxed">
                When you click a strip, we show a <strong className="text-white">Magnified View</strong>. This visualizes the digital sub-pixels behind your lens.
              </p>
              <div className="space-y-3">
                <div className="flex gap-2">
                   <div className="w-1/2 aspect-square bg-surfaceHighlight/50 rounded-xl border border-border flex flex-col items-center justify-center p-2 text-center">
                      <div className="w-8 h-8 flex gap-1 mb-2">
                        <div className="w-2 h-full bg-white/20" />
                        <div className="w-2 h-full bg-white/50" />
                        <div className="w-2 h-full bg-white/20" />
                      </div>
                      <span className="text-[8px] font-black uppercase">Low Density</span>
                      <span className="text-[8px] text-textDim">Fewer frames, easier to hit.</span>
                   </div>
                   <div className="w-1/2 aspect-square bg-primary/5 rounded-xl border border-primary/20 flex flex-col items-center justify-center p-2 text-center">
                      <div className="w-8 h-8 flex gap-[1px] mb-2">
                        {[...Array(8)].map((_,i) => <div key={i} className="w-1 h-full bg-primary/40" />)}
                      </div>
                      <span className="text-[8px] font-black uppercase text-primary">High Density</span>
                      <span className="text-[8px] text-textDim">More frames, ultra-precise pitch needed.</span>
                   </div>
                </div>
                <p className="text-[11px] text-textDim leading-relaxed italic">
                  Compare your winner against its neighbors. If the transition is "smooth", you are close. If it's "jagged", your step size is too large.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-3xl p-6 flex flex-col md:flex-row gap-6 items-center">
             <div className="flex-1 space-y-2">
                <h4 className="text-sm font-black uppercase tracking-widest text-white">Ready to perform the test?</h4>
                <p className="text-[11px] text-textDim leading-relaxed">
                  Place your lens vertically on the screen. Match the 10CM ruler below for physical accuracy. Click the strip that shows zero banding.
                </p>
             </div>
             <Button onClick={onClose} className="w-full md:w-48 h-14 shadow-2xl shadow-primary/40">ENTER LAB</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const MagnifiedStrip = ({ lpi, hppi, label, isActive }: { lpi: number, hppi: number, label: string, isActive?: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const magnification = 8;
    const pitchPx = (hppi / lpi) * magnification; 
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    
    // Draw enlarged lines to show pattern density clearly
    for (let x = 0; x < canvas.width; x += pitchPx) {
      ctx.fillRect(Math.round(x), 0, magnification / 2, canvas.height);
    }
  }, [lpi, hppi]);

  return (
    <div className={`flex flex-col items-center gap-3 p-4 rounded-3xl border transition-all duration-300 flex-1 min-w-[100px]
      ${isActive ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'bg-surfaceHighlight/20 border-border opacity-70 scale-95'}`}>
      <div className="relative group overflow-hidden rounded-2xl border border-border/50">
        <canvas ref={canvasRef} width={100} height={60} className="bg-white" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>
      <div className="text-center">
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] block mb-1 ${isActive ? 'text-primary' : 'text-textDim'}`}>{label}</span>
        <span className="text-sm font-mono font-bold text-white tracking-tight">{lpi.toFixed(4)}</span>
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [appMode, setAppMode] = useState<'compose' | 'calibration'>('compose');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // -- State --
  const [frames, setFrames] = useState<Frame[]>([]);
  const [imagesMap, setImagesMap] = useState<Map<string, HTMLImageElement>>(new Map());
  const [guideOpen, setGuideOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedLpiFromChart, setSelectedLpiFromChart] = useState<number | null>(null);
  const [showPixelGrid, setShowPixelGrid] = useState(false);
  const [showReferenceCard, setShowReferenceCard] = useState(false);

  const [jobSettings, setJobSettings] = useState<JobSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_JOB);
    if (saved) { try { return JSON.parse(saved); } catch(e) {} }
    return DEFAULT_PRESETS[0].job;
  });

  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>({
     centerLpi: 60.0,
     stripCount: 11,
     stepLpi: 0.1
  });

  const [screenScaleOffset, setScreenScaleOffset] = useState(1.0); 
  const [zoom, setZoom] = useState(0.5); 
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const handleModeChange = (mode: 'compose' | 'calibration') => {
    setAppMode(mode);
    setPan({ x: 0, y: 0 });
    setZoom(mode === 'calibration' ? 1.0 : 0.5);
    setOutputUrl(null);
    setSidebarOpen(false);
    setSelectedLpiFromChart(null);
  };

  const handleUseScreenPPI = () => {
    const ppi = window.devicePixelRatio * 96;
    setJobSettings(prev => ({ ...prev, hppi: ppi, vppi: ppi }));
    setZoom(1.0);
    setScreenScaleOffset(1.0);
  };

  const handleChartClick = (e: React.MouseEvent) => {
    if (appMode !== 'calibration' || !outputUrl) return;
    const rect = (e.target as HTMLImageElement).getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const imgHeight = rect.height;
    const stripIndex = Math.floor(clickY / (imgHeight / calibrationSettings.stripCount));
    const startLpi = calibrationSettings.centerLpi - (Math.floor(calibrationSettings.stripCount / 2) * calibrationSettings.stepLpi);
    const clickedLpi = startLpi + (stripIndex * calibrationSettings.stepLpi);
    setSelectedLpiFromChart(clickedLpi);
  };

  const applySelectedLpi = () => {
    if (selectedLpiFromChart !== null) {
      setJobSettings(prev => ({ ...prev, lpi: selectedLpiFromChart }));
      setAppMode('compose');
      setSelectedLpiFromChart(null);
    }
  };

  useEffect(() => { localStorage.setItem(STORAGE_KEY_JOB, JSON.stringify(jobSettings)); }, [jobSettings]);

  useEffect(() => {
    const timer = setTimeout(() => {
       if (appMode === 'compose') { if (frames.length >= 2) generate(); }
       else generate();
    }, 600);
    return () => clearTimeout(timer);
  }, [frames, jobSettings, calibrationSettings, appMode]);

  const generate = async () => {
    if (!canvasRef.current) return;
    setIsProcessing(true);
    try {
      let url = '';
      if (appMode === 'compose') url = await generateLenticularImage(frames, jobSettings, canvasRef.current, () => {}, imagesMap);
      else url = await generateCalibrationChart(jobSettings, calibrationSettings, canvasRef.current, () => {});
      setOutputUrl(url);
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); }
  };

  const processFiles = useCallback((fileList: FileList | File[]) => {
    Array.from(fileList).forEach((file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target!.result as string;
        const img = new Image();
        img.onload = () => {
          const id = Math.random().toString(36).substr(2, 9);
          setImagesMap(prev => new Map(prev).set(id, img));
          setFrames(prev => [...prev, { id, src, name: file.name, width: img.width, height: img.height, xOffset: 0, yOffset: 0 }]);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const renderComposeSidebar = () => (
    <>
        <section>
            <SectionHeader step="01" title="Sequence Setup" info="Upload your frames. These will be interleaved according to your pitch." />
            <div 
                className={`group relative p-6 min-h-[140px] border-2 border-dashed rounded-3xl transition-all duration-500 flex flex-col items-center justify-center gap-4
                ${isFileDragging ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border bg-background/50 hover:border-primary/40'}`}
                onDragEnter={(e) => { e.preventDefault(); setIsFileDragging(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setIsFileDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsFileDragging(false); processFiles(e.dataTransfer.files); }}
            >
                {frames.length === 0 ? (
                    <>
                        <UploadIcon className="w-8 h-8 text-textDim group-hover:text-primary transition-all"/>
                        <p className="text-[10px] font-black text-textDim text-center uppercase tracking-[0.2em]">Drop sequence or <span className="text-primary underline">Browse</span></p>
                    </>
                ) : (
                    <div className="flex gap-3 overflow-x-auto pb-4 w-full custom-scrollbar snap-x">
                        {frames.map((f) => (
                            <div key={f.id} className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-border shadow-md">
                                <img src={f.src} className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>

        <section className="space-y-6">
            <SectionHeader step="02" title="Project Dimensions" info="Set the physical output size." />
            <div className="grid grid-cols-2 gap-4 bg-background/50 p-5 rounded-3xl border border-border/50">
                <Input label="Width (mm)" value={jobSettings.widthMm} onChange={v => setJobSettings(p => ({...p, widthMm: v}))} unit="mm" />
                <Input label="Height (mm)" value={jobSettings.heightMm} onChange={v => setJobSettings(p => ({...p, heightMm: v}))} unit="mm" />
            </div>
            <div className="p-6 bg-primary/5 border border-primary/20 rounded-3xl space-y-4">
                 <Input label="Pitch (LPI)" value={jobSettings.lpi} onChange={v => setJobSettings(p => ({...p, lpi: v}))} step={0.01} info="The calibrated pitch of your lens." />
                 <p className="text-[10px] text-textDim leading-relaxed text-center px-4 italic">Pitch discovered in the Calibration tab.</p>
            </div>
        </section>
    </>
  );

  const renderCalibrationSidebar = () => (
    <>
        <section className="space-y-4">
            <SectionHeader step="01" title="Physical Scale Match" info="Lenticular calibration relies on exact 1:1 on-screen sizing." />
            <div className="bg-primary/5 border border-primary/20 rounded-[24px] p-5 space-y-4 shadow-inner">
                <div className="space-y-2">
                    <p className="text-[11px] text-white font-bold uppercase tracking-wider">How to verify 1:1 scale:</p>
                    <p className="text-[10px] text-textDim leading-relaxed">
                        1. Press <strong className="text-primary">SYNC PPI</strong> to auto-detect browser settings.<br/>
                        2. Place a <strong className="text-white">Credit Card</strong> or physical ruler against the screen.<br/>
                        3. Use the <strong className="text-white">Fine-Tune</strong> controls until they match perfectly.
                    </p>
                </div>

                <Button onClick={handleUseScreenPPI} variant="secondary" className="w-full text-[9px] h-10 border-primary/30 shadow-inner">
                    <RefreshIcon className="w-4 h-4"/> SYNC PPI
                </Button>
                
                <div className="space-y-3 pt-2 border-t border-primary/10">
                    <div className="flex justify-between items-center">
                        <p className="text-[10px] text-text font-black uppercase tracking-widest text-white">Scale Adjustment</p>
                        <button 
                            onClick={() => setShowReferenceCard(!showReferenceCard)}
                            className={`text-[8px] font-black px-2 py-0.5 rounded border transition-all ${showReferenceCard ? 'bg-primary text-white border-primary' : 'text-textDim border-border hover:border-primary'}`}
                        >
                            {showReferenceCard ? 'HIDE CARD' : 'SHOW CARD'}
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setScreenScaleOffset(s => Math.max(0.1, s-0.005))} className="p-3 bg-surfaceHighlight rounded-xl hover:bg-primary transition-colors text-white"><ChevronDown/></button>
                        <div className="flex-1 bg-background h-10 rounded-xl flex items-center justify-center font-mono text-sm border border-border shadow-inner text-white">
                            {(screenScaleOffset * 100).toFixed(1)}%
                        </div>
                        <button onClick={() => setScreenScaleOffset(s => Math.min(2.0, s+0.005))} className="p-3 bg-surfaceHighlight rounded-xl hover:bg-primary transition-colors text-white"><ChevronUp/></button>
                    </div>
                </div>
            </div>
        </section>

        <section className="space-y-6">
            <SectionHeader step="02" title="Test Parameters" />
            <div className="bg-background/50 p-6 rounded-3xl border border-border/50 space-y-6">
                 <Input 
                    label="Rated LPI" 
                    value={calibrationSettings.centerLpi} 
                    onChange={v => setCalibrationSettings(p => ({...p, centerLpi: v}))} 
                    step={0.01} 
                    info="Starting pitch for the test. Usually specified by the lens manufacturer (e.g. 60.0, 75.0)." 
                 />
                 <div className="grid grid-cols-2 gap-4">
                    <Input 
                        label="Variance" 
                        value={calibrationSettings.stripCount} 
                        onChange={v => setCalibrationSettings(p => ({...p, stripCount: Math.max(1, v)}))} 
                        step={1} 
                        info="Number of test strips to display. More strips cover a wider range of values." 
                    />
                    <Input 
                        label="Step LPI" 
                        value={calibrationSettings.stepLpi} 
                        onChange={v => setCalibrationSettings(p => ({...p, stepLpi: v}))} 
                        step={0.005} 
                        info="The increment between each strip. Lower values give higher precision." 
                    />
                 </div>
                 
                 <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-10 h-6 rounded-full transition-all relative border ${showPixelGrid ? 'bg-primary border-primary' : 'bg-surfaceHighlight border-border'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showPixelGrid ? 'left-5' : 'left-1'}`} />
                        </div>
                        <input type="checkbox" className="hidden" checked={showPixelGrid} onChange={() => setShowPixelGrid(!showPixelGrid)} />
                        <span className="text-[10px] font-black text-textDim uppercase tracking-widest group-hover:text-text transition-colors">Pixel Grid Overlay</span>
                        <InfoBubble text="Shows individual logical pixel boundaries of the test pattern. Helpful for checking sub-pixel alignment." />
                    </label>
                 </div>
            </div>
        </section>

        <section className="bg-surfaceHighlight/20 p-6 rounded-3xl border border-border space-y-4">
            <SectionHeader title="Calibration Checklist" />
            <div className="space-y-3">
                {[
                    "Verified 1:1 physical zoom",
                    "Lens is oriented vertically",
                    "Screen is viewed at eye-level",
                    "Identify perfectly solid strip"
                ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                        <span className="text-[10px] text-textDim font-bold uppercase tracking-wider leading-tight">{item}</span>
                    </div>
                ))}
            </div>
        </section>

        <Button onClick={() => setGuideOpen(true)} variant="ghost" className="w-full text-[9px] border border-border h-9">VIEW VISUAL GUIDE</Button>
    </>
  );

  return (
    <div className="h-[100dvh] w-screen font-sans text-text bg-background flex flex-col overflow-hidden" onClick={() => setShowExportMenu(false)}>
      
      {/* Header */}
      <header className="bg-surface/90 backdrop-blur-xl border-b border-border h-16 md:h-20 px-4 md:px-8 flex items-center justify-between shrink-0 z-[80] gap-4">
        <div className="flex items-center gap-3 md:gap-4">
           <div className="w-9 h-9 md:w-11 md:h-11 bg-primary rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20 shrink-0">
             <LayoutIcon className="w-5 h-5 md:w-7 md:h-7"/>
           </div>
           <div className="flex flex-col">
              <h1 className="text-sm md:text-lg font-black tracking-tight leading-none uppercase italic text-white">Lenticular Lab</h1>
           </div>
        </div>

        <div className="hidden lg:flex flex-1 justify-center max-w-md mx-8">
            <div className="flex w-full bg-background p-1 rounded-2xl border border-border gap-1 shadow-inner">
                <button className={`flex-1 py-2 text-[11px] font-black rounded-xl transition-all ${appMode === 'compose' ? 'bg-primary text-white shadow-lg' : 'text-textDim hover:text-white'}`} onClick={() => handleModeChange('compose')}>COMPOSER</button>
                <button className={`flex-1 py-2 text-[11px] font-black rounded-xl transition-all ${appMode === 'calibration' ? 'bg-primary text-white shadow-lg' : 'text-textDim hover:text-white'}`} onClick={() => handleModeChange('calibration')}>PITCH TEST</button>
            </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3">
             <button onClick={(e) => { e.stopPropagation(); setSidebarOpen(!sidebarOpen); }} className={`lg:hidden p-2.5 rounded-xl border transition-all ${sidebarOpen ? 'bg-primary border-primary text-white' : 'bg-surfaceHighlight/50 border-border text-text'}`}>
                 <SettingsIcon className="w-5 h-5"/>
             </button>
             <div className="relative">
                 <Button onClick={(e: any) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }} disabled={!outputUrl || isProcessing} variant="primary" className="h-10 md:h-12 px-4 md:px-8 shadow-lg shadow-primary/30">
                     <DownloadIcon className="w-4 h-4 md:w-5 md:h-5" /> <span className="hidden sm:inline">EXPORT</span>
                 </Button>
                 {showExportMenu && (
                     <div className="absolute top-full right-0 mt-3 w-56 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-[90] animate-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
                         <button className="w-full px-5 py-4 text-left text-[11px] font-black hover:bg-surfaceHighlight transition-colors flex items-center justify-between" onClick={() => { const l = document.createElement('a'); l.download = 'interlaced.png'; l.href = outputUrl!; l.click(); setShowExportMenu(false); }}>PNG (WEB) <DownloadIcon className="w-4 h-4 opacity-50"/></button>
                         <button className="w-full px-5 py-4 text-left text-[11px] font-black hover:bg-surfaceHighlight border-t border-border transition-colors flex items-center justify-between" onClick={async () => { if (!canvasRef.current) return; const b = createTiffBlob(canvasRef.current.getContext('2d')!, jobSettings.hppi, jobSettings.vppi); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.download = 'interlaced.tif'; l.href = u; l.click(); URL.revokeObjectURL(u); setShowExportMenu(false); }}>TIFF (PRINT) <DownloadIcon className="w-4 h-4 opacity-50"/></button>
                     </div>
                 )}
             </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Overlay (Mobile) */}
        {!isDesktop && sidebarOpen && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[90]" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`fixed lg:relative inset-y-0 left-0 z-[100] bg-surface border-r border-border transition-transform duration-500 ease-in-out shrink-0 w-[85vw] max-w-[400px] lg:w-[380px] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-full flex flex-col pt-20 lg:pt-0">
             <div className="lg:hidden absolute top-4 right-4 p-4" onClick={() => setSidebarOpen(false)}><XIcon className="w-6 h-6 text-textDim"/></div>
             <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8 md:py-10 space-y-10 custom-scrollbar">
                <div className="lg:hidden mb-6">
                    <h2 className="text-xl font-black italic uppercase tracking-wider text-primary">Settings</h2>
                    <p className="text-[10px] font-black uppercase tracking-widest text-textDim mt-1">Fine-tune optical parameters</p>
                </div>
                {appMode === 'compose' ? renderComposeSidebar() : renderCalibrationSidebar()}
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col relative bg-background min-w-0 pb-16 lg:pb-0">
           <div 
             className="flex-1 relative overflow-hidden flex items-center justify-center checkboard-bg touch-none"
             ref={previewContainerRef}
             onMouseDown={(e) => { if(!outputUrl) return; setIsDragging(true); setDragStart({x: e.clientX-pan.x, y: e.clientY-pan.y}); }}
             onMouseMove={(e) => { if (isDragging) setPan({x: e.clientX-dragStart.x, y: e.clientY-dragStart.y}); }}
             onMouseUp={() => setIsDragging(false)}
             onWheel={(e) => { if(isProcessing) return; setZoom(z => Math.max(0.01, Math.min(10, z * (1 - e.deltaY * 0.001)))); }}
           >
              {isProcessing && (
                  <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-xl flex flex-col items-center justify-center gap-6 md:gap-8 p-6 text-center animate-in fade-in">
                      <div className="w-16 h-16 md:w-20 md:h-20 border-[6px] md:border-8 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                      <div className="space-y-2">
                          <h3 className="text-base md:text-lg font-black text-white uppercase tracking-[0.4em] italic">Interlacing</h3>
                          <p className="text-[9px] md:text-[10px] text-primary font-black uppercase animate-pulse">Rasterizing Optical Field</p>
                      </div>
                  </div>
              )}

              {/* Physical Verification Overlays */}
              {appMode === 'calibration' && (
                  <div className="absolute inset-x-0 bottom-4 md:bottom-8 z-30 pointer-events-none flex flex-col items-center gap-4 px-4">
                      {/* Credit Card Scale Guide */}
                      {showReferenceCard && (
                          <div 
                              className="bg-white/10 backdrop-blur-md rounded-[12px] border-2 border-primary/40 flex flex-col items-center justify-center relative shadow-2xl animate-in slide-in-from-bottom-5"
                              style={{
                                  width: `${(85.6 / 25.4) * jobSettings.hppi * zoom * screenScaleOffset}px`,
                                  height: `${(53.98 / 25.4) * jobSettings.hppi * zoom * screenScaleOffset}px`
                              }}
                          >
                              <div className="absolute top-2 left-3 text-[10px] font-black text-primary uppercase opacity-50">CREDIT CARD MATCH</div>
                              <div className="w-[80%] h-[1px] bg-primary/20" />
                              <div className="text-[8px] font-black text-primary/40 uppercase mt-1">Place card here to match size</div>
                          </div>
                      )}

                      {/* Ruler */}
                      <div className="bg-surface/90 backdrop-blur-xl p-4 md:p-5 rounded-2xl md:rounded-3xl border border-white/10 shadow-2xl space-y-3 md:space-y-4 w-full max-w-2xl animate-in slide-in-from-bottom-10">
                          <div className="flex justify-between items-center px-1">
                              <p className="text-[9px] md:text-[10px] font-black text-white uppercase tracking-[0.2em]">Scale Check (10 CM)</p>
                              <p className="hidden sm:block text-[9px] text-primary font-black uppercase tracking-widest animate-pulse">Match to physical ruler</p>
                          </div>
                          <div className="relative h-10 md:h-12 bg-white rounded-lg md:rounded-xl overflow-hidden flex items-end">
                              <div className="h-full bg-primary/10 border-r-2 border-primary transition-all" style={{ width: `${(100 / 25.4) * jobSettings.hppi * zoom * screenScaleOffset}px` }} />
                              <div className="absolute inset-0 pointer-events-none flex">
                                 {[...Array(11)].map((_, i) => (
                                     <div key={i} className="h-full border-l border-primary/20" style={{ width: `${(10 / 25.4) * jobSettings.hppi * zoom * screenScaleOffset}px` }}>
                                         <span className="text-[8px] font-black text-black/20 ml-1 mt-1 block">{i}</span>
                                     </div>
                                 ))}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              <div className="transition-all duration-700 w-full h-full flex items-center justify-center">
                  {outputUrl ? (
                      <div className="relative group">
                          <div 
                            style={{ 
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom * screenScaleOffset})`, 
                                imageRendering: 'pixelated',
                            }} 
                            className="shadow-2xl bg-white origin-center relative cursor-crosshair overflow-hidden"
                          >
                              <img src={outputUrl} className="max-w-none block" onClick={handleChartClick} />
                              
                              {/* Pixel Grid Overlay */}
                              {appMode === 'calibration' && showPixelGrid && (
                                <div 
                                    className="absolute inset-0 pointer-events-none opacity-40 z-20"
                                    style={{
                                        backgroundImage: `linear-gradient(to right, rgba(59, 130, 246, 0.6) 0.5px, transparent 0.5px)`,
                                        backgroundSize: `1px 100%`
                                    }}
                                />
                              )}

                              {/* Selected Strip Highlight */}
                              {appMode === 'calibration' && selectedLpiFromChart && (
                                <div 
                                  className="absolute left-0 w-full bg-primary/30 border-y-4 border-primary pointer-events-none z-10 transition-all duration-300 animate-glow-pulse overflow-hidden"
                                  style={{
                                    height: `${100 / calibrationSettings.stripCount}%`,
                                    top: `${(() => {
                                      const startLpi = calibrationSettings.centerLpi - (Math.floor(calibrationSettings.stripCount / 2) * calibrationSettings.stepLpi);
                                      const index = Math.round((selectedLpiFromChart - startLpi) / calibrationSettings.stepLpi);
                                      return (index / calibrationSettings.stripCount) * 100;
                                    })()}%`
                                  }}
                                >
                                    {/* Shimmer Effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer pointer-events-none" />
                                    
                                    <div className="absolute top-0 right-0 h-full flex items-center pr-4">
                                        <div className="bg-primary text-white text-[10px] font-black px-3 py-1 rounded-full shadow-xl uppercase tracking-tighter scale-75 origin-right animate-bounce duration-[1500ms]">SELECTED PITCH</div>
                                    </div>
                                </div>
                              )}
                          </div>

                          {appMode === 'calibration' && selectedLpiFromChart && (
                             <div className="fixed inset-0 lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 z-[110] p-4 md:p-6 flex items-center justify-center pointer-events-none">
                                 <div className="bg-surface/95 backdrop-blur-xl p-6 md:p-10 rounded-[32px] md:rounded-[48px] border border-white/20 shadow-2xl flex flex-col items-center gap-8 w-full max-w-2xl pointer-events-auto animate-in zoom-in-95 duration-300">
                                     <div className="text-center space-y-2">
                                         <div className="flex items-center justify-center gap-2 text-primary">
                                             <EyeIcon className="w-4 h-4" />
                                             <p className="text-[10px] font-black uppercase tracking-[0.4em]">Optical Winner Confirmation</p>
                                         </div>
                                         <h3 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter">{selectedLpiFromChart.toFixed(4)} <span className="text-xl not-italic text-textDim ml-1">LPI</span></h3>
                                     </div>

                                     {/* Magnified Comparison Area */}
                                     <div className="w-full space-y-4">
                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[9px] font-black text-textDim uppercase tracking-widest">Neighbor Analysis</span>
                                            <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest">Step: {calibrationSettings.stepLpi}</span>
                                        </div>
                                        <div className="flex gap-3 w-full overflow-hidden">
                                            <MagnifiedStrip 
                                              lpi={selectedLpiFromChart - calibrationSettings.stepLpi} 
                                              hppi={jobSettings.hppi} 
                                              label="Slightly Under" 
                                            />
                                            <MagnifiedStrip 
                                              lpi={selectedLpiFromChart} 
                                              hppi={jobSettings.hppi} 
                                              label="Current Winner" 
                                              isActive 
                                            />
                                            <MagnifiedStrip 
                                              lpi={selectedLpiFromChart + calibrationSettings.stepLpi} 
                                              hppi={jobSettings.hppi} 
                                              label="Slightly Over" 
                                            />
                                        </div>
                                     </div>

                                     <div className="bg-surfaceHighlight/20 p-5 rounded-3xl border border-border w-full text-center">
                                         <p className="text-[11px] text-textDim leading-relaxed">
                                             The <strong className="text-white">Winner</strong> should appear as a perfectly solid color through your lens. 
                                             If these neighbors look similar, try a smaller step size.
                                         </p>
                                     </div>

                                     <div className="flex gap-4 w-full">
                                         <Button variant="secondary" onClick={() => setSelectedLpiFromChart(null)} className="flex-1 h-14 text-[11px] rounded-2xl">BACK TO CHART</Button>
                                         <Button onClick={applySelectedLpi} className="flex-1 h-14 text-[11px] bg-primary text-white shadow-xl shadow-primary/30 rounded-2xl">APPLY FINAL PITCH</Button>
                                     </div>
                                 </div>
                             </div>
                          )}
                      </div>
                  ) : (
                      <div className="flex flex-col items-center opacity-20 text-center px-12 gap-4 md:gap-6">
                          <LayoutIcon className="w-16 h-16 md:w-24 md:h-24 text-textDim"/>
                          <p className="text-sm md:text-xl font-black uppercase tracking-[0.5em] italic">Awaiting Input</p>
                      </div>
                  )}
              </div>
           </div>

           {/* Viewport Controls */}
           {outputUrl && !isProcessing && (
               <div className="absolute top-4 right-4 md:top-8 md:right-8 flex flex-col gap-2 md:gap-3 z-30">
                   <div className="bg-surface/80 backdrop-blur-xl p-1.5 md:p-2 rounded-xl md:rounded-2xl border border-border flex flex-col gap-1.5 md:gap-2 shadow-2xl">
                    <button title="Zoom In" onClick={() => setZoom(z => Math.min(z*1.2, 10))} className="w-10 h-10 md:w-12 md:h-12 bg-surfaceHighlight/50 hover:bg-primary text-white rounded-lg md:rounded-xl flex items-center justify-center transition-all"><ZoomInIcon className="w-5 h-5"/></button>
                    <button title="Zoom Out" onClick={() => setZoom(z => Math.max(z/1.2, 0.01))} className="w-10 h-10 md:w-12 md:h-12 bg-surfaceHighlight/50 hover:bg-primary text-white rounded-lg md:rounded-xl flex items-center justify-center transition-all"><ZoomOutIcon className="w-5 h-5"/></button>
                    <button title="Reset View" onClick={() => {setPan({x:0,y:0}); setZoom(appMode === 'calibration' ? 1.0 : 0.5); setScreenScaleOffset(1.0);}} className="w-10 h-10 md:w-12 md:h-12 bg-surfaceHighlight/50 hover:bg-primary text-white rounded-lg md:rounded-xl flex items-center justify-center transition-all"><RefreshIcon className="w-5 h-5"/></button>
                   </div>
               </div>
           )}

           {/* Bottom Nav (Mobile) */}
           <div className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-surface border-t border-border flex items-stretch z-[90]">
                <button className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${appMode === 'compose' ? 'text-primary' : 'text-textDim'}`} onClick={() => handleModeChange('compose')}>
                    <LayoutIcon className="w-5 h-5"/>
                    <span className="text-[9px] font-black uppercase tracking-widest">Composer</span>
                </button>
                <button className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${appMode === 'calibration' ? 'text-primary' : 'text-textDim'}`} onClick={() => handleModeChange('calibration')}>
                    <EyeIcon className="w-5 h-5"/>
                    <span className="text-[9px] font-black uppercase tracking-widest">Pich Test</span>
                </button>
           </div>
        </main>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      <CalibrationGuide isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
