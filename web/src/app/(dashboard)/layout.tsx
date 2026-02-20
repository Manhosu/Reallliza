"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Calendar,
  Users,
  Building2,
  Wrench,
  FileBarChart,
  Settings,
  ChevronLeft,
  Search,
  Bell,
  Moon,
  Sun,
  LogOut,
  User,
  Menu,
  X,
  ChevronRight,
  Shield,
  Check,
  Megaphone,
  MapPin,
  Star,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserRole, type Notification } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { notificationsApi } from "@/lib/api";
import { TermsModal } from "@/components/terms-modal";

// ============================================================
// Navigation Configuration
// ============================================================

const allNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER],
  },
  {
    label: "Feed",
    href: "/feed",
    icon: Megaphone,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER],
  },
  {
    label: "Ordens de Serviço",
    href: "/os",
    icon: ClipboardList,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER],
  },
  {
    label: "Propostas",
    href: "/propostas",
    icon: Send,
    roles: [UserRole.ADMIN, UserRole.PARTNER],
  },
  {
    label: "Agenda",
    href: "/agenda",
    icon: Calendar,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN],
  },
  {
    label: "Mapa",
    href: "/mapa",
    icon: MapPin,
    roles: [UserRole.ADMIN],
  },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    roles: [UserRole.ADMIN],
  },
  {
    label: "Parceiros",
    href: "/parceiros",
    icon: Building2,
    roles: [UserRole.ADMIN],
  },
  {
    label: "Ferramentas",
    href: "/ferramentas",
    icon: Wrench,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN],
  },
  {
    label: "Checklists",
    href: "/checklists",
    icon: ClipboardCheck,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN],
  },
  {
    label: "Avaliações",
    href: "/avaliacoes",
    icon: Star,
    roles: [UserRole.ADMIN],
  },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: FileBarChart,
    roles: [UserRole.ADMIN],
  },
  {
    label: "Auditoria",
    href: "/auditoria",
    icon: Shield,
    roles: [UserRole.ADMIN],
  },
  {
    label: "Notificações",
    href: "/notificacoes",
    icon: Bell,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER],
  },
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: Settings,
    roles: [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER],
  },
];

// ============================================================
// Breadcrumb Helper
// ============================================================

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Dashboard",
  feed: "Feed",
  os: "Ordens de Serviço",
  propostas: "Propostas",
  agenda: "Agenda",
  mapa: "Mapa",
  usuarios: "Usuários",
  parceiros: "Parceiros",
  ferramentas: "Ferramentas",
  checklists: "Checklists",
  avaliacoes: "Avaliações",
  relatorios: "Relatórios",
  auditoria: "Auditoria",
  notificacoes: "Notificações",
  configuracoes: "Configurações",
  nova: "Nova",
  novo: "Novo",
  editar: "Editar",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getBreadcrumbLabel(segment: string): string {
  if (breadcrumbLabels[segment]) return breadcrumbLabels[segment];
  if (UUID_REGEX.test(segment)) return "Detalhes";
  return segment;
}

