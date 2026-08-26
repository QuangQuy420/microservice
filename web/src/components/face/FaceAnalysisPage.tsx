"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteFaceAnalysisHistory, getFaceAnalysisHistory, useApiError } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useFaceAnalysis } from "@/hooks/useFaceAnalysis";
import { useStaticFaceOverlay } from "@/hooks/useStaticFaceOverlay";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { useLabels } from "@/lib/labels";
import { FaceCameraCapture } from "./FaceCameraCapture";
import { RecommendationPreview } from "./RecommendationPreview";
import type { FaceAnalysisResult, FaceMeasurements } from "@/types/face";
import type { RecommendedProduct } from "@/types/recommendation";

// Fixed display order; the label for each key lives under `face.measurements.<key>`.
const MEASUREMENT_KEYS: (keyof FaceMeasurements)[] = [
  "face_length",
  "forehead_width",
  "cheekbone_width",
  "jaw_width",
  "length_to_width_ratio",
  "cheekbone_to_jaw_ratio",
  "forehead_to_jaw_ratio",
];

// Rough visual scale for the measurement bars only, not a calibrated metric — all 7 values are
// unitless (fractions of image dimensions, or ratios of those fractions) and land roughly in the
// 0-1.5 range in practice.
const MEASUREMENT_BAR_MAX = 1.5;

// The page is a stack of identical surface cards; `mb-5` is added per call site because the card
// inside the two-column result layout must not carry it (the grid's own gap spaces that row, and
// a trailing margin would inflate the height FaceAnalysisPage measures off the photo column).
const CARD_CLASS = "rounded-[10px] border border-border bg-surface px-6 py-5";

const SECTION_LABEL_CLASS =
  "mb-3.5 text-[0.8rem] font-semibold tracking-[0.06em] text-text-muted uppercase";

const RESULT_LABEL_CLASS =
  "mb-[0.125rem] text-[0.78rem] tracking-[0.06em] text-text-muted uppercase";

// Diagonal "no image" weave, shared by the preview box and each history thumbnail.
const PHOTO_PLACEHOLDER_BG =
  "bg-[image:repeating-linear-gradient(135deg,#ede6d8,#ede6d8_12px,#e4dbc9_12px,#e4dbc9_24px)]";

