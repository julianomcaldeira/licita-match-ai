import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvento } from "@/hooks/useTracking";
import { cn } from "@/lib/utils";

function PageViewTracker() {
  const { user, empresaId } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (!user?.id) return;
    // Normalize path: replace UUIDs / numeric IDs to reduce cardinality
    const page = location.pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      .replace(/\/\d+/g, "/:id");
    trackEvento("page_view", { page, path: location.pathname }, { userId: user.id, empresaId });
  }, [location.pathname, user?.id, empresaId]);
  return null;
}

const STORAGE_KEY = "ipesquisei:sidebar-collapsed";

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background">
      <PageViewTracker />
      <AppSidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      <div
        className={cn(
          "flex flex-1 flex-col transition-[margin] duration-300 ease-out",
          collapsed ? "lg:ml-[76px]" : "lg:ml-[248px]"
        )}
      >
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
