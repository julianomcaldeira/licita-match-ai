import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type EventoTipo = "page_view" | "busca" | "ia_consulta" | "export";

/**
 * Registra um evento na tabela `uso_eventos` de forma assíncrona.
 * Nunca lança e nunca bloqueia a UI — se falhar, ignora silenciosamente.
 */
export function trackEvento(
  evento: EventoTipo,
  contexto: Record<string, unknown> | undefined,
  auth: { userId: string | null | undefined; empresaId: string | null | undefined }
) {
  if (!auth.userId) return;
  // Fire-and-forget: microtask + catch silencioso
  queueMicrotask(() => {
    try {
      const payload = {
        user_id: auth.userId,
        empresa_cliente_id: auth.empresaId ?? null,
        evento,
        contexto: contexto ?? {},
      };
      supabase
        .from("uso_eventos")
        .insert(payload as any)
        .then(() => {})
        .then(undefined, () => {});
    } catch {
      /* silencioso */
    }
  });
}

/**
 * Hook helper que devolve uma função `track` já com user/empresa injetados.
 */
export function useTracker() {
  const { user, empresaId } = useAuth();
  return (evento: EventoTipo, contexto?: Record<string, unknown>) =>
    trackEvento(evento, contexto, { userId: user?.id, empresaId });
}

/**
 * Registra automaticamente um `page_view` quando a página monta.
 */
export function usePageView(pageName: string, extra?: Record<string, unknown>) {
  const { user, empresaId } = useAuth();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    const key = `${user.id}:${pageName}`;
    if (sent.current === key) return;
    sent.current = key;
    trackEvento("page_view", { page: pageName, ...(extra ?? {}) }, { userId: user.id, empresaId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pageName]);
}
