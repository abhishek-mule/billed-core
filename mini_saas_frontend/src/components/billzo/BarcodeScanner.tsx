import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

export function BarcodeScanner({ onScan, onClose }: { onScan: (text: string) => void, onClose: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        if (scannerRef.current?.isScanning) {
          scannerRef.current.stop().then(() => {
            onScan(decodedText);
          }).catch(console.error);
        }
      },
      () => {}
    ).catch(err => {
      console.error("Camera error:", err);
      alert("Could not access camera. Please check permissions.");
      onClose();
    });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center p-5 text-white z-10">
        <h3 className="font-bold text-lg">Scan Barcode</h3>
        <button onClick={() => {
            if (scannerRef.current?.isScanning) {
                scannerRef.current.stop().catch(console.error).finally(onClose);
            } else {
                onClose();
            }
        }} className="p-2 rounded-full bg-white/20 hover:bg-white/30">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div id="reader" className="flex-1 w-full flex items-center justify-center bg-black overflow-hidden"></div>
      <div className="p-6 text-center text-white/70 text-sm">
        Point the camera at a product barcode to add to cart
      </div>
    </div>
  );
}
