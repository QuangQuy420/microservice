"use client";

import { CatalogManagementPage } from "@/components/admin/CatalogManagementPage";
import { createBrand, deleteBrand, getBrands, updateBrand } from "@/lib/api";

export default function AdminBrandsPage() {
  return <CatalogManagementPage config={{
    resource: "brands",
    getItems: getBrands,
    create: createBrand,
    update: updateBrand,
    remove: deleteBrand,
  }} />;
}
