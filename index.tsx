import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { UploadIcon, DownloadIcon, PlayIcon, PauseIcon, RefreshIcon, TrashIcon, ZoomInIcon, ZoomOutIcon, EyeIcon, LayoutIcon, SettingsIcon, AlertIcon, SwapIcon, ChevronUp, ChevronDown, MenuIcon, XIcon, ArrowLeftIcon, ArrowRightIcon } from './icons';
import { Frame, JobSettings, PhysicsSettings, Unit, CalibrationSettings, Preset } from './types';
import { calculateFOV, renderSimulationFrame } from './physics';
import { generateLenticularImage, generateCalibrationChart, createTiffBlob } from './lenticular-engine';

// --- Helpers ---
const convertFromMm = (mm: number, unit: Unit): number => {
  if (unit === 'cm') return parseFloat((mm / 10).toFixed(3));
  if (unit === 'in') return parseFloat((mm / 25.4).toFixed(3));
  return parseFloat(mm.toFixed(2));
};

const convertToMm = (val: number, unit: Unit): number => {
  if (unit === 'cm') return val * 10;
  if (unit === 'in') return val * 25.4;
  return val;
};

// Hook for media query
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
    },
    {
        id: '40lpi-large',
        name: '40 LPI Large Format (720 DPI)',
        job: {
            unit: 'mm', widthMm: 200, heightMm: 200, hppi: 720, vppi: 720, lpi: 40,
            marginTopMm: 5, marginBottomMm: 5, marginLeftMm: 0, marginRightMm: 0,
            alignmentPos: 'external', direction: 'LR'
        },
        physics: { radiusMicrons: 400, thicknessMicrons: 800, refractiveIndex: 1.56, viewingDistanceMm: 1000 }
    }
];

// --- Condensed UI Components ---

const Input = ({ 
  label, value, onChange, step = 0.1, unit, tooltip, min, error 
}: { 
  label: string, value: number, onChange: (v: number) => void, step?: number, unit?: string, tooltip?: string, min?: number, error?: string 
}) => (
  <div className="flex flex-col gap-1 w-full" title={tooltip}>
    <div className="flex justify-between items-baseline px-0.5">
      <label className="text-[10px] font-semibold text-textDim uppercase tracking-wide truncate pr-1">{label}</label>
      {error && <span className="text-[9px] text-error font-medium truncate">{error}</span>}
    </div>
    <div className={`relative flex items-center bg-background border rounded transition-colors h-9
      ${error ? 'border-error/50' : 'border-border hover:border-textDim focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'}`}>
      <input 
        type="number" step={step} value={value} min={min}
        onChange={(e) => {
            const newVal = parseFloat(e.target.value);
            if (!isNaN(newVal)) onChange(newVal);
        }}
        className="w-full bg-transparent text-xs text-text font-mono px-2 outline-none h-full"
      />
      {unit && <span className="text-[10px] text-textDim font-medium pr-2 pointer-events-none select-none">{unit}</span>}
    </div>
  </div>
);

const Select = ({ 
    label, value, options, onChange 
}: { 
    label: string, value: string, options: {value: string, label: string}[], onChange: (val: string) => void 
}) => (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-semibold text-textDim uppercase tracking-wide px-0.5">{label}</label>
      <div className="relative h-9">
          <select 
              value={value} 
              onChange={e => onChange(e.target.value)}
              className="w-full h-full bg-background border border-border rounded text-xs text-text px-2 outline-none appearance-none hover:border-textDim focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
          >
              {options.map(o => <option key={o.value} value={o.value} className="bg-background">{o.label}</option>)}
          </select>
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-textDim">
             <ChevronDown className="w-3 h-3" />
          </div>
      </div>
    </div>
);

const Button = ({ 
    onClick, disabled, active, children, variant = 'primary', className = '' 
}: { 
    onClick: (e: any) => void, disabled?: boolean, active?: boolean, children?: React.ReactNode, variant?: 'primary' | 'secondary' | 'danger' | 'ghost', className?: string 
}) => {
    let baseClass = "h-9 px-4 rounded text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-1.5 touch-manipulation ";
    
    if (disabled) {
        baseClass += "bg-surfaceHighlight text-textDim opacity-50 cursor-not-allowed ";
    } else if (variant === 'primary') {
        baseClass += active 
            ? "bg-primary text-white shadow-sm "
            : "bg-surfaceHighlight hover:bg-primary hover:text-white text-text shadow-sm ";
    } else if (variant === 'secondary') {
        baseClass += active
            ? "bg-textDim text-background "
            : "bg-transparent border border-border text-text hover:bg-surfaceHighlight ";
    } else if (variant === 'danger') {
        baseClass += "bg-transparent border border-error/30 text-error hover:bg-error hover:text-white ";
    } else if (variant === 'ghost') {
        baseClass += active ? "bg-surfaceHighlight text-white" : "bg-transparent text-textDim hover:text-text hover:bg-surfaceHighlight/50 ";
    }

    return (
        <button onClick={onClick} disabled={disabled} className={`${baseClass} ${className}`}>
            {children}
        </button>
    );
}

// --- Main App ---

