"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { cn } from "@/lib/cn";
import { ApiError, getMyProfile } from "@/lib/api";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";

const ADMIN_ROLE_NAMES = ["ADMIN"];
const CATALOG_PERMISSION = "catalog:manage";

// Everything the nav tabs share; the color + underline state comes from navLinkClass() below.
// The underline is the ::after bar (scaled in on hover/focus, or pinned open when active).
const NAV_LINK_CLASS =
    "relative inline-flex min-h-10 cursor-pointer items-center border-0 bg-transparent py-[0.4rem] font-body " +
    "text-[0.9rem] font-semibold no-underline transition-colors duration-200 ease-[ease] " +
    "hover:text-text focus-visible:text-text " +
    "after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:origin-center after:rounded-full " +
    "after:bg-accent after:transition-transform after:duration-200 after:ease-[ease] " +
    "hover:after:scale-x-100 focus-visible:after:scale-x-100 " +
    "max-sm:min-h-9 max-sm:text-[0.82rem] max-sm:whitespace-nowrap";

// Shared by every row of the account dropdown; the text/hover colors differ per item kind
// (see the two constants below) so the two variants never fight over the same utility.
const ACCOUNT_MENU_ITEM_CLASS =
    "flex w-full cursor-pointer items-center gap-3 rounded-[9px] border-0 bg-transparent px-[0.8rem] py-3 " +
    "text-left font-body text-[0.86rem] font-[550] no-underline transition-[color,background-color,translate] " +
    "duration-[180ms] ease-[ease] hover:translate-x-[2px] hover:outline-none focus-visible:translate-x-[2px] " +
    "focus-visible:outline-none";

const ACCOUNT_MENU_ITEM_DEFAULT_CLASS = cn(
    ACCOUNT_MENU_ITEM_CLASS,
    "text-text-secondary hover:bg-[rgba(201,123,74,0.1)] hover:text-text",
    "focus-visible:bg-[rgba(201,123,74,0.1)] focus-visible:text-text",
);

const ACCOUNT_MENU_ITEM_DANGER_CLASS = cn(
    ACCOUNT_MENU_ITEM_CLASS,
    "text-[#a63a32] hover:bg-[rgba(176,0,32,0.08)] hover:text-[#8f241d]",
    "focus-visible:bg-[rgba(176,0,32,0.08)] focus-visible:text-[#8f241d]",
);

const ACCOUNT_MENU_ICON_CLASS = "inline-flex w-[22px] items-center justify-center text-base text-inherit";

