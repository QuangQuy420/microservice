"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminGuard, useAdminProfile } from "@/components/admin/AdminGuard";
import { cn } from "@/lib/cn";
import { removeAccessToken } from "@/lib/auth/session";

const SIDEBAR_LINK =
  "flex items-center gap-[0.6rem] rounded-md px-3 py-2.5 text-sm font-medium no-underline";

const NAV_ITEMS = [
  { label: "Tổng quan", href: "/admin" },
  { label: "Sản phẩm", href: "/admin/products" },
  { label: "Đơn hàng", href: "/admin/orders" },
  { label: "Nhật ký xử lý đơn hàng", href: "/admin/saga-logs" },
  { label: "Khách hàng", href: "/admin/users" },
  { label: "Vai trò", href: "/admin/roles" },
  { label: "Cài đặt", href: "/admin/settings" },
];

const CATALOG_NAV_ITEMS = [
  { label: "Thương hiệu", href: "/admin/brands" },
  { label: "Danh mục", href: "/admin/categories" },
];

export default function AdminLayout({
                                      children,
                                    }: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    removeAccessToken();
    router.replace("/login");
    router.refresh();
  }

  return <AdminGuard><AdminLayoutContent pathname={pathname} onLogout={handleLogout}>{children}</AdminLayoutContent></AdminGuard>;
}

function AdminLayoutContent({
  children,
  pathname,
  onLogout,
}: {
  children: React.ReactNode;
  pathname: string;
  onLogout: () => void;
}) {
  const profile = useAdminProfile();
  const isAdmin = profile?.roles.some((role) => role.toUpperCase() === "ADMIN");
  const navItems = isAdmin ? [...NAV_ITEMS, ...CATALOG_NAV_ITEMS] : CATALOG_NAV_ITEMS;

  return (
        <div className="flex min-h-screen bg-bg text-text">
          <aside className="relative flex w-[220px] shrink-0 flex-col bg-text py-6 text-bg">
            <div className="mb-3 border-b border-[rgba(247,243,236,0.12)] px-[1.4rem] pb-6 font-heading text-[1.2rem] font-semibold tracking-[0.06em]">
              SMART EYEWEAR
              <div className="mt-1 text-[0.7rem] font-normal tracking-[0.08em] text-[#c9b8a6]">
                QUẢN TRỊ
              </div>
            </div>

            <nav className="flex flex-col gap-[2px] px-3">
              {navItems.map((item) => {
                // "/admin" (Tổng quan) is a prefix of every other admin route, so it needs an
                // exact match — otherwise it would also light up on /admin/products etc.
                const active =
                    item.href === "/admin"
                        ? pathname === "/admin"
                        : pathname.startsWith(item.href);

                return (
                    <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                            SIDEBAR_LINK,
                            active ? "bg-accent text-text" : "text-[#e6dccf]",
                        )}
                    >
                      {item.label}
                    </Link>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-[0.35rem] border-t border-[rgba(247,243,236,0.12)] px-3 pt-4">
              <Link
                  href="/"
                  className={cn(SIDEBAR_LINK, "text-[#e6dccf]")}
              >
                Về cửa hàng
              </Link>

              <button
                  type="button"
                  className="flex w-full cursor-pointer rounded-md border-0 bg-transparent px-3 py-2.5 text-left font-body text-sm font-medium text-[#e6dccf] hover:bg-[rgba(247,243,236,0.08)] hover:text-white"
                  onClick={onLogout}
              >
                Đăng xuất
              </button>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {children}
          </div>
        </div>
  );
}
