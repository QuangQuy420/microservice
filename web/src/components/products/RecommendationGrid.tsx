import type { RecommendedProduct } from "@/types/recommendation";
import { RecommendationCard, type RecommendationCardVariant } from "./RecommendationCard";

// Mirrors ProductGrid.tsx's shape (dumb grid, no loading/error/empty handling of its own —
// callers own that, since RecommendationsPage's and RecommendationPreview's empty-state copy
// differ from ProductGrid's).
interface RecommendationGridProps {
  products: RecommendedProduct[];
  // Forwarded to each RecommendationCard — see RecommendationCard.tsx for when this is present.
  onTryOnPhoto?: (product: RecommendedProduct) => void;
  // "compact" switches the grid to a single narrow column and the cards to thumbnail rows —
  // used by the face-analysis recommendation sidebar. Forwarded to every card.
  variant?: RecommendationCardVariant;
}

export function RecommendationGrid({
  products,
  onTryOnPhoto,
  variant = "default",
}: RecommendationGridProps) {
  return (
    <div
      className={
        variant === "compact"
          ? "mt-2 grid grid-cols-1 gap-3 pr-1"
          : "mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-7"
      }
    >
      {products.map((product) => (
        <RecommendationCard
          key={product.id}
          product={product}
          onTryOnPhoto={onTryOnPhoto}
          variant={variant}
        />
      ))}
    </div>
  );
}
