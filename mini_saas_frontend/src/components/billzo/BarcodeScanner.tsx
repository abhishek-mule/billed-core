import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Zap, Box } from 'lucide-react';
import { toast } from 'sonner';

export function BarcodeScanner({ onScan, onClose }: { onScan: (text: string) => void, onClose: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { 
        fps: 20, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          return { width: viewfinderWidth * 0.8, height: viewfinderHeight * 0.4 };
        },
        aspectRatio: 1.0
      },
      (decodedText) => {
        if (scannerRef.current?.isScanning) {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
          scannerRef.current.stop().then(() => {
            onScan(decodedText);
          }).catch(console.error);
        }
      },
      () => {}
    ).catch(err => {
      console.error("Camera error:", err);
      toast.error("Could not access camera. Please check permissions.");
      onClose();
    });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-center p-6 text-white z-10 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-current" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-none">Smart Scan</h3>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">Barcode Engine v2.0</p>
          </div>
        </div>
        <button 
          onClick={() => {
            if (scannerRef.current?.isScanning) {
              scannerRef.current.stop().catch(console.error).finally(onClose);
            } else {
              onClose();
            }
          }} 
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors border border-white/10"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Scanner Container */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <div id="reader" className="absolute inset-0 w-full h-full"></div>
        
        {/* Scanning Overlay UI */}
        <div className="relative w-4/5 h-2/5 max-w-md border-2 border-white/20 rounded-3xl overflow-hidden pointer-events-none">
          {/* Corner Accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl"></div>
          
          {/* Scanning Beam */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-scan-beam"></div>
          
          {/* Hint text inside scanner box */}
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                <p className="text-white/80 text-xs font-medium">Align barcode within frame</p>
             </div>
          </div>
        </div>
      </div>

      {/* Footer Hint */}
      <div className="p-8 text-center bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-3 text-white/90">
          <Box className="w-5 h-5 text-indigo-400" />
          <p className="text-sm font-medium">Scanning for products...</p>
        </div>
        <p className="mt-2 text-slate-400 text-xs px-10">
          Hold steady for a second. Works best in well-lit environments.
        </p>
      </div>

      {/* @ts-ignore */}
      <style jsx global>{`
        @keyframes scan-beam {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan-beam {
          animation: scan-beam 2.5s ease-in-out infinite;
        }
        #reader video {
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
}
