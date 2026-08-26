"use client";

import { CatalogManagementPage } from "@/components/admin/CatalogManagementPage";
import { createCategory, deleteCategory, getCategories, updateCategory } from "@/lib/api";

export default function AdminCategoriesPage() {
  return <CatalogManagementPage config={{
    resource: "categories",
    getItems: getCategories,
    create: createCategory,
    update: updateCategory,
    remove: deleteCategory,
  }} />;
}
