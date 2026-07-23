import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvento } from "@/hooks/useTracking";

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

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <PageViewTracker />
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col transition-all duration-300 lg:ml-[260px]">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
