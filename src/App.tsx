import React, { useState, useRef, useEffect } from "react";
import { 
  Eraser, 
  Sparkles, 
  Undo, 
  Redo, 
  RotateCcw, 
  Download, 
  Upload, 
  Layers, 
  HelpCircle, 
  Check, 
  Search, 
  Compass, 
  Eye, 
  Trash2,
  Minimize2,
  RefreshCw,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { performInpaint } from "./utils/inpainting";
import { SAMPLE_TEMPLATES, SampleTemplate } from "./utils/samples";
import { DetectedObject, EraserMode } from "./types";

export default function App() {
  // Main states
  const [activeTemplateId, setActiveTemplateId] = useState<string>("beach_clutter");
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState<number>(30);
  const [eraserMode, setEraserMode] = useState<EraserMode>("healing");
  
  // Undo/Redo queues (Data URLs are easiest and safest to store)
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  
  // Custom file upload states
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [customFileSrc, setCustomFileSrc] = useState<string | null>(null);

  // Gemini state triggers
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [showDetectedOverlays, setShowDetectedOverlays] = useState<boolean>(true);
  
  // Text search masking
  const [textSearchQuery, setTextSearchQuery] = useState<string>("");
  const [isSearchingText, setIsSearchingText] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Split-screen Before/After view state
  const [viewOriginal, setViewOriginal] = useState<boolean>(false);
  const [originalImageSrc, setOriginalImageSrc] = useState<string>("");

  // Interactive Brush/Draw controls
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [isWorkspaceHovered, setIsWorkspaceHovered] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  // Keep drawing history coordinates for smooth high-fidelity Bezier curves
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Load selected template or custom file onto the canvas
  useEffect(() => {
    let srcToLoad = "";
    const activeTemplate = SAMPLE_TEMPLATES.find(t => t.id === activeTemplateId);

    if (activeTemplateId === "custom" && customFileSrc) {
      srcToLoad = customFileSrc;
    } else if (activeTemplate) {
      // Create a temporary offscreen canvas to generate the dynamic sample vector
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = activeTemplate.width;
      tempCanvas.height = activeTemplate.height;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        activeTemplate.generate(ctx);
        srcToLoad = tempCanvas.toDataURL("image/png");
      }
    }

    if (srcToLoad) {
      const img = new Image();
      img.onload = () => {
        setOriginalImageSrc(srcToLoad); // cache for Before/After split view
        setupCanvases(img);
        
        // Populate standard sample distractions for premium UX right away!
        if (activeTemplate) {
          const mapKnown = activeTemplate.knownDistractions.map(d => ({
            label: d.label,
            description: d.description,
            box_2d: d.box_2d as [number, number, number, number],
          }));
          setDetectedObjects(mapKnown);
        } else {
          setDetectedObjects([]);
        }

        setImageLoaded(true);
        setUndoStack([srcToLoad]); // Reset undo with fresh base
        setRedoStack([]);
        setAiError(null);
        setStatusMessage("Image loaded. Brush directly over elements to erase them!");
      };
      img.src = srcToLoad;
    }
  }, [activeTemplateId, customFileSrc]);

  // Adjust canvas dimensions and scale properly to prevent blurry pixels
  const setupCanvases = (img: HTMLImageElement) => {
    const mainCanvas = mainCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!mainCanvas || !maskCanvas) return;

    const mainCtx = mainCanvas.getContext("2d");
    const maskCtx = maskCanvas.getContext("2d");
    if (!mainCtx || !maskCtx) return;

    // We keep canvas dimensions identical to the source image
    mainCanvas.width = img.width;
    mainCanvas.height = img.height;
    maskCanvas.width = img.width;
    maskCanvas.height = img.height;

    // Draw original image onto main canvas
    mainCtx.clearRect(0, 0, img.width, img.height);
    mainCtx.drawImage(img, 0, 0);

    // Reset mask to transparent background
    maskCtx.clearRect(0, 0, img.width, img.height);
  };

  // Safe History State Saver
  const saveToHistory = (dataUrl: string) => {
    setUndoStack(prev => [...prev.slice(-15), dataUrl]); // max 15 entries to preserve memory
    setRedoStack([]);
  };

  // Convert client-mouse coordinates into relative coordinates matching the canvas aspect ratio
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Handle Brush Stroking
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewOriginal) return; // disable writing in before-after check mode
    setIsDrawing(true);
    const coords = getCanvasCoords(e);
    lastPointRef.current = coords;

    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        // Draw initial point bubble
        maskCtx.fillStyle = "rgba(244, 63, 94, 0.65)"; // premium translucent blush pink
        maskCtx.beginPath();
        maskCtx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
        maskCtx.fill();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Record screen cursor coordinate for realistic brush preview indicator
    const canvas = maskCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = e.clientX - rect.left;
      const mouseCanvasY = e.clientY - rect.top;
      setMousePos({ x: mouseCanvasX, y: mouseCanvasY });
    }

    if (!isDrawing || viewOriginal) return;

    const coords = getCanvasCoords(e);
    const lastPoint = lastPointRef.current;
    const maskCanvas = maskCanvasRef.current;
    
    if (maskCanvas && lastPoint) {
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        maskCtx.strokeStyle = "rgba(244, 63, 94, 0.65)";
        maskCtx.lineWidth = brushSize;
        maskCtx.lineCap = "round";
        maskCtx.lineJoin = "round";

        // Quadratic curves are used to prevent rugged pixel lines during fast mouse actions
        maskCtx.beginPath();
        maskCtx.moveTo(lastPoint.x, lastPoint.y);
        const midPointX = (lastPoint.x + coords.x) / 2;
        const midPointY = (lastPoint.y + coords.y) / 2;
        maskCtx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPointX, midPointY);
        maskCtx.stroke();
      }
    }
    lastPointRef.current = coords;
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  // Erase Action - Triggers modular Content-Aware engine locally (offline mode)
  const handleExecuteErase = () => {
    const mainCanvas = mainCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!mainCanvas || !maskCanvas) return;

    setStatusMessage("Running smart content-aware fill locally...");
    
    // Tiny delay to let browser render UI queue states nicely before heavy CPU processing
    setTimeout(() => {
      try {
        const inpaintedData = performInpaint(mainCanvas, maskCanvas, eraserMode);
        
        // Draw newly recovered inpaint pixels back to main canvas
        const mainCtx = mainCanvas.getContext("2d");
        if (mainCtx) {
          mainCtx.putImageData(inpaintedData, 0, 0);
          
          // Fast clear drawn red mask
          const maskCtx = maskCanvas.getContext("2d");
          if (maskCtx) {
            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
          }

          // Register new state in undo stack
          const updatedSrc = mainCanvas.toDataURL("image/png");
          saveToHistory(updatedSrc);
          
          setStatusMessage("Erase completed successfully!");
        }
      } catch (error) {
        console.error(error);
        setStatusMessage("Offline eraser failed. Reset try again.");
      }
    }, 50);
  };

  // Trigger Gemini API to analyze the photo and returns clickable suggestion boxes
  const handleAIAnalyze = async () => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;

    setIsAnalyzing(true);
    setAiError(null);
    setStatusMessage("AI is analyzing image landmarks. Please hold on...");

    try {
      const base64Data = mainCanvas.toDataURL("image/jpeg", 0.85);

      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Data }),
      });

      if (!response.ok) {
        const errPayload = await response.json();
        throw new Error(errPayload.error || "Failed to scan photograph via Gemini");
      }

      const resData = await response.json();
      if (resData.objects && Array.isArray(resData.objects)) {
        setDetectedObjects(resData.objects);
        setShowDetectedOverlays(true);
        setStatusMessage(`AI localized ${resData.objects.length} distraction areas! Click one to auto-mask.`);
      } else {
        setDetectedObjects([]);
        setStatusMessage("AI could not extract clear distractions in this composition.");
      }
    } catch (e: any) {
      console.error(e);
      setAiError(e.message || "An unexpected integration issue occurred.");
      setStatusMessage("AI scan failed. You can still brush manually!");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Locate the target object written in natural language by the user
  const handleTextSearchErase = async (e: React.FormEvent) => {
    e.preventDefault();
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas || !textSearchQuery.trim()) return;

    setIsSearchingText(true);
    setAiError(null);
    setStatusMessage(`Searching photograph for details matching: "${textSearchQuery}"...`);

    try {
      const base64Data = mainCanvas.toDataURL("image/jpeg", 0.85);

      const response = await fetch("/api/gemini/request-mask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Data,
          typedQuery: textSearchQuery,
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json();
        throw new Error(errPayload.error || "Failed processing request.");
      }

      const resData = await response.json();
      
      // If found and coordinates are positive
      if (resData.box_2d && resData.box_2d.some((v: number) => v > 0)) {
        applyObjectMask(resData.box_2d);
        setStatusMessage(`AI spotted matching target! Red mask applied. Click 'Erase' to complete.`);
        setTextSearchQuery("");
      } else {
        setStatusMessage(`Could not find a distinct object matching "${textSearchQuery}" inside the photo.`);
      }
    } catch (e: any) {
      console.error(e);
      setAiError(e.message || "Target finder failed.");
      setStatusMessage("Search failed. You can paint over it manually.");
    } finally {
      setIsSearchingText(false);
    }
  };

  // Color-mask a coordinates box on the mask canvas automatically
  const applyObjectMask = (box_2d: [number, number, number, number]) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext("2d");
    if (!ctx) return;

    // box_2d is [ymin, xmin, ymax, xmax] normalized on a scale of [0, 1000]
    const [ymin, xmin, ymax, xmax] = box_2d;

    // Convert back from 1000 scale to canvas scale
    const realX = (xmin / 1000) * maskCanvas.width;
    const realY = (ymin / 1000) * maskCanvas.height;
    const realW = ((xmax - xmin) / 1000) * maskCanvas.width;
    const realH = ((ymax - ymin) / 1000) * maskCanvas.height;

    // Fill this rectangular region with high density translucent red
    ctx.fillStyle = "rgba(244, 63, 94, 0.72)";
    ctx.beginPath();
    // Add a padded round rect to ensure smooth border boundaries
    const padding = 15;
    ctx.roundRect(
      Math.max(0, realX - padding),
      Math.max(0, realY - padding),
      Math.min(maskCanvas.width, realW + padding * 2),
      Math.min(maskCanvas.height, realH + padding * 2),
      12
    );
    ctx.fill();

    setStatusMessage("Auto-mask applied. Press 'Erase Masked' to execute.");
  };

  // Paint clean original image back for "Clear Mask"
  const handleClearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const ctx = maskCanvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    setStatusMessage("Current mask cleared.");
  };

  // Undo and Redo operations
  const handleUndo = () => {
    if (undoStack.length <= 1) return; // cannot undo original base image

    const targetUrl = undoStack[undoStack.length - 2];
    const itemToMove = undoStack[undoStack.length - 1];

    const mainCanvas = mainCanvasRef.current;
    if (mainCanvas) {
      const ctx = mainCanvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          ctx.drawImage(img, 0, 0);
          setUndoStack(prev => prev.slice(0, -1));
          setRedoStack(prev => [itemToMove, ...prev]);
          setStatusMessage("Undo successful.");
        };
        img.src = targetUrl;
      }
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;

    const targetUrl = redoStack[0];
    const mainCanvas = mainCanvasRef.current;
    if (mainCanvas) {
      const ctx = mainCanvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          ctx.drawImage(img, 0, 0);
          setUndoStack(prev => [...prev, targetUrl]);
          setRedoStack(prev => prev.slice(1));
          setStatusMessage("Redo successful.");
        };
        img.src = targetUrl;
      }
    }
  };

  // Handle image upload from user local drive
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadLocalFile(file);
  };

  const loadLocalFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatusMessage("Only image files (JPEG, PNG, WEBP) are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomFileSrc(reader.result);
        setActiveTemplateId("custom");
      }
    };
    reader.readAsDataURL(file);
  };

  // Manage Drag and Drop file interaction
  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleFileDragLeave = () => {
    setIsDraggingFile(false);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadLocalFile(file);
    }
  };

  // Download Output clean image file
  const handleDownloadResult = () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `erased_image_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setStatusMessage("Cleaned image downloaded successfully!");
  };

  // Custom function to toggle "Hold to Compare" original image
  const handlePressCompare = (action: "down" | "up") => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (action === "down") {
      setViewOriginal(true);
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = originalImageSrc;
    } else {
      setViewOriginal(false);
      // Restore the latest active state
      const latestState = undoStack[undoStack.length - 1];
      if (latestState) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = latestState;
      }
    }
  };

  return (
    <div id="magic_eraser_app" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      
      {/* Top Professional Header Bar */}
      <header id="app_header" className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-rose-500 flex items-center justify-center shadow-md shadow-rose-900/30">
            <span className="text-xl font-bold font-display text-white">X</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold font-display tracking-tight text-white">Magic Eraser AI</h1>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-medium">
                V2.5
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono tracking-wide">OFFLINE HYBRID & AI OBJECT REMOVAL</p>
          </div>
        </div>

        {/* Current status strip */}
        <div className="hidden lg:flex items-center space-x-3 bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-1.5 max-w-sm">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs text-slate-300 truncate font-mono">
            {statusMessage || "Workspace ready"}
          </p>
        </div>

        {/* App Action Buttons (Download) */}
        <div className="flex items-center space-x-3">
          {imageLoaded && (
            <button
              id="download_btn"
              onClick={handleDownloadResult}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-xl font-medium text-xs transition-all cursor-pointer shadow-md shadow-emerald-500/10 active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save Result</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid Workspace Layout */}
      <main id="main_workspace" className="flex-1 grid grid-cols-1 xl:grid-cols-4 overflow-hidden h-full">

        {/* WORKSPACE AREA (Columns 1-3) */}
        <div className="col-span-1 xl:col-span-3 flex flex-col items-center justify-between p-4 md:p-6 bg-slate-950 relative border-r border-slate-900/80">
          
          {/* Main Floating Toolbelt */}
          <div id="floating_toolbelt" className="w-full max-w-2xl px-4 py-3 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xl z-20 mb-4 sm:mb-0">
            {/* Eraser Style Settings */}
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-400 uppercase tracking-widest font-mono">Style:</span>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(["healing", "exemplar", "smudge"] as EraserMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setEraserMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-all cursor-pointer font-medium ${
                      eraserMode === mode 
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" 
                        : "text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    {mode === "healing" ? "Blemish Heal" : mode === "exemplar" ? "Texture Synth" : "Soft Smudge"}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas Actions Layer */}
            <div className="flex items-center space-x-1 border-l border-slate-800 pl-4">
              <button
                id="undo_btn"
                disabled={undoStack.length <= 1}
                onClick={handleUndo}
                className="p-2 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                title="Undo (Ctrl+Z)"
              >
                <Undo className="h-4.5 w-4.5" />
              </button>
              <button
                id="redo_btn"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                className="p-2 text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                title="Redo"
              >
                <Redo className="h-4.5 w-4.5" />
              </button>
              <button
                id="clear_mask_btn"
                onClick={handleClearMask}
                className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-850 transition-all cursor-pointer"
                title="Clear drawn lines"
              >
                <RotateCcw className="h-4.5 w-4.5" />
              </button>
              
              <button
                id="compare_btn"
                onMouseDown={() => handlePressCompare("down")}
                onMouseUp={() => handlePressCompare("up")}
                onMouseLeave={() => viewOriginal && handlePressCompare("up")}
                onTouchStart={() => handlePressCompare("down")}
                onTouchEnd={() => handlePressCompare("up")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border select-none ${
                  viewOriginal 
                    ? "bg-amber-500 text-slate-950 border-amber-500 font-bold scale-95" 
                    : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white"
                }`}
                title="Hold or click to inspect original photo"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{viewOriginal ? "Showing Original" : "Hold to Compare"}</span>
              </button>
            </div>
          </div>

          {/* CENTRAL INTERACTIVE CANVAS INTERFACE */}
          <div 
            ref={containerRef}
            id="canvas_frame" 
            className="w-full flex-1 flex items-center justify-center relative min-h-[300px] md:min-h-[480px] p-2 overflow-auto"
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
          >
            {isDraggingFile && (
              <div className="absolute inset-0 bg-rose-500/10 backdrop-blur-sm border-4 border-dashed border-rose-500 rounded-2xl flex flex-col items-center justify-center z-30 transition-all duration-200">
                <Upload className="h-10 w-10 text-rose-500 animate-bounce mb-3" />
                <p className="text-sm font-semibold text-rose-400">Release file to load custom image!</p>
              </div>
            )}

            {!imageLoaded ? (
              <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 bg-slate-900/40 rounded-3xl max-w-md">
                <div className="h-14 w-14 rounded-2xl bg-slate-850 flex items-center justify-center border border-slate-800 mb-4 animate-pulse text-amber-500">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Rendering workspace...</h3>
                <p className="text-xs text-slate-400 mt-2">Loading original assets into pixel grid...</p>
              </div>
            ) : (
              <div 
                className="relative cursor-none checkerboard max-w-full max-h-full rounded-xl overflow-hidden shadow-2xl border border-slate-800/80"
                style={{ aspectRatio: `${mainCanvasRef.current?.width || 800}/${mainCanvasRef.current?.height || 500}` }}
                onMouseEnter={() => setIsWorkspaceHovered(true)}
                onMouseLeave={() => {
                  setIsWorkspaceHovered(false);
                  handleMouseUp();
                }}
              >
                {/* 1. Underlying Main Image Canvas containing modified content */}
                <canvas 
                  ref={mainCanvasRef} 
                  id="canvas_main"
                  className="block w-full h-auto pointer-events-none"
                />

                {/* 2. Overlapping drawing layer (hot pink transparent brush mask string) */}
                <canvas 
                  ref={maskCanvasRef} 
                  id="canvas_mask"
                  className="absolute inset-0 w-full h-auto"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                />

                {/* 3. Absolute Detected Objects/Distraction Overlays (interactive and clean scaled matching scale) */}
                {showDetectedOverlays && detectedObjects.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none w-full h-full">
                    {detectedObjects.map((obj, oIndex) => {
                      const [ymin, xmin, ymax, xmax] = obj.box_2d;
                      const top = `${ymin / 10}%`;
                      const left = `${xmin / 10}%`;
                      const width = `${(xmax - xmin) / 10}%`;
                      const height = `${(ymax - ymin) / 10}%`;

                      return (
                        <div
                          key={oIndex}
                          className="absolute border border-dashed border-emerald-400 group/item pointer-events-auto cursor-pointer"
                          style={{ top, left, width, height }}
                          onClick={() => applyObjectMask(obj.box_2d)}
                          title={`Click to auto-mask: ${obj.label}`}
                        >
                          <div className="absolute left-1 top-1 bg-emerald-500/95 text-slate-950 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 shadow transform origin-top-left hover:scale-105 transition-all">
                            <span>{obj.label}</span>
                            <Sparkles className="h-2 w-2 text-slate-950" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 4. Realistic Floating Cursor preview mapping brush boundaries */}
                {isWorkspaceHovered && !viewOriginal && (
                  <div 
                    className="absolute rounded-full border border-rose-500 bg-rose-500/20 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                    style={{ 
                      left: mousePos.x, 
                      top: mousePos.y, 
                      width: `${brushSize}px`, 
                      height: `${brushSize}px` 
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-md animate-ping" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LOWER STATUS AND CORE REMOVAL TRIGGER */}
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 max-w-3xl border-t border-slate-900 pt-4">
            <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
              <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>Use the brush to cover any distraction, then click trigger</span>
            </div>

            <div className="flex space-x-3 items-center">
              <button
                id="run_erase_btn"
                onClick={handleExecuteErase}
                disabled={!imageLoaded || viewOriginal}
                className="px-6 py-2.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white rounded-xl font-medium text-xs tracking-wide transition-all shadow-lg hover:shadow-rose-500/10 cursor-pointer flex items-center space-x-2 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
              >
                <Eraser className="h-4 w-4" />
                <span>Erase Brush Area</span>
              </button>
            </div>
          </div>
        </div>

        {/* SIDEBAR CONTROL PANEL (Column 4) */}
        <div className="col-span-1 bg-slate-900 border-t xl:border-t-0 border-slate-800 p-6 flex flex-col space-y-6 overflow-y-auto max-h-[85vh] xl:max-h-[88vh]">
          
          {/* Quick Brush Details */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono flex items-center space-x-1">
              <Layers className="h-3.5 w-3.5 text-rose-500" />
              <span>Eraser Parameters</span>
            </h2>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-mono">Brush Thickness</span>
                <span className="text-rose-400 font-bold font-mono">{brushSize}px</span>
              </div>
              <input 
                type="range"
                min="5"
                max="80"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Narrow (5px)</span>
                <span>Broad (80px)</span>
              </div>
            </div>
          </div>

          {/* AI PILOTING CAPSULES */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono flex items-center space-x-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Smart AI Pilot (Gemini)</span>
            </h2>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
              
              {/* Scan Object Detection button */}
              <div>
                <p className="text-[11px] text-slate-400 mb-2 font-sans">
                  Let Gemini analyze visual coordinates to instantly mark targets.
                </p>
                <button
                  id="ai_scan_btn"
                  onClick={handleAIAnalyze}
                  disabled={isAnalyzing || !imageLoaded}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Gemini scanning...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      <span>AI Auto-Detect Objects</span>
                    </>
                  )}
                </button>
              </div>

              {/* Text Query Eraser Input form */}
              <div className="border-t border-slate-900 pt-3">
                <label className="block text-[11px] text-slate-400 mb-1.5 font-mono">Search & Auto-Mask</label>
                <form onSubmit={handleTextSearchErase} className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="e.g. photobomber, dog, wire"
                    value={textSearchQuery}
                    onChange={(e) => setTextSearchQuery(e.target.value)}
                    disabled={isSearchingText || !imageLoaded}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-sans disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingText || !textSearchQuery.trim() || !imageLoaded}
                    className="p-2 bg-rose-500 hover:bg-rose-400 text-white rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Find target"
                  >
                    {isSearchingText ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  </button>
                </form>
              </div>

              {aiError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-rose-400 font-sans mt-2">
                  {aiError}
                </div>
              )}

              {/* Extracted Interactive tags section */}
              {detectedObjects.length > 0 && (
                <div className="space-y-2 border-t border-slate-900 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                      Found Targets ({detectedObjects.length})
                    </span>
                    <button
                      onClick={() => setShowDetectedOverlays(p => !p)}
                      className="text-[10px] text-rose-400 font-mono hover:underline"
                    >
                      {showDetectedOverlays ? "Hide overlays" : "Show overlays"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
                    {detectedObjects.map((obj, i) => (
                      <button
                        key={i}
                        onClick={() => applyObjectMask(obj.box_2d)}
                        className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1.5 rounded-lg text-left hover:scale-95 hover:border-emerald-500/40 hover:text-emerald-400 transition-all flex items-center space-x-1.5"
                        title={obj.description}
                      >
                        <span className="h-1 w-1 bg-emerald-400 rounded-full shrink-0" />
                        <span className="truncate max-w-[150px]">{obj.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* TEMPLATE SOURCE CHOOSER */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono flex items-center space-x-1.5">
              <Compass className="h-3.5 w-3.5 text-amber-400" />
              <span>Select Sample Photograph</span>
            </h2>

            <div className="space-y-2.5">
              {SAMPLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setActiveTemplateId(tpl.id);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    activeTemplateId === tpl.id
                      ? "bg-rose-500/10 border-rose-500 text-slate-100"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className="text-lg">{tpl.icon}</span>
                    <div className="truncate">
                      <p className="text-xs font-semibold truncate leading-none text-slate-200">{tpl.name}</p>
                      <p className="text-[10px] text-slate-500 truncate mt-1">{tpl.description}</p>
                    </div>
                  </div>
                  {activeTemplateId === tpl.id && (
                    <Check className="h-3.5 w-3.5 text-rose-400 shrink-0 ml-2" />
                  )}
                </button>
              ))}

              {/* CUSTOM FILE UPLOADER TILE */}
              <div className="pt-2">
                <input
                  type="file"
                  id="custom_upload_input"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="custom_upload_input"
                  className={`w-full p-3 rounded-xl border border-dashed text-center flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-slate-900 hover:text-rose-400 transition-all ${
                    activeTemplateId === "custom"
                      ? "bg-rose-500/10 border-rose-500 text-rose-400 font-medium"
                      : "bg-slate-950/40 border-slate-800 text-slate-400"
                  }`}
                >
                  <Upload className="h-5 w-5 mb-1.5" />
                  <span className="text-xs">
                    {activeTemplateId === "custom" ? "Custom Photo Loaded" : "Upload Custom Photo"}
                  </span>
                  <span className="text-[9px] text-slate-500 mt-0.5">Drag & Drop supported</span>
                </label>
              </div>
            </div>
          </div>

          {/* MINI INSTRUCTION CHEATSHEET */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-2 font-sans">
            <h4 className="font-semibold text-slate-300 text-[11px] font-mono flex items-center space-x-1.5">
              <HelpCircle className="h-3 w-3 text-rose-400" />
              <span>Offline Work Tips</span>
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-[11px] leading-relaxed">
              <li>Use <strong className="text-slate-200">Blemish Heal</strong> for skin, spots, wires.</li>
              <li>Use <strong className="text-slate-200">Texture Synth</strong> for sand, grass, patterns.</li>
              <li>Use <strong className="text-slate-200">Soft Smudge</strong> for flat uniform backdrops.</li>
              <li>Press and hold <strong className="text-slate-200">Hold To Compare</strong> to verify your pixel edits against the original!</li>
            </ul>
          </div>

        </div>
      </main>
    </div>
  );
}
