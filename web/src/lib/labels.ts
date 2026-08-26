"use client";

import { useTranslations } from "next-intl";
import type { FaceShapeTag, FrameShape, GenderTarget } from "@/types/product";
import type { OrderStatus } from "@/types/order";
import type { SagaLogLevel, SagaLogService, SagaLogStage } from "@/types/saga-log";

// Enum display order lives here; the display TEXT lives in messages/<locale>.json under the
// `labels` namespace, keyed by the raw enum value (labels.frameShape.ROUND, ...). Components
// read it through useLabels() instead of a per-language constant map, so a new language needs
// no change in this file.

// Fixed display order for the face-shape tag picker (matches the mockup's faceShapeDefs order,
// with OBLONG appended last since the mockup doesn't show it).
export const FACE_SHAPE_TAGS: FaceShapeTag[] = [
  "OVAL",
  "ROUND",
  "SQUARE",
  "HEART",
  "DIAMOND",
  "OBLONG",
];

// Fixed display order for the frame-shape select (matches the mockup's shapeOptions order where
// possible; WAYFARER/RIMLESS appended since the mockup's list predates those enum values).
export const FRAME_SHAPES: FrameShape[] = [
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "AVIATOR",
  "CAT_EYE",
  "OVAL",
  "WAYFARER",
  "RIMLESS",
];

// GenderTarget isn't shown in the mockup (like brandId, it's a required backend field the mockup
// doesn't surface — see plan FR8) — added as a minimal required select so the form can submit a
// valid CreateProductDto.
export const GENDER_TARGETS: GenderTarget[] = ["UNISEX", "MALE", "FEMALE"];

// Fixed display order for the order-status filter select.
export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

interface Labels {
  frameShape: (shape: FrameShape) => string;
  faceShape: (shape: FaceShapeTag) => string;
  genderTarget: (target: GenderTarget) => string;
  orderStatus: (status: OrderStatus) => string;
  sagaStage: (stage: SagaLogStage) => string;
  // Day/order summary wording ("normal"/"warning") — describes a whole day's or order's worst
  // level.
  sagaLevel: (level: SagaLogLevel) => string;
  // Per-row wording on the saga-log detail table: one row is a single event outcome, so
  // succeeded/failed reads better there than the summary wording above.
  sagaRowStatus: (level: SagaLogLevel) => string;
  sagaService: (service: SagaLogService | null) => string;
}

export function useLabels(): Labels {
  const t = useTranslations("labels");

  return {
    frameShape: (shape) => t(`frameShape.${shape}`),
    faceShape: (shape) => t(`faceShape.${shape}`),
    genderTarget: (target) => t(`genderTarget.${target}`),
    orderStatus: (status) => t(`orderStatus.${status}`),
    sagaStage: (stage) => t(`sagaStage.${stage}`),
    sagaLevel: (level) => t(`sagaLevel.${level}`),
    sagaRowStatus: (level) => t(`sagaRowStatus.${level}`),
    sagaService: (service) => (service ? t(`sagaService.${service}`) : t("none")),
  };
}
