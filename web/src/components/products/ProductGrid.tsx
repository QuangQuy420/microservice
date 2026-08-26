import { useTranslations } from "next-intl";
import type { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  const t = useTranslations("products");

  if (products.length === 0) {
    return <p className="my-[1em] text-text-muted">{t("empty")}</p>;
  }

  return (
    <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-7">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