// "/" only matches the exact catalog root; every other tab also covers its sub-routes
// (e.g. "/admin/orders" should still highlight "Quản trị").
function isNavLinkActive(pathname: string, href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(pathname: string, href: string): string {
    return cn(
        NAV_LINK_CLASS,
        isNavLinkActive(pathname, href)
            ? "text-text after:scale-x-100"
            : "text-text-secondary after:scale-x-0",
    );
}

export function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const menuRef = useRef<HTMLDivElement>(null);

    // Starts false to match the server-rendered markup (no `window` there), then syncs the
    // real value in the effect below — reading localStorage during the initializer instead
    // would make the client's first render diverge from the server's and trigger a hydration
    // mismatch.
    const [authenticated, setAuthenticated] = useState(false);

    // Roles are only known once we've fetched the profile — null covers both "not logged
    // in" and "not fetched yet", so the Admin tab (FR7) stays hidden until we're sure.
    const [roles, setRoles] = useState<string[] | null>(null);
    const [permissions, setPermissions] = useState<string[] | null>(null);

    // Same fallback convention as profile/page.tsx: fullName if set, else username.
    const [displayName, setDisplayName] = useState<string | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);

    // useCart() reads the access token itself and no-ops (empty cart, no fetch) when there
    // isn't one, so it's safe to call unconditionally here — it already skips cart endpoint
    // calls for a logged-out user.
    const { totalQuantity } = useCart();

    useEffect(() => {
        function syncAuthState() {
            const token = getAccessToken();
            setAuthenticated(Boolean(token));

            if (!token) {
                setRoles(null);
                setPermissions(null);
                setDisplayName(null);
                return;
            }

            void getMyProfile(token)
                .then((response) => {
                    setRoles(
                        response.data.roles?.map((r) => r.toUpperCase()) ?? null,
                    );
                    setPermissions(response.data.permissions ?? null);
                    setDisplayName(response.data.fullName || response.data.username);
                })
                .catch((error) => {
                    if (!(error instanceof ApiError)) throw error;
                    setRoles(null);
                    setPermissions(null);
                    setDisplayName(null);
                });
        }

        function handleOutsideClick(event: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setMenuOpen(false);
            }
        }

        syncAuthState();

        window.addEventListener("auth-change", syncAuthState);
        document.addEventListener("mousedown", handleOutsideClick);

        return () => {
            window.removeEventListener("auth-change", syncAuthState);
            document.removeEventListener(
                "mousedown",
                handleOutsideClick,
            );
        };
    }, []);

    function handleLogout() {
        removeAccessToken();
        setAuthenticated(false);
        setRoles(null);
        setPermissions(null);
        setDisplayName(null);
        setMenuOpen(false);
        router.push("/login");
        router.refresh();
    }

    return (
        <header
            className={cn(
                "sticky top-0 z-50 grid min-h-[72px] grid-cols-[minmax(190px,1fr)_auto_minmax(190px,1fr)]",
                "items-center gap-6 border-b border-border bg-bg/92 px-[clamp(1rem,3vw,2.5rem)] py-3",
                "backdrop-blur-[14px]",
                "max-[900px]:grid-cols-[1fr_auto] max-sm:min-h-16 max-sm:px-[0.85rem] max-sm:py-[0.65rem]",
            )}
        >
            <Link
                href="/"
                className={cn(
                    "justify-self-start whitespace-nowrap font-heading text-[clamp(1rem,1.8vw,1.3rem)]",
                    "font-bold tracking-[0.08em] text-text no-underline transition-[color,translate]",
                    "duration-200 ease-[ease] hover:-translate-y-px hover:text-accent-dark",
                    "max-sm:text-[0.98rem]",
                )}
            >
                SMART EYEWEAR
            </Link>

            <nav
                className={cn(
                    "flex items-center justify-center gap-[clamp(1rem,2.4vw,2rem)]",
                    "max-[900px]:col-span-full max-[900px]:row-start-2 max-[900px]:w-full",
                    "max-[900px]:justify-start max-[900px]:overflow-x-auto max-[900px]:pt-[0.15rem]",
                    "max-[900px]:[scrollbar-width:none] max-[900px]:[&::-webkit-scrollbar]:hidden",
                    "max-sm:gap-[1.1rem]",
                )}
                aria-label="Điều hướng chính"
            >
                <Link
                    href="/"
                    className={navLinkClass(pathname, "/")}
                    aria-current={isNavLinkActive(pathname, "/") ? "page" : undefined}
                >
                    Sản phẩm
                </Link>

                <Link
                    href="/face-analysis"
                    className={navLinkClass(pathname, "/face-analysis")}
                    aria-current={isNavLinkActive(pathname, "/face-analysis") ? "page" : undefined}
                >
                    Phân tích khuôn mặt
                </Link>

                <Link
                    href="/try-on"
                    className={navLinkClass(pathname, "/try-on")}
                    aria-current={isNavLinkActive(pathname, "/try-on") ? "page" : undefined}
                >
                    Thử Kính
                </Link>

                {authenticated && (
                    roles?.some((r) => ADMIN_ROLE_NAMES.includes(r)) ||
                    permissions?.includes(CATALOG_PERMISSION)
                ) && (
                    <Link
                        href={roles?.some((r) => ADMIN_ROLE_NAMES.includes(r)) ? "/admin/products" : "/admin/brands"}
                        className={navLinkClass(pathname, "/admin")}
                        aria-current={isNavLinkActive(pathname, "/admin") ? "page" : undefined}
                    >
                        Quản trị
                    </Link>
                )}
            </nav>

            <div className="flex items-center justify-self-end gap-3 max-[900px]:col-start-2 max-[900px]:row-start-1">
                {authenticated ? (
                    <div
                        className="relative"
                        ref={menuRef}
                    >
                        <button
                            type="button"
                            className={cn(
                                "flex min-h-11 cursor-pointer items-center gap-[0.65rem] rounded-full border",
                                "border-border bg-surface py-[0.3rem] pr-[0.8rem] pl-[0.35rem] font-body text-text",
                                "transition-[border-color,box-shadow,translate] duration-200 ease-[ease]",
                                "hover:-translate-y-px hover:border-[rgba(43,36,32,0.28)]",
                                "hover:shadow-[0_8px_22px_rgba(43,36,32,0.1)] hover:outline-none",
                                "focus-visible:-translate-y-px focus-visible:border-[rgba(43,36,32,0.28)]",
                                "focus-visible:shadow-[0_8px_22px_rgba(43,36,32,0.1)] focus-visible:outline-none",
                                "max-sm:pr-[0.45rem]",
                            )}
                            onClick={() =>
                                setMenuOpen((current) => !current)
                            }
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                        >
              <span
                  className={cn(
                      "inline-flex h-[34px] w-[34px] items-center justify-center rounded-full",
                      "bg-[linear-gradient(145deg,var(--color-text),var(--color-accent-dark))]",
                      "text-[0.78rem] font-[750] tracking-[0.02em] text-surface",
                  )}
              >
                {(displayName ?? "U").charAt(0).toUpperCase()}
              </span>

                            <span
                                className={cn(
                                    "max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap",
                                    "text-[0.87rem] font-[650] text-text max-sm:hidden",
                                )}
                            >
                {displayName ?? "Tài khoản"}
              </span>

                            <svg
                                className={cn(
                                    "shrink-0 text-text-muted transition-transform duration-200 ease-[ease]",
                                    "max-sm:hidden",
                                    menuOpen && "rotate-180",
                                )}
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>

                        {menuOpen && (
                            <div
                                className={cn(
                                    "absolute top-[calc(100%_+_0.65rem)] right-0 z-[100]",
                                    "w-[min(245px,calc(100vw_-_2rem))] rounded-[14px] border border-border",
                                    "bg-surface p-2 shadow-[0_20px_50px_rgba(43,36,32,0.16)]",
                                    "animate-account-menu-in",
                                )}
                                role="menu"
                            >
                                <Link
                                    href="/profile"
                                    className={ACCOUNT_MENU_ITEM_DEFAULT_CLASS}
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                >
                  <span className={ACCOUNT_MENU_ICON_CLASS}>
                    👤
                  </span>
                                    Thông tin cá nhân
                                </Link>

                                <Link
                                    href="/orders"
                                    className={ACCOUNT_MENU_ITEM_DEFAULT_CLASS}
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                >
                  <span className={ACCOUNT_MENU_ICON_CLASS}>
                    📦
                  </span>
                                    Đơn hàng của tôi
                                </Link>

                                <Link
                                    href="/change-password"
                                    className={ACCOUNT_MENU_ITEM_DEFAULT_CLASS}
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                >
                  <span className={ACCOUNT_MENU_ICON_CLASS}>
                    🔒
                  </span>
                                    Đổi mật khẩu
                                </Link>

                                <div className="mx-1 my-[0.35rem] h-px bg-border" />

                                <button
                                    type="button"
                                    className={ACCOUNT_MENU_ITEM_DANGER_CLASS}
                                    onClick={handleLogout}
                                    role="menuitem"
                                >
                  <span className={ACCOUNT_MENU_ICON_CLASS}>
                    ↪
                  </span>
                                    Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-[0.65rem]">
                        <Link
                            href="/login"
                            className={cn(
                                NAV_LINK_CLASS,
                                "text-text-secondary after:scale-x-0 max-sm:hidden",
                            )}
                        >
                            Đăng nhập
                        </Link>

                        <Link
                            href="/register"
                            className={cn(
                                "inline-flex min-h-10 items-center justify-center rounded-full border border-text",
                                "bg-text px-4 text-[0.88rem] font-[650] text-surface no-underline",
                                "transition-[background-color,color,translate,box-shadow] duration-200 ease-[ease]",
                                "hover:-translate-y-px hover:border-accent-dark hover:bg-accent-dark hover:text-surface",
                                "hover:shadow-[0_8px_22px_rgba(43,36,32,0.14)]",
                                "max-sm:min-h-[38px] max-sm:px-[0.85rem] max-sm:text-[0.82rem]",
                            )}
                        >
                            Đăng ký
                        </Link>
                    </div>
                )}

                <Link
                    href="/cart"
                    className={cn(
                        "relative inline-flex h-[42px] w-[42px] cursor-pointer items-center justify-center",
                        "rounded-full border border-border bg-surface p-0 text-text opacity-72",
                        "max-sm:hidden",
                    )}
                    aria-label="Giỏ hàng"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                    >
                        <path d="M3 6h18l-1.5 12a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2L3 6z" />
                        <path d="M8 10V6a4 4 0 1 1 8 0v4" />
                    </svg>

                    <span
                        className={cn(
                            "absolute -top-1 -right-1 flex h-[17px] w-[17px] items-center justify-center",
                            "rounded-full bg-accent text-[10px] font-bold text-surface",
                        )}
                    >
            {totalQuantity}
          </span>
                </Link>
            </div>
        </header>
    );
}