// Shared between the current result and each history item — both render the same 7-field
// measurement grid from a FaceMeasurements object.
function MeasurementsGrid({ measurements }: { measurements: FaceMeasurements }) {
  const t = useTranslations("face");

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-3.5">
      {MEASUREMENT_KEYS.map((key) => {
        const value = measurements[key];
        const pct = Math.min(100, Math.round((value / MEASUREMENT_BAR_MAX) * 100));
        return (
          <div key={key}>
            <div className="mb-1.5 flex items-baseline justify-between text-[0.875rem]">
              <span className="text-[#3a322c]">{t(`measurements.${key}`)}</span>
              <span className="font-semibold">{value.toFixed(3)}</span>
            </div>
            <div className="h-[5px] overflow-hidden rounded-[3px] bg-[rgba(43,36,32,0.08)]">
              <div className="h-full rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Matches .design/Try Face Analysis.dc.html. Uploads a face photo (previewed locally while the
// request is in flight), then shows the shape/confidence + measurements on success.
// accept list mirrors ImageUploadSlot.tsx (image/jpeg,image/png,image/webp — NFR1).
export function FaceAnalysisPage() {
  const t = useTranslations("face");
  const tCommon = useTranslations("common");
  const labels = useLabels();
  const translateError = useApiError();
  // Hints for the static-photo try-on overlay's non-"ready" statuses, mirroring TryOnPage.tsx's
  // pattern for the live-camera case (FR3/AC4). Built inside the component because the text comes
  // from the translations.
  const tryOnStatusHints: Partial<Record<string, string>> = {
    "loading-model": t("overlay.loadingModel"),
    detecting: t("overlay.detecting"),
  };
  const router = useRouter();
  const { result, isLoading, error, analyze } = useFaceAnalysis();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Which of the two photo entry points is active — "camera" swaps the preview box for the
  // live camera capture flow and hides the file input so the two can't be triggered at once (T3).
  const [photoSource, setPhotoSource] = useState<"idle" | "camera">("idle");

  // Gate: only a logged-in user may upload/analyze a photo (AC1). Checked on mount, same as
  // AdminGuard — the underlying gateway route also enforces this (401), this is just the UI gate.
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [history, setHistory] = useState<FaceAnalysisResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Separate from `historyError` on purpose: `historyError` gates whether the whole history
  // list renders at all (see the JSX below), so a failed delete must not reuse it — that would
  // hide every other item's delete/view button behind one error message.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // A clicked history item becomes the page's single active result (FR5) — takes precedence
  // over `result` until either another history item is clicked or a fresh upload succeeds (AC6).
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<FaceAnalysisResult | null>(null);

  // A fresh analyze() success must take back over as the active result (AC6). Adjusted during
  // render (not a useEffect — react-hooks/set-state-in-effect) by tracking the previous `result`
  // in state (not a ref — react-hooks/refs forbids reading/writing a ref during render, same
  // reasoning TryOnPage.tsx's `hasShownCamera` comment documents), so it clears in the same
  // render `result` changes in, with no extra render pass.
  const [previousResult, setPreviousResult] = useState(result);
  if (result !== previousResult) {
    setPreviousResult(result);
    if (result) setSelectedHistoryItem(null);
  }

  const activeResult = selectedHistoryItem ?? result;

  // Static-photo try-on (FR1/FR2): which recommended frame (if any) is being tried on the active
  // photo. Reset whenever the active photo itself changes, so switching photos never leaves a
  // stale overlay drawn from the previous photo's landmarks (T6). Same render-time-adjustment
  // pattern as above.
  const [selectedFrame, setSelectedFrame] = useState<RecommendedProduct | null>(null);
  const [previousActiveResult, setPreviousActiveResult] = useState(activeResult);
  if (activeResult !== previousActiveResult) {
    setPreviousActiveResult(activeResult);
    if (selectedFrame) setSelectedFrame(null);
  }

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayThumbnail = selectedFrame
    ? selectedFrame.images.find((image) => image.isThumbnail) ?? selectedFrame.images[0]
    : null;
  const { status: overlayStatus, errorMessage: overlayErrorMessage } = useStaticFaceOverlay({
    photoUrl: selectedFrame ? (activeResult?.imageUrl ?? null) : null,
    overlayImageUrl: overlayThumbnail?.imageUrl ?? null,
    canvasRef: overlayCanvasRef,
  });

  useEffect(() => {
    async function verifyLoggedIn() {
      const token = getAccessToken();
      if (!token) {
        router.replace("/login");
        setIsAuthenticated(false);
        setAuthChecked(true);
        return;
      }
      setIsAuthenticated(true);
      setAuthChecked(true);
    }
    void verifyLoggedIn();
  }, [router]);

  // Fetch the current user's past analyses on mount (pattern like ProductEditForm.tsx's
  // categories/brands fetch) — shown right on this page, not on /profile (Q3).
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const items = await getFaceAnalysisHistory(token as string);
        if (!cancelled) setHistory(items);
      } catch (err) {
        if (!cancelled) {
          setHistoryError(translateError(err));
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
    // translateError is stable for a given locale; this fetch must stay a mount-only fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the local object URL once it's no longer the active preview (either replaced by a
  // new selection, or the component unmounts) — otherwise each upload leaks a blob URL.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    await analyze(file);
  }

  // Mirrors handleFileChange's pipeline, but the label is a fixed translated string rather than
  // `file.name` — a generated camera-capture filename would be untranslated text (AC12).
  // photoSource flips back to "idle" right away (same moment previewUrl swaps in) so the preview
  // box immediately shows the captured photo the normal way, same as a file upload does (T3).
  async function handleCameraConfirm(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(t("upload.cameraFileLabel"));
    setPhotoSource("idle");
    await analyze(file);
  }

  function handleCameraCancel() {
    setPhotoSource("idle");
  }

  // Deletes one history item (AC1). Confirms first, then removes it from `history` on success and
  // clears `selectedHistoryItem` if that item was the one being previewed (AC6).
  async function handleDeleteHistoryItem(id: string) {
    if (!window.confirm(t("history.deleteConfirm"))) return;

    const token = getAccessToken();
    if (!token) return;

    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteFaceAnalysisHistory(id, token);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      setSelectedHistoryItem((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      setDeleteError(translateError(err));
    } finally {
      setDeletingId(null);
    }
  }

  // Derive from `activeResult` (not just `result`) so a selected history item's photo also shows
  // here, not only a fresh upload's (plan T6 note).
  const displayImageUrl = activeResult?.imageUrl ?? previewUrl;
  const confidencePct = activeResult ? Math.round(activeResult.confidence * 100) : null;
  const isLowConfidence = confidencePct !== null && confidencePct < 70;

  // Whether the top photo+recommendations row is showing — mirrors the condition that row is
  // gated on below. When true, the photo-picker card moves into that row's left column (instead of
  // rendering full-width above everything) so the recommendations column sits beside the photo
  // itself, not below the shape/confidence/measurements info (which renders full-width below).
  const showResultLayout = !isLoading && !error && Boolean(activeResult);

  // Matches the recommend column's card height to the photo column's rendered height, so their
  // bottom edges line up — a plain CSS grid row can't do this on its own (an "auto" row sizes to
  // each column's max-content regardless of overflow/min-height tricks on the taller column, so
  // it never actually shrinks the recommend column to match a shorter photo column; verified by
  // measuring the real rendered boxes rather than assuming the CSS trick worked). Only applied at
  // the >900px breakpoint where the two columns actually share a row (see globals.css) — below
  // that they stack, so the list should just grow naturally instead of being height-capped.
  const photoColumnRef = useRef<HTMLDivElement>(null);
  const recommendCardRef = useRef<HTMLDivElement>(null);
  const [recommendMaxHeight, setRecommendMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    const photoColumn = photoColumnRef.current;
    if (!photoColumn) return;

    const mediaQuery = window.matchMedia("(min-width: 901px)");

    function updateHeight() {
      // Non-null: this closure is only ever created/called after the `!photoColumn` early
      // return above, and `photoColumn` is a const, so it can't become null afterward.
      setRecommendMaxHeight(mediaQuery.matches ? photoColumn!.getBoundingClientRect().height : null);
    }

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(photoColumn);
    mediaQuery.addEventListener("change", updateHeight);
    updateHeight();

    return () => {
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", updateHeight);
    };
  }, [showResultLayout]);

  // Not logged in — don't render the upload UI at all (AC1). We already redirect above; this
  // covers the render before the redirect takes effect and the (unreachable in practice, but
  // safe) case where redirect is blocked.
  if (authChecked && !isAuthenticated) {
    return (
      <section aria-labelledby="face-analysis-heading" className="mx-auto max-w-[1050px]">
        <h1
          id="face-analysis-heading"
          className="mb-[0.6rem] font-heading text-[clamp(1.75rem,4vw,2.375rem)] font-semibold"
        >
          {t("title")}
        </h1>
        <p className="mb-7 text-[0.97rem] leading-[1.6] text-text-secondary">
          {t.rich("loginPrompt", {
            link: (chunks) => <Link href="/login">{chunks}</Link>,
          })}
        </p>
      </section>
    );
  }

  // Extracted so it can render either full-width above the results (no result yet, loading, or
  // error) or as the first item in the left column once the two-column result layout is showing
  // (showResultLayout) — the recommendations column must sit beside this card, not beside the
  // measurements list below it.
  const uploadCard = (
    <div className={cn(CARD_CLASS, showResultLayout ? "mb-0" : "mb-5")}>
      <p className={SECTION_LABEL_CLASS}>{t("upload.sectionLabel")}</p>
      <div className="mb-[1.125rem] flex flex-wrap items-center gap-3">
        <label className="relative cursor-pointer overflow-hidden rounded-[2px] bg-text px-[1.125rem] py-2.5 text-[0.84rem] font-medium text-surface">
          {t("upload.chooseFile")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isLoading || photoSource === "camera"}
            onChange={handleFileChange}
            aria-label={t("upload.fileInputLabel")}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          className="cursor-pointer rounded-[2px] border-[1.5px] border-text bg-transparent px-[1.125rem] py-2.5 text-[0.84rem] font-medium text-text disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isLoading || photoSource === "camera"}
          onClick={() => setPhotoSource("camera")}
        >
          {t("upload.takePhoto")}
        </button>
        <span className="text-[0.84rem] text-text-muted">{fileName ?? t("upload.noFileChosen")}</span>
      </div>
      <div className="rounded-lg border-[1.5px] border-dashed border-[rgba(43,36,32,0.28)] p-2">
        {photoSource === "camera" ? (
          <FaceCameraCapture onConfirm={handleCameraConfirm} onCancel={handleCameraCancel} />
        ) : (
          <div
            className={cn(
              "mx-auto flex aspect-[3/4] w-full max-w-[380px] items-center justify-center overflow-hidden rounded-lg",
              PHOTO_PLACEHOLDER_BG,
            )}
          >
            {selectedFrame ? (
              <canvas ref={overlayCanvasRef} className="block h-full w-full object-cover" />
            ) : displayImageUrl ? (
              <ImageWithFallback
                src={displayImageUrl}
                alt={t("upload.photoAlt")}
                className="block h-full w-full object-cover"
                placeholderClassName="block h-full w-full object-cover p-4 text-center text-[0.8rem] text-text-muted"
              />
            ) : (
              <p className="p-4 text-center text-[0.8rem] text-text-muted">
                {t("upload.dropHint")}
              </p>
            )}
          </div>
        )}
      </div>
      {selectedFrame && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {overlayStatus !== "ready" && (
            <p role="status" className="text-[0.8rem] text-text-secondary">
              {overlayStatus === "no-face" || overlayStatus === "multiple-faces" || overlayStatus === "error"
                ? overlayErrorMessage
                : tryOnStatusHints[overlayStatus]}
            </p>
          )}
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => setSelectedFrame(null)}
          >
            {t("upload.viewOriginal")}
          </button>
        </div>
      )}
      <p className="mt-3.5 flex items-start gap-2 text-[0.78rem] leading-[1.5] text-text-muted">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" />
        </svg>
        {t("upload.privacyNote")}
      </p>
    </div>
  );

  return (
    <section aria-labelledby="face-analysis-heading" className="mx-auto max-w-[1050px]">
      <p className="mb-[0.6rem] text-[0.8rem] font-semibold tracking-[0.1em] text-text-muted uppercase">
        {t("eyebrow")}
      </p>
      <h1
        id="face-analysis-heading"
        className="mb-[0.6rem] font-heading text-[clamp(1.75rem,4vw,2.375rem)] font-semibold"
      >
        {t("title")}
      </h1>
      <p className="mb-7 text-[0.97rem] leading-[1.6] text-text-secondary">
        {t("intro")}
      </p>

      {!showResultLayout && uploadCard}

      {isLoading && <LoadingState label={t("analyzing")} />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && activeResult && (
        <>
          {/* Top: photo + recommendations side by side, so trying on a suggestion needs no
              scrolling. Shape/confidence + measurements move below, full-width, since they're
              read-once info rather than something to click while looking at the photo. */}
          <div className="grid grid-cols-[1fr_minmax(280px,340px)] items-start gap-5 max-[900px]:grid-cols-1">
            <div className="min-w-0" ref={photoColumnRef}>
              {uploadCard}
            </div>

            <div className="min-w-0">
              <div
                className={cn(CARD_CLASS, "mb-5 flex flex-col overflow-y-auto")}
                ref={recommendCardRef}
                style={{ maxHeight: recommendMaxHeight ?? undefined }}
              >
                <p className={SECTION_LABEL_CLASS}>{t("result.recommendationsLabel")}</p>
                <RecommendationPreview faceShape={activeResult.faceShape} onTryOnPhoto={setSelectedFrame} />
              </div>
            </div>
          </div>

          <div className={cn(CARD_CLASS, "mb-5 flex flex-wrap items-center gap-3.5")}>
            <div
              className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-text"
              aria-hidden="true"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F7F3EC" strokeWidth="1.6">
                <ellipse cx="12" cy="12" rx="6.5" ry="9" />
              </svg>
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={RESULT_LABEL_CLASS}>{t("result.faceShape")}</p>
              <p className="font-heading text-[1.4rem] font-semibold">
                {labels.faceShape(activeResult.faceShape)}
              </p>
            </div>
            <div className="text-right">
              <p className={RESULT_LABEL_CLASS}>{t("result.confidence")}</p>
              <p
                className={cn(
                  "text-[1.4rem] font-semibold",
                  isLowConfidence ? "text-accent" : "text-[#4a5a52]",
                )}
              >
                {confidencePct}%
              </p>
            </div>
          </div>

          {isLowConfidence && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-[rgba(201,123,74,0.1)] px-3.5 py-3 text-[0.8rem] leading-[1.5] text-text-secondary">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 9v4M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span>{t("result.lowConfidenceHint")}</span>
            </div>
          )}

          <div className={cn(CARD_CLASS, "mb-5")}>
            <p className={SECTION_LABEL_CLASS}>{t("result.measurementsLabel")}</p>
            <MeasurementsGrid measurements={activeResult.measurements} />
          </div>
        </>
      )}

      <div className={cn(CARD_CLASS, "mb-5")}>
        <p className={SECTION_LABEL_CLASS}>{t("history.title")}</p>
        {historyLoading && <LoadingState label={t("history.loading")} />}
        {!historyLoading && historyError && <ErrorState message={historyError} />}
        {!historyLoading && !historyError && deleteError && <ErrorState message={deleteError} />}
        {!historyLoading && !historyError && history.length === 0 && (
          <p className="p-4 text-center text-[0.8rem] text-text-muted">
            {t("history.empty")}
          </p>
        )}
        {!historyLoading && !historyError && history.length > 0 && (
          <div className="flex flex-col gap-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[rgba(43,36,32,0.1)] p-2.5"
              >
                <div className="flex items-center gap-3.5">
                  <div className={cn("size-[72px] shrink-0 overflow-hidden rounded-lg", PHOTO_PLACEHOLDER_BG)}>
                    <ImageWithFallback
                      src={item.imageUrl}
                      alt={t("history.itemPhotoAlt")}
                      className="block h-full w-full object-cover"
                      placeholderClassName="block h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 gap-6">
                    <div>
                      <p className={RESULT_LABEL_CLASS}>{t("result.faceShape")}</p>
                      <p className="font-heading text-[1.05rem] font-semibold">
                        {labels.faceShape(item.faceShape)}
                      </p>
                    </div>
                    <div>
                      <p className={RESULT_LABEL_CLASS}>{t("result.confidence")}</p>
                      <p className="font-heading text-[1.05rem] font-semibold">
                        {Math.round(item.confidence * 100)}%
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => setSelectedHistoryItem(item)}
                  >
                    {t("history.view")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => handleDeleteHistoryItem(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? t("history.deleting") : tCommon("delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
