"use client";

import { useEffect, useRef, useState } from "react";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import { cn } from "@/lib/cn";

interface FaceCameraCaptureProps {
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

// Vietnamese hints for the non-"streaming"/"captured" statuses, mirroring TryOnPage.tsx's
// STATUS_HINTS wording style (AC2, AC6).
const STATUS_HINTS: Partial<Record<string, string>> = {
  idle: "Đang khởi động camera...",
  "requesting-camera": "Đang yêu cầu quyền truy cập camera...",
};

// `.btn-outline`'s dark text/border (readable on the page's light background) disappears against
// this overlay, which always sits on top of a photo — flip it to a light outline with a
// translucent dark fill so it stays legible regardless of what's behind it.
const OVERLAY_OUTLINE_BUTTON_CLASS =
  "btn btn-outline btn-small border-[rgba(255,255,255,0.85)] bg-[rgba(28,23,18,0.45)] text-white";

// Renders the "Chụp ảnh" flow: live mirrored camera feed -> "Chụp" -> captured-still review ->
// "Dùng ảnh này" / "Chụp lại". All getUserMedia/canvas logic lives in useCameraCapture
// (coder.md §4) — this component only reacts to its status and renders the matching UI.
export function FaceCameraCapture({ onConfirm, onCancel }: FaceCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { status, errorMessage, start, stop, capture, retake } = useCameraCapture(videoRef);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const capturedFileRef = useRef<File | null>(null);

  // Open the camera as soon as this component mounts (i.e. as soon as "Chụp ảnh" is chosen).
  useEffect(() => {
    void start();
    // Intentionally run once on mount only — start()/stop() identity is not relevant here, the
    // page owns calling stop() on cancel/confirm/unmount (T3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the captured-still object URL once it's replaced by a new one or the component
  // unmounts — otherwise each capture leaks a blob URL.
  useEffect(() => {
    return () => {
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, [capturedUrl]);

  async function handleCapture() {
    setCaptureError(null);
    try {
      const file = await capture();
      capturedFileRef.current = file;
      setCapturedUrl(URL.createObjectURL(file));
    } catch {
      setCaptureError("Không thể chụp ảnh từ camera. Vui lòng thử lại.");
    }
  }

  function handleRetake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    capturedFileRef.current = null;
    setCaptureError(null);
    // No new start()/permission prompt — the stream never stopped (AC4).
    retake();
  }

  function handleCancel() {
    stop();
    onCancel();
  }

  function handleConfirm() {
    if (!capturedFileRef.current) return;
    // Confirm-success is one of the three exit paths that must stop the stream (cancel,
    // confirm-success, unmount — NFR2); the hook is owned here, so this component is the one
    // that stops it before handing the file up to the page.
    stop();
    onConfirm(capturedFileRef.current);
  }

  const isReviewing = status === "captured" && capturedUrl !== null;
  const hint = captureError ?? (status !== "streaming" && !isReviewing ? (STATUS_HINTS[status] ?? errorMessage) : null);
  const isErrorHint = Boolean(
    status === "camera-denied" || status === "unsupported" || status === "error" || captureError,
  );

  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-[380px] overflow-hidden rounded-lg bg-[#1c1712]">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]"
        style={isReviewing ? { display: "none" } : undefined}
        playsInline
        muted
        aria-hidden="true"
      />
      {isReviewing && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob object URL from the just-captured File, not a remote/optimizable image
        <img
          src={capturedUrl}
          alt="Ảnh vừa chụp"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2.5 bg-[image:linear-gradient(to_top,rgba(0,0,0,0.55),transparent)] p-3.5">
        {isReviewing ? (
          <>
            <button type="button" className={OVERLAY_OUTLINE_BUTTON_CLASS} onClick={handleRetake}>
              Chụp lại
            </button>
            <button type="button" className="btn btn-primary btn-small" onClick={handleConfirm}>
              Dùng ảnh này
            </button>
          </>
        ) : (
          <>
            <button type="button" className={OVERLAY_OUTLINE_BUTTON_CLASS} onClick={handleCancel}>
              Hủy
            </button>
            {status === "streaming" && (
              <button type="button" className="btn btn-primary btn-small" onClick={handleCapture}>
                Chụp
              </button>
            )}
          </>
        )}
      </div>
      {hint && (
        <p
          role="status"
          className={cn(
            "absolute top-3.5 right-3.5 left-3.5 text-center text-[0.8rem]",
            isErrorHint ? "text-[#e8a583]" : "text-[#f7f3ec]",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