// ============================================================
// Dashboard Layout
// ============================================================

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuthStore();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Filter nav items based on user role
  const navItems = useMemo(() => {
    const role = user?.role as UserRole | undefined;
    const filtered = allNavItems.filter((item) =>
      role ? item.roles.includes(role) : true
    );
    // For partner, rename "Ordens de Serviço" to "Meus Chamados"
    if (role === UserRole.PARTNER) {
      return filtered.map((item) =>
        item.href === "/os"
          ? { ...item, label: "Meus Chamados" }
          : item
      );
    }
    return filtered;
  }, [user?.role]);

  // Fetch unread notification count
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const fetchCount = async () => {
      try {
        const result = await notificationsApi.getUnreadCount();
        if (!cancelled) {
          setNotificationCount(result.unread_count);
        }
      } catch {
        // Notification count fetch is a background operation; no need to toast on failure
      }
    };

    fetchCount();

    const interval = setInterval(fetchCount, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  // Dark mode toggle
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    if (!isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Fetch recent notifications when dropdown opens
  const fetchNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const result = await notificationsApi.list({ limit: 5 });
      setNotifications(result.data);
    } catch {
      // Silent fail for notifications fetch
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const handleToggleNotifDropdown = () => {
    const next = !showNotifDropdown;
    setShowNotifDropdown(next);
    if (next) {
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotificationCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch {
      // Silent fail
    }
  };

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notifDropdownRef.current &&
        !notifDropdownRef.current.contains(e.target as Node)
      ) {
        setShowNotifDropdown(false);
      }
    };
    if (showNotifDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifDropdown]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
    setShowNotifDropdown(false);
  }, [pathname]);

  // Build breadcrumbs
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => ({
    label: getBreadcrumbLabel(segment),
    href: "/" + segments.slice(0, index + 1).join("/"),
    isLast: index === segments.length - 1,
  }));

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/os?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  // Time ago helper
  const timeAgo = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Agora";
    if (diffMin < 60) return `${diffMin}min atrás`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const sidebarWidth = isCollapsed ? "w-[72px]" : "w-[280px]";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border transition-all duration-300 ease-in-out lg:relative lg:z-auto",
          sidebarWidth,
          // Glassmorphism
          "bg-sidebar/80 backdrop-blur-xl",
          // Mobile
          isMobileOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border px-4",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!isCollapsed && (
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  R
                </span>
              </div>
              <span className="text-base font-semibold text-sidebar-foreground">
                Reallliza
              </span>
            </Link>
          )}
          {isCollapsed && (
            <Link href="/dashboard">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  R
                </span>
              </div>
            </Link>
          )}
          {/* Close button on mobile */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="text-sidebar-muted hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isCollapsed && "justify-center px-0",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                    }}
                  />
                )}

                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive
                      ? "text-primary"
                      : "text-sidebar-muted group-hover:text-sidebar-foreground"
                  )}
                />

                {!isCollapsed && <span>{item.label}</span>}

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 hidden rounded-lg bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg group-hover:block">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Toggle (desktop only) */}
        <div className="hidden border-t border-sidebar-border px-3 py-2 lg:block">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isCollapsed && "justify-center px-0"
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Recolher</span>
              </>
            )}
          </button>
        </div>

        {/* User Section */}
        <div className="relative border-t border-sidebar-border p-3">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-sidebar-accent",
              isCollapsed && "justify-center px-0"
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            {!isCollapsed && (
              <div className="flex-1 overflow-hidden text-left">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {user?.full_name || "Usuário"}
                </p>
                <p className="truncate text-xs text-sidebar-muted">
                  {user?.email || ""}
                </p>
              </div>
            )}
          </button>

          {/* User dropdown */}
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className={cn(
                  "absolute bottom-full mb-2 rounded-xl border bg-popover p-1 shadow-lg",
                  isCollapsed ? "left-full ml-2" : "left-3 right-3"
                )}
              >
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent">
                  <User className="h-4 w-4" />
                  Meu Perfil
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative flex flex-1 flex-col">
        {/* Top Header Bar */}
        <header className="relative z-50 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-6">
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Breadcrumb */}
            <nav className="hidden items-center gap-1.5 text-sm md:flex">
              <Link
                href="/dashboard"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Início
              </Link>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.href} className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  {crumb.isLast ? (
                    <span className="font-medium text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Global Search */}
            <form onSubmit={handleSearch} className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar OS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-xl border border-input bg-secondary/50 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                /
              </kbd>
            </form>

            {/* Notifications */}
            <div className="relative" ref={notifDropdownRef}>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={handleToggleNotifDropdown}
              >
                <Bell className="h-5 w-5" />
                {notificationCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {notificationCount}
                  </span>
                )}
              </Button>

              {/* Notification Dropdown */}
              <AnimatePresence>
                {showNotifDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-popover shadow-lg"
                  >
                    {/* Dropdown Header */}
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        Notificações
                      </h4>
                      {notificationCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          <Check className="h-3 w-3" />
                          Marcar todas como lidas
                        </button>
                      )}
                    </div>

                    {/* Dropdown Body */}
                    <div className="max-h-[320px] overflow-y-auto">
                      {loadingNotifications ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8">
                          <Bell className="h-8 w-8 text-muted-foreground/30" />
                          <p className="text-xs text-muted-foreground">
                            Nenhuma notificação
                          </p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <Link
                            key={notif.id}
                            href="/notificacoes"
                            onClick={() => setShowNotifDropdown(false)}
                            className={cn(
                              "flex gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50",
                              !notif.read_at && "border-l-2 border-l-yellow-500"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "truncate text-sm",
                                  !notif.read_at
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-muted-foreground"
                                )}
                              >
                                {notif.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {notif.message}
                              </p>
                              <p className="mt-1 text-[10px] text-muted-foreground/70">
                                {timeAgo(notif.created_at)}
                              </p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>

                    {/* Dropdown Footer */}
                    <div className="border-t px-4 py-2.5">
                      <Link
                        href="/notificacoes"
                        onClick={() => setShowNotifDropdown(false)}
                        className="block text-center text-xs font-medium text-primary transition-colors hover:text-primary/80"
                      >
                        Ver todas
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Dark Mode Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="h-full p-4 lg:p-6"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Terms Acceptance Modal - shown on first login if terms not accepted */}
      <TermsModal />
    </div>
  );
}
