import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";

interface QrCodeScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export default function QrCodeScanner({ onScan, onClose }: QrCodeScannerProps) {
  const readerId = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    const clearScanner = (s: Html5Qrcode) => {
      try {
        s.clear();
      } catch {
        // Already cleared or DOM removed.
      }
    };

    const stopAndClear = () => {
      const s = scannerRef.current;
      if (!s) return;
      scannerRef.current = null;

      try {
        if (s.isScanning) {
          void s.stop().finally(() => clearScanner(s));
        } else {
          clearScanner(s);
        }
      } catch {
        clearScanner(s);
      }
    };

    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // Stop the camera before notifying the parent, then clear.
          const s = scannerRef.current;
          scannerRef.current = null;
          if (s) {
            void s
              .stop()
              .catch(() => {
                // Ignore stop errors; the scanner is already shutting down.
              })
              .finally(() => {
                clearScanner(s);
                onScan(decodedText);
              });
          } else {
            onScan(decodedText);
          }
        },
        () => {
          // Frame decode failures are expected when no QR is in view.
        },
      )
      .then(() => {
        if (mountedRef.current) {
          setStarting(false);
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setStarting(false);
        setError(
          err instanceof Error
            ? err.message
            : "Could not start camera. Make sure you have given camera permission.",
        );
      })
      .finally(() => {
        startPromiseRef.current = null;
      });

    startPromiseRef.current = startPromise;

    return () => {
      mountedRef.current = false;
      // If start() is still pending, wait for it to finish before stopping so
      // the camera stream is actually released instead of left active.
      if (startPromiseRef.current) {
        void startPromiseRef.current.finally(stopAndClear);
      } else {
        stopAndClear();
      }
    };
  }, [onScan]);

  const handleCancel = () => {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) {
      scannerRef.current = null;
      void scanner.stop().finally(() => {
        try {
          scanner.clear();
        } catch {
          // Already cleared or DOM removed.
        }
        onClose();
      });
    } else {
      onClose();
    }
  };

  return (
    <div className="qr-scanner-overlay" onClick={handleCancel}>
      <div className="qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scanner-header">
          <h4>Scan QR code</h4>
          <button
            type="button"
            className="wallet-modal-close"
            onClick={handleCancel}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="wallet-delete-modal-text">
          Point your camera at a Solana address QR code.
        </p>
        <div className="qr-scanner-viewport-wrap">
          {starting && (
            <div className="qr-scanner-loading">
              <span className="wallet-spinner" aria-hidden="true" />
              Starting camera…
            </div>
          )}
          <div id={readerId} className="qr-scanner-viewport" />
        </div>
        {error && <div className="wallet-error">{error}</div>}
        <div className="wallet-delete-modal-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