const App = () => {
  const [appMode, setAppMode] = useState<'compose' | 'calibration'>('compose');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // -- Data State --
  const [frames, setFrames] = useState<Frame[]>([]);
  const [imagesMap, setImagesMap] = useState<Map<string, HTMLImageElement>>(new Map());
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  
  // -- Presets --
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [activePresetId, setActivePresetId] = useState<string>('');
  
  useEffect(() => {
      const saved = localStorage.getItem('lenticular_presets');
      if (saved) {
          try {
              setPresets([...DEFAULT_PRESETS, ...JSON.parse(saved)]);
          } catch(e) {}
      }
  }, []);

  // -- Job Parameters --
  const [jobSettings, setJobSettings] = useState<JobSettings>(DEFAULT_PRESETS[0].job);

  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>({
     centerLpi: 60.0,
     stripCount: 11,
     stepLpi: 0.1
  });

  const [physicsSettings, setPhysicsSettings] = useState<PhysicsSettings>(DEFAULT_PRESETS[0].physics);

  // -- UI State --
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'print' | 'simulation'>('print');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Drag & Drop
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [isFileDragging, setIsFileDragging] = useState(false);
  
  // Simulation
  const [simX, setSimX] = useState(0.5); 
  const [autoPlay, setAutoPlay] = useState(true);

  // Panel
  const [panelPos, setPanelPos] = useState({ x: 20, y: 20 });
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const [panelDragOffset, setPanelDragOffset] = useState({ x: 0, y: 0 });

  // Preview
  const [zoom, setZoom] = useState(0.5); 
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // -- Derived --
  const fovDegrees = useMemo(() => 
    calculateFOV(jobSettings.lpi, physicsSettings.radiusMicrons, physicsSettings.thicknessMicrons, physicsSettings.refractiveIndex),
  [jobSettings.lpi, physicsSettings]);

  const hasErrors = Object.keys(errors).length > 0;
  const selectedFrame = useMemo(() => frames.find(f => f.id === selectedFrameId), [frames, selectedFrameId]);

  const simulationImages = useMemo(() => {
    return frames.map(f => imagesMap.get(f.id)).filter((img): img is HTMLImageElement => img !== undefined);
  }, [frames, imagesMap]);

  // -- Effects --
  useEffect(() => {
    let active = true;
    frames.forEach(frame => {
       if (!imagesMap.has(frame.id)) {
          const img = new Image();
          img.src = frame.src;
          img.onload = () => {
             if (active) {
                setImagesMap(prev => {
                   if (prev.has(frame.id)) return prev;
                   const next = new Map(prev);
                   next.set(frame.id, img);
                   return next;
                });
             }
          };
       }
    });
    return () => { active = false; };
  }, [frames, imagesMap]);

  useEffect(() => {
    if (hasErrors) return;
    const timer = setTimeout(() => {
       if (appMode === 'compose') {
          if (frames.length >= 2) generate();
       } else {
          generate();
       }
    }, 600);
    return () => clearTimeout(timer);
  }, [frames, jobSettings, calibrationSettings, appMode, hasErrors]);

  useEffect(() => {
    if (activeTab !== 'simulation' || simulationImages.length === 0 || !simCanvasRef.current) return;

    let animId: number;
    let startTime = Date.now();
    
    // Reduce resolution for high-DPI simulation to maintain performance with pixel effects
    const renderWidth = 800;
    const renderHeight = 600; 

    const render = () => {
      const cvs = simCanvasRef.current;
      if (!cvs) return;
      
      // Ensure canvas internal resolution is manageable for pixel manipulation
      if (cvs.width !== renderWidth) cvs.width = renderWidth;
      if (cvs.height !== renderHeight) cvs.height = renderHeight;
      
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      let currentX = simX;
      if (autoPlay) {
        const duration = 3000;
        const elapsed = (Date.now() - startTime) % duration;
        const t = elapsed / duration;
        currentX = t < 0.5 ? t * 2 : 2 - (t * 2);
      } else {
        startTime = Date.now(); 
      }

      renderSimulationFrame(ctx, cvs.width, cvs.height, simulationImages, jobSettings, physicsSettings, currentX);

      if (autoPlay) {
         animId = requestAnimationFrame(render);
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [activeTab, simulationImages, simX, autoPlay, jobSettings, physicsSettings]);

  // Sidebar Resize Effect
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (isResizingSidebar) {
            const newWidth = Math.max(280, Math.min(600, e.clientX));
            setSidebarWidth(newWidth);
        }
    };
    const handleGlobalMouseUp = () => {
        setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        document.body.style.cursor = 'col-resize';
    } else {
        document.body.style.cursor = '';
    }

    return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        document.body.style.cursor = '';
    };
  }, [isResizingSidebar]);


  // -- Handlers --
  const handleModeChange = (mode: 'compose' | 'calibration') => {
    setAppMode(mode);
    if (mode === 'calibration') setActiveTab('print');
    setMobileMenuOpen(false);
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
          setImagesMap(prev => {
             const next = new Map(prev);
             next.set(id, img);
             return next;
          });
          setFrames(prev => {
            const newFrames = [...prev, {
              id: id, src: src, name: file.name, width: img.width, height: img.height, xOffset: 0, yOffset: 0
            }];
            if (prev.length === 0) {
               return newFrames.sort((a, b) => {
                 const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
                 const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
                 return numA - numB;
               });
            }
            return newFrames;
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOverItem = (e: React.DragEvent, index: number) => { 
    if (draggedItemIndex !== null) {
      e.preventDefault(); 
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move"; 
    }
  };

  const handleDropItem = (e: React.DragEvent, targetIndex: number) => {
     if (draggedItemIndex !== null) {
         e.preventDefault();
         e.stopPropagation();
         
         if (draggedItemIndex === targetIndex) {
            setDraggedItemIndex(null);
            return;
         }

         const newFrames = [...frames];
         const item = newFrames[draggedItemIndex];
         newFrames.splice(draggedItemIndex, 1);
         newFrames.splice(targetIndex, 0, item);
         setFrames(newFrames);
         setDraggedItemIndex(null);
     }
  };

  const handleDragEnd = () => { 
      setDraggedItemIndex(null); 
      setIsFileDragging(false);
  };

  const handleContainerDragEnter = (e: React.DragEvent) => {
      if (draggedItemIndex === null) {
          e.preventDefault();
          e.stopPropagation();
          setIsFileDragging(true);
      }
  };

  const handleContainerDragOver = (e: React.DragEvent) => { 
      if (draggedItemIndex === null) {
          e.preventDefault(); 
          e.stopPropagation(); 
          e.dataTransfer.dropEffect = 'copy';
          setIsFileDragging(true); 
      }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => { 
      if (draggedItemIndex === null) {
        e.preventDefault(); 
        e.stopPropagation(); 
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsFileDragging(false); 
      }
  };

  const handleContainerDrop = (e: React.DragEvent) => {
     if (draggedItemIndex === null) {
        e.preventDefault(); 
        e.stopPropagation(); 
        setIsFileDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
     }
  };

  const moveFrame = (id: string, direction: -1 | 1) => {
      const idx = frames.findIndex(f => f.id === id);
      if (idx === -1) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= frames.length) return;
      
      const newFrames = [...frames];
      const temp = newFrames[idx];
      newFrames[idx] = newFrames[targetIdx];
      newFrames[targetIdx] = temp;
      setFrames(newFrames);
  };
  
  const handleSimMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
     if (isPanelDragging) return;
     if (activeTab === 'simulation' && !autoPlay) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setSimX(x);
     }
  };

  const handleJobSettingChange = (key: keyof JobSettings, value: any) => {
     setJobSettings(prev => ({ ...prev, [key]: value }));
     setActivePresetId(''); // clear preset selection on manual change
  };
  const handlePhysicsSettingChange = (key: keyof PhysicsSettings, value: any) => {
    setPhysicsSettings(prev => ({ ...prev, [key]: value }));
    setActivePresetId('');
 };
 const handleUnitChange = (u: Unit) => {
    setJobSettings(prev => ({ ...prev, unit: u }));
 };
  const handleReverseFrames = () => { setFrames(prev => [...prev].reverse()); };

  const handleUseScreenPPI = () => {
    const screenPPI = window.devicePixelRatio * 96;
    setJobSettings(prev => ({ ...prev, hppi: screenPPI, vppi: screenPPI }));
  };

  const handlePresetChange = (id: string) => {
      const p = presets.find(x => x.id === id);
      if (p) {
          setJobSettings({ ...p.job });
          setPhysicsSettings({ ...p.physics });
          setActivePresetId(id);
      }
  };

  const handleSavePreset = () => {
      const name = prompt("Enter preset name:");
      if (name) {
          const newPreset: Preset = {
              id: Math.random().toString(36).substr(2, 9),
              name,
              job: { ...jobSettings },
              physics: { ...physicsSettings }
          };
          const updated = [...presets.filter(p => !DEFAULT_PRESETS.find(d => d.id === p.id)), newPreset];
          setPresets([...DEFAULT_PRESETS, ...updated]);
          localStorage.setItem('lenticular_presets', JSON.stringify(updated));
          setActivePresetId(newPreset.id);
      }
  };

  const handleFrameOffsetChange = (axis: 'x' | 'y', val: number) => {
      if (!selectedFrameId) return;
      setFrames(prev => prev.map(f => f.id === selectedFrameId ? { ...f, [axis === 'x' ? 'xOffset' : 'yOffset']: val } : f));
  };

  const generate = async () => {
    if (!canvasRef.current || hasErrors) return;
    setIsProcessing(true);

    try {
      let url = '';
      if (appMode === 'compose') {
          url = await generateLenticularImage(frames, jobSettings, canvasRef.current, (msg) => {}, imagesMap);
      } else {
          url = await generateCalibrationChart(jobSettings, calibrationSettings, canvasRef.current, (msg) => {});
      }
      setOutputUrl(url);
      if (!outputUrl) { 
        setZoom(0.5); 
        setPan({ x: 0, y: 0 }); 
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDownload = (format: 'png' | 'tiff') => {
     if (!canvasRef.current || hasErrors) return;
     
     if (format === 'tiff') {
         const ctx = canvasRef.current.getContext('2d');
         if (!ctx) return;
         const blob = createTiffBlob(ctx, jobSettings.hppi, jobSettings.vppi);
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `lenticular_print_${jobSettings.lpi}lpi.tif`;
         a.click();
         URL.revokeObjectURL(url);
     } else {
         const url = canvasRef.current.toDataURL('image/png', 1.0);
         const a = document.createElement('a');
         a.href = url;
         a.download = `lenticular_print_${jobSettings.lpi}lpi.png`;
         a.click();
     }
     setShowExportMenu(false);
  };

  const handlePanelHeaderMouseDown = (e: React.MouseEvent) => {
    if (!isDesktop) return; // Disable dragging on mobile
    e.stopPropagation();
    setIsPanelDragging(true);
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    setPanelDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!outputUrl || activeTab !== 'print') return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanelDragging && previewContainerRef.current && isDesktop) {
        const bounds = previewContainerRef.current.getBoundingClientRect();
        let x = e.clientX - bounds.left - panelDragOffset.x;
        let y = e.clientY - bounds.top - panelDragOffset.y;
        x = Math.max(0, Math.min(x, bounds.width - 100));
        y = Math.max(0, Math.min(y, bounds.height - 30));
        setPanelPos({ x, y });
        return;
    }
    if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => {
      setIsDragging(false);
      setIsPanelDragging(false);
  };
  const handleWheel = (e: React.WheelEvent) => {
    if (activeTab !== 'print' || !outputUrl) return;
    const scaleFactor = 0.0015;
    const newZoom = Math.max(0.05, Math.min(5, zoom * (1 - e.deltaY * scaleFactor)));
    setZoom(newZoom);
  };

  // --- Render Sections ---

  const renderJobInput = (label: string, field: keyof JobSettings, step: number = 0.1, unitDisplay?: string, tooltip?: string, min?: number) => {
      const val = jobSettings[field] as number;
      const isDim = field === 'widthMm' || field === 'heightMm' || field === 'marginTopMm';
      const displayVal = isDim ? convertFromMm(val, jobSettings.unit) : val;
      const u = unitDisplay || (isDim ? jobSettings.unit : '');

      return (
        <Input 
            label={label} value={displayVal} step={step} unit={u} tooltip={tooltip} min={min} error={errors[field]}
            onChange={(newVal) => {
                const finalVal = isDim ? convertToMm(newVal, jobSettings.unit) : newVal;
                if (field === 'marginTopMm') {
                        setJobSettings(prev => ({ ...prev, marginTopMm: finalVal, marginBottomMm: finalVal }));
                } else {
                        handleJobSettingChange(field, finalVal);
                }
            }}
        />
      );
  };

  return (
    <div className="h-[100dvh] w-screen font-sans text-text bg-background flex flex-col overflow-hidden selection:bg-primary selection:text-white" onClick={() => setShowExportMenu(false)}>
      
      {/* Header */}
      <header className="bg-surface border-b border-border h-14 px-4 flex items-center justify-between shrink-0 z-30 gap-4 relative overflow-x-auto no-scrollbar">
        
        {/* LEFT: Logo & App Mode */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
           {/* Mobile Menu Toggle */}
           <button 
             className="md:hidden p-2 -ml-2 text-textDim hover:text-white transition-colors"
             onClick={() => setMobileMenuOpen(true)}
           >
              <MenuIcon />
           </button>

           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary/20 shrink-0">
               <LayoutIcon className="w-5 h-5"/>
             </div>
             <div className="hidden sm:flex flex-col">
                <h1 className="text-sm font-bold tracking-tight text-white leading-none">
                    Lenticular
                </h1>
                <span className="text-[10px] font-medium text-textDim tracking-wider">STUDIO</span>
             </div>
           </div>

           <div className="h-6 w-px bg-border/50 mx-1"></div>

           <div className="flex bg-surfaceHighlight/50 p-1 rounded-lg gap-1 shrink-0">
                <button 
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${appMode === 'compose' ? 'bg-background text-white shadow-sm ring-1 ring-black/5' : 'text-textDim hover:text-text hover:bg-surfaceHighlight'}`}
                    onClick={() => handleModeChange('compose')}
                >
                   <LayoutIcon className="w-3.5 h-3.5"/> <span className="hidden sm:inline">Composer</span>
                </button>
                <button 
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${appMode === 'calibration' ? 'bg-background text-white shadow-sm ring-1 ring-black/5' : 'text-textDim hover:text-text hover:bg-surfaceHighlight'}`}
                    onClick={() => handleModeChange('calibration')}
                >
                   <SettingsIcon className="w-3.5 h-3.5"/> <span className="hidden sm:inline">Calibration</span>
                </button>
           </div>
        </div>

        {/* CENTER: View Switcher (Only for Composer) */}
        <div className="flex-1 flex justify-center shrink-0">
            {appMode === 'compose' && (
                <div className="flex bg-surfaceHighlight/50 p-1 rounded-lg gap-1">
                    <button 
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${activeTab === 'print' ? 'bg-primary text-white shadow-md' : 'text-textDim hover:text-text hover:bg-surfaceHighlight'}`}
                        onClick={() => setActiveTab('print')}
                    >
                        Print
                    </button>
                    <button 
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${activeTab === 'simulation' ? 'bg-primary text-white shadow-md' : 'text-textDim hover:text-text hover:bg-surfaceHighlight'}`}
                        onClick={() => setActiveTab('simulation')}
                        disabled={frames.length < 2}
                        title={frames.length < 2 ? "Add at least 2 frames" : ""}
                    >
                        <EyeIcon className="w-3.5 h-3.5"/> Sim
                    </button>
                </div>
            )}
        </div>
        
        {/* RIGHT: Tools & Actions */}
        <div className="flex items-center gap-3 shrink-0">
            {/* Units - Hide on tiny screens */}
            <div className="hidden sm:flex items-center gap-1 bg-surfaceHighlight/50 p-1 rounded-lg">
                {(['mm', 'cm', 'in'] as Unit[]).map(u => (
                    <button 
                    key={u} onClick={() => handleUnitChange(u)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${jobSettings.unit === u ? 'bg-background text-white shadow-sm' : 'text-textDim hover:text-white'}`}
                    >{u}</button>
                ))}
            </div>

            {/* Export */}
            <div className="h-6 w-px bg-border/50 hidden sm:block"></div>
             
             <div className="relative">
                 <Button 
                     onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
                     disabled={!outputUrl || hasErrors}
                     variant="primary"
                     className={`h-8 px-4 ${(!outputUrl || hasErrors) ? 'opacity-50' : 'bg-primary hover:bg-primaryHover'}`}
                 >
                     <DownloadIcon className="w-4 h-4" /> <span className="hidden lg:inline">Export</span> <ChevronDown className="w-3 h-3 ml-1 opacity-70"/>
                 </Button>
                 
                 {showExportMenu && outputUrl && (
                     <div className="absolute top-full right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                         <div className="px-3 py-2 text-[10px] font-semibold text-textDim uppercase tracking-wider border-b border-border/50 bg-surfaceHighlight/20">Format</div>
                         <button onClick={() => handleDownload('png')} className="w-full text-left px-4 py-2 text-xs text-text hover:bg-primary hover:text-white transition-colors flex items-center gap-2">
                             <div className="w-6 font-mono font-bold text-center">PNG</div> <span>Standard Web</span>
                         </button>
                         <button onClick={() => handleDownload('tiff')} className="w-full text-left px-4 py-2 text-xs text-text hover:bg-primary hover:text-white transition-colors flex items-center gap-2">
                             <div className="w-6 font-mono font-bold text-center">TIF</div> <span>Print Ready</span>
                         </button>
                     </div>
                 )}
             </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* --- LEFT SIDEBAR: CONTROLS --- */}
        {/* Mobile Backdrop */}
        {mobileMenuOpen && (
            <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}></div>
        )}

        <div 
          className={`
            fixed inset-y-0 left-0 z-50 bg-surface border-r border-border flex flex-col transition-transform duration-300 ease-in-out shrink-0 h-full
            md:relative md:translate-x-0
            ${mobileMenuOpen ? 'translate-x-0 shadow-2xl w-[85vw] max-w-[320px]' : '-translate-x-full w-[320px]'}
          `}
          style={isDesktop ? { width: sidebarWidth } : {}}
        >
          {/* Mobile Header in Sidebar */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-surfaceHighlight/10">
             <h2 className="font-bold text-white flex items-center gap-2">
                 <SettingsIcon className="w-4 h-4"/> Settings
             </h2>
             <button onClick={() => setMobileMenuOpen(false)} className="p-1 hover:bg-surfaceHighlight rounded">
                 <XIcon />
             </button>
          </div>

          {/* Resize Handle (Desktop Only) */}
          <div 
            className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-50 hover:bg-primary/50 translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={() => setIsResizingSidebar(true)}
          ></div>
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 custom-scrollbar">
          
             {/* Presets */}
             <section className="bg-surfaceHighlight/30 p-2.5 rounded border border-border/50">
                 <div className="flex justify-between items-center mb-2">
                     <h3 className="text-[10px] font-bold text-textDim uppercase tracking-wider">Presets</h3>
                     <button onClick={handleSavePreset} className="text-primary hover:text-white text-[10px] font-semibold px-2 py-0.5 rounded hover:bg-primary transition-colors">Save Current</button>
                 </div>
                 <div className="relative">
                     <select 
                         value={activePresetId}
                         onChange={(e) => handlePresetChange(e.target.value)}
                         className="w-full bg-background border border-border rounded text-xs p-1.5 text-text outline-none focus:border-primary h-9"
                     >
                         <option value="">Custom Settings...</option>
                         {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                 </div>
             </section>

              {/* Sequence Strip */}
              {appMode === 'compose' && (
                <div className="space-y-2">
                   <div className="flex justify-between items-end pb-1 border-b border-border">
                     <h2 className="font-semibold text-xs text-text">Sequence <span className="text-textDim text-[10px] font-normal ml-1">({frames.length} frames)</span></h2>
                     <div className="flex gap-1">
                        {frames.length > 1 && (
                            <button onClick={handleReverseFrames} className="text-primary hover:text-primaryHover transition-colors p-1" title="Reverse">
                               <SwapIcon className="w-4 h-4"/>
                            </button>
                        )}
                        <label className="text-primary hover:text-primaryHover cursor-pointer transition-colors p-1" title="Add Images">
                             <UploadIcon className="w-4 h-4"/>
                             <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
                        </label>
                        {frames.length > 0 && (
                            <button onClick={() => { setFrames([]); setSelectedFrameId(null); }} className="text-textDim hover:text-error transition-colors p-1" title="Clear All">
                                <TrashIcon className="w-4 h-4"/>
                            </button>
                        )}
                     </div>
                   </div>
                   
                   <div className={`p-2 min-h-[90px] border-2 border-dashed rounded transition-all duration-200 flex items-center justify-center relative overflow-hidden
                        ${isFileDragging 
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                            : 'border-border bg-background/50 hover:border-primary/50 hover:bg-background'
                        }`}
                        onDragEnter={handleContainerDragEnter}
                        onDragOver={handleContainerDragOver} 
                        onDragLeave={handleContainerDragLeave} 
                        onDrop={handleContainerDrop}
                   >
                     {/* Overlay for Drop Indication */}
                     {isFileDragging && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                             <div className="flex flex-col items-center animate-pulse text-primary">
                                 <UploadIcon className="w-6 h-6 mb-1" />
                                 <span className="text-xs font-bold">Drop Files</span>
                             </div>
                        </div>
                     )}

                     {frames.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 pointer-events-none opacity-50">
                           <UploadIcon className="w-5 h-5 text-textDim"/>
                           <div className="text-[10px] text-textDim font-medium">Drop Images Here</div>
                        </div>
                     ) : (
                       <div className="flex gap-1.5 overflow-x-auto pb-2 w-full custom-scrollbar">
                          {frames.map((f, i) => (
                            <div 
                               key={f.id} draggable onDragStart={(e) => handleDragStart(e, i)} onDragOver={(e) => handleDragOverItem(e, i)} onDrop={(e) => handleDropItem(e, i)} onDragEnd={handleDragEnd}
                               onClick={() => setSelectedFrameId(f.id)}
                               className={`shrink-0 relative group w-14 h-14 border-2 rounded bg-background snap-start cursor-pointer overflow-hidden transition-all shadow-sm 
                                    ${draggedItemIndex === i ? 'opacity-40' : ''}
                                    ${selectedFrameId === f.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-textDim'}
                               `}
                            >
                               <img src={f.src} className="w-full h-full object-cover pointer-events-none opacity-80 group-hover:opacity-100" alt="" />
                               
                               <div className="absolute top-0 left-0 bg-surface text-text text-[8px] font-mono px-1 rounded-br opacity-90">{i+1}</div>
                               
                               {selectedFrameId !== f.id && (
                                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <button onClick={(e) => { e.stopPropagation(); setFrames(frames.filter(x => x.id !== f.id)); }} className="text-white hover:text-error p-2"><TrashIcon className="w-4 h-4" /></button>
                                   </div>
                               )}
                            </div>
                          ))}
                       </div>
                     )}
                   </div>
                   
                   {/* Selected Frame Properties */}
                   {selectedFrame && (
                       <div className="bg-surfaceHighlight/20 p-2 rounded border border-border/50 animate-in fade-in slide-in-from-top-2">
                           <div className="flex justify-between items-center mb-2">
                               <span className="text-[10px] font-bold text-primary uppercase">Frame {frames.findIndex(f => f.id === selectedFrame.id) + 1} Adjustment</span>
                               <button onClick={() => setSelectedFrameId(null)} className="text-[10px] text-textDim hover:text-text">Close</button>
                           </div>
                           <div className="grid grid-cols-2 gap-2 mb-2">
                               <Input label="Offset X (px)" value={selectedFrame.xOffset} step={1} onChange={v => handleFrameOffsetChange('x', v)} />
                               <Input label="Offset Y (px)" value={selectedFrame.yOffset} step={1} onChange={v => handleFrameOffsetChange('y', v)} />
                           </div>
                           <div className="flex justify-between items-center border-t border-border/30 pt-2">
                               <span className="text-[10px] text-textDim">Reorder:</span>
                               <div className="flex gap-1">
                                    <button 
                                        onClick={() => moveFrame(selectedFrame.id, -1)} 
                                        className="bg-surfaceHighlight hover:bg-primary hover:text-white text-textDim rounded p-1.5 transition-colors"
                                        disabled={frames.findIndex(f => f.id === selectedFrame.id) === 0}
                                    >
                                        <ArrowLeftIcon className="w-4 h-4"/>
                                    </button>
                                    <button 
                                        onClick={() => moveFrame(selectedFrame.id, 1)} 
                                        className="bg-surfaceHighlight hover:bg-primary hover:text-white text-textDim rounded p-1.5 transition-colors"
                                        disabled={frames.findIndex(f => f.id === selectedFrame.id) === frames.length - 1}
                                    >
                                        <ArrowRightIcon className="w-4 h-4"/>
                                    </button>
                               </div>
                           </div>
                       </div>
                   )}
                </div>
              )}

               {/* Calibration */}
               {appMode === 'calibration' && (
                 <section className="bg-primary/5 border border-primary/20 rounded p-3">
                    <h3 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">
                         Pattern Generator
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                       <div className="col-span-2">
                           <Input label="Center LPI" value={calibrationSettings.centerLpi} onChange={(v) => setCalibrationSettings(p => ({...p, centerLpi: v}))} step={0.01} error={errors.centerLpi} />
                       </div>
                       <Input label="Step" value={calibrationSettings.stepLpi} onChange={(v) => setCalibrationSettings(p => ({...p, stepLpi: v}))} step={0.01} error={errors.stepLpi} />
                       <Input label="Strips" value={calibrationSettings.stripCount} onChange={(v) => setCalibrationSettings(p => ({...p, stripCount: v}))} step={1} error={errors.stripCount} />
                    </div>
                 </section>
               )}

               {/* Geometry */}
               <section className="space-y-2">
                  <h3 className="text-[10px] font-bold text-textDim uppercase tracking-wider border-b border-border pb-1 mb-2">
                      Output Dimensions
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                      {renderJobInput("Width", "widthMm", 0.1, undefined, "Net Width", 10)}
                      {renderJobInput("Height", "heightMm", 0.1, undefined, "Net Height", 10)}
                  </div>
               </section>
              
               {/* Pitch & Density */}
               <section className="space-y-2">
                  <h3 className="text-[10px] font-bold text-textDim uppercase tracking-wider border-b border-border pb-1 mb-2">
                      Resolution & Pitch
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                      {appMode === 'compose' && (
                        <div className="col-span-2">
                            <Input label="Measured Pitch (LPI)" value={jobSettings.lpi} onChange={(v) => handleJobSettingChange('lpi', v)} step={0.01} error={errors.lpi} />
                        </div>
                      )}
                      {renderJobInput("Printer H-PPI", "hppi", 1, "PPI", "Printer Horizontal Res", 100)}
                      {renderJobInput("Printer V-PPI", "vppi", 1, "PPI", "Printer Vertical Res", 20)}
                  </div>
                  <div className="flex justify-between items-center pt-1">
                      {appMode === 'calibration' ? (
                          <button onClick={handleUseScreenPPI} className="text-[10px] text-primary hover:underline">
                            Detect Screen PPI
                          </button>
                      ) : (
                          <div className="text-[9px] font-mono text-textDim w-full text-right">
                            Px: {Math.ceil((jobSettings.widthMm/25.4)*jobSettings.hppi)} x {Math.ceil((jobSettings.heightMm/25.4)*jobSettings.vppi)}
                          </div>
                      )}
                  </div>
               </section>

                {/* Physics */}
                {activeTab === 'simulation' && (
                <section className="space-y-2">
                  <h3 className="text-[10px] font-bold text-textDim uppercase tracking-wider border-b border-border pb-1 mb-2">
                      Lens Physics (Sim)
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                      <Input label="Radius" value={physicsSettings.radiusMicrons} onChange={v => handlePhysicsSettingChange('radiusMicrons', v)} step={1} unit="µm" error={errors.radiusMicrons} />
                      <Input label="Thickness" value={physicsSettings.thicknessMicrons} onChange={v => handlePhysicsSettingChange('thicknessMicrons', v)} step={1} unit="µm" error={errors.thicknessMicrons} />
                      <Input label="Index (n)" value={physicsSettings.refractiveIndex} onChange={v => handlePhysicsSettingChange('refractiveIndex', v)} step={0.01} error={errors.refractiveIndex} />
                      <Input label="View Dist." value={physicsSettings.viewingDistanceMm} onChange={v => handlePhysicsSettingChange('viewingDistanceMm', v)} step={10} unit="mm" error={errors.viewingDistanceMm} />
                  </div>
               </section>
               )}

               {/* Config */}
               {appMode === 'compose' && (
               <section className="space-y-2 pb-6">
                  <h3 className="text-[10px] font-bold text-textDim uppercase tracking-wider border-b border-border pb-1 mb-2">
                      Alignment & Layout
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                      {renderJobInput("V-Margin", "marginTopMm", 0.1, undefined, "Vertical Margin", 0)}
                      
                      <Select 
                          label="Mark Type" 
                          value={jobSettings.alignmentPos}
                          options={[
                              {value: 'external', label: 'External'},
                              {value: 'internal', label: 'Internal'}
                          ]}
                          onChange={(v) => handleJobSettingChange('alignmentPos', v)}
                      />

                      <div className="col-span-2">
                        <Select 
                          label="Interlace Direction" 
                          value={jobSettings.direction}
                          options={[
                              {value: 'LR', label: 'Left to Right (Standard)'},
                              {value: 'RL', label: 'Right to Left (Reverse)'}
                          ]}
                          onChange={(v) => handleJobSettingChange('direction', v)}
                      />
                      </div>
                  </div>
               </section>
               )}
          </div>
        </div>

        {/* --- RIGHT AREA: WORKSPACE --- */}
        <div className="flex-1 flex flex-col relative bg-background min-w-0">
           
           {/* Viewport */}
           <div 
             className="flex-1 relative overflow-hidden flex items-center justify-center checkboard-bg touch-none"
             ref={previewContainerRef}
             onMouseDown={handleMouseDown}
             onMouseMove={handleMouseMove}
             onMouseUp={handleMouseUp}
             onMouseLeave={handleMouseUp}
             onWheel={handleWheel}
           >
              {/* Print Mode */}
              {activeTab === 'print' && (
                 outputUrl ? (
                   <div 
                     className="origin-center transition-transform duration-75 ease-out cursor-grab active:cursor-grabbing z-10"
                     style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                   >
                     <div className="shadow-2xl bg-white p-0">
                        <img 
                            src={outputUrl} alt="Output" 
                            className="bg-white max-w-none pointer-events-none block" 
                            style={{ imageRendering: 'pixelated' }} 
                        />
                     </div>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center pointer-events-none z-10 opacity-60">
                      {hasErrors ? (
                        <>
                           <AlertIcon className="w-10 h-10 mb-3 text-error"/>
                           <p className="text-xs font-semibold text-error">Invalid Configuration</p>
                        </>
                      ) : (
                        <>
                           <div className="w-12 h-12 mb-3 rounded-full border-2 border-dashed border-textDim flex items-center justify-center">
                               <LayoutIcon className="w-6 h-6 text-textDim"/>
                           </div>
                           <p className="text-xs font-medium text-textDim">
                             {appMode === 'compose' ? 'Waiting for images...' : 'Configuring...'}
                           </p>
                        </>
                      )}
                   </div>
                 )
              )}

              {/* Simulation Mode */}
              <div className={`absolute inset-0 flex flex-col items-center justify-center z-10 bg-black ${activeTab === 'simulation' ? 'block' : 'hidden'}`}
                   onMouseMove={handleSimMouseMove}
                   onTouchMove={(e) => {
                       // Touch simulation logic
                       const rect = e.currentTarget.getBoundingClientRect();
                       const x = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
                       setSimX(x);
                       setAutoPlay(false);
                   }}
              >
                 {frames.length > 0 ? (
                   <>
                     <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                       <canvas 
                          ref={simCanvasRef} 
                          className="max-w-full max-h-full object-contain shadow-2xl"
                          style={{ imageRendering: 'auto' }}
                        />
                     </div>

                     {/* Floating Control Panel */}
                     <div style={isDesktop ? { left: panelPos.x, top: panelPos.y } : {}} 
                          className={`
                            bg-surface/90 backdrop-blur-md border border-border/50 rounded shadow-xl flex flex-col z-50
                            ${isDesktop ? 'absolute w-56' : 'absolute bottom-0 left-0 right-0 w-full rounded-t-xl rounded-b-none border-x-0 border-b-0'}
                          `}
                          onMouseDown={(e) => e.stopPropagation()} 
                     >
                        {/* Header */}
                        <div className="bg-surfaceHighlight/50 p-2 flex justify-between items-center md:cursor-move select-none rounded-t border-b border-border/50"
                             onMouseDown={handlePanelHeaderMouseDown}
                        >
                           <span className="text-[10px] font-bold text-text uppercase tracking-wide flex items-center gap-2">
                              Simulation
                           </span>
                           <button onClick={() => setPanelMinimized(!panelMinimized)} className="text-textDim hover:text-text p-2 -mr-2">
                               {panelMinimized ? <ChevronDown className="w-4 h-4"/> : <ChevronUp className="w-4 h-4"/>}
                           </button>
                        </div>

                        {/* Body */}
                        {!panelMinimized && (
                            <div className="p-3 space-y-3 pb-6 md:pb-3">
                                <div className="flex justify-between items-center text-[10px] font-medium text-textDim border-b border-border/50 pb-1">
                                    <span>Calculated FOV</span>
                                    <span className="text-primary font-mono text-xs">{fovDegrees.toFixed(1)}°</span>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-textDim font-medium">
                                      <span>Dist: {physicsSettings.viewingDistanceMm}mm</span>
                                    </div>
                                    <input type="range" min="200" max="2000" step="50" value={physicsSettings.viewingDistanceMm} onChange={e => handlePhysicsSettingChange('viewingDistanceMm', Number(e.target.value))} className="w-full h-2 bg-surfaceHighlight rounded-lg appearance-none cursor-pointer accent-primary block" />
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                                    <span className="text-[10px] font-medium text-textDim">Play</span>
                                    <div className="flex bg-surfaceHighlight rounded p-0.5">
                                        <button onClick={() => setAutoPlay(true)} className={`px-3 py-1 text-[10px] font-semibold rounded transition-all ${autoPlay ? 'bg-background text-text shadow-sm' : 'text-textDim hover:text-text'}`}>Auto</button>
                                        <button onClick={() => setAutoPlay(false)} className={`px-3 py-1 text-[10px] font-semibold rounded transition-all ${!autoPlay ? 'bg-background text-text shadow-sm' : 'text-textDim hover:text-text'}`}>Manual</button>
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                   </>
                 ) : (
                    <div className="text-textDim font-medium text-xs p-4 text-center">Load a sequence to initialize simulation.</div>
                 )}
              </div>
              
              {/* Zoom Controls */}
              {activeTab === 'print' && outputUrl && (
                <div className="absolute bottom-6 right-6 flex flex-col gap-1 z-20 bg-surface/90 backdrop-blur border border-border/50 p-1.5 rounded-lg shadow-xl">
                   <button onClick={() => { 
                       const pixelRatio = window.devicePixelRatio || 1;
                       setZoom(1 / pixelRatio); 
                       setPan({x:0, y:0}); 
                   }} className="p-2.5 text-textDim hover:text-text hover:bg-surfaceHighlight rounded transition-colors" title="1:1">
                     <span className="font-mono text-[10px] font-bold">1:1</span>
                   </button>
                   <button onClick={() => setZoom(z => Math.min(z * 1.5, 20))} className="p-2.5 text-textDim hover:text-text hover:bg-surfaceHighlight rounded transition-colors">
                     <ZoomInIcon className="w-5 h-5"/>
                   </button>
                   <button onClick={() => { setZoom(0.5); setPan({x:0, y:0}); }} className="p-2.5 text-textDim hover:text-text hover:bg-surfaceHighlight rounded transition-colors" title="Fit">
                     <RefreshIcon className="w-5 h-5"/>
                   </button>
                   <button onClick={() => setZoom(z => Math.max(z / 1.5, 0.05))} className="p-2.5 text-textDim hover:text-text hover:bg-surfaceHighlight rounded transition-colors">
                     <ZoomOutIcon className="w-5 h-5"/>
                   </button>
                </div>
              )}

              <canvas ref={canvasRef} className="hidden" />
           </div>

        </div>

      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);