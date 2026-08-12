// Circuit breaker por endpoint do PNCP.
//
// Antes era exclusivo de /consulta/v1/contratos. Agora cada família de
// endpoints tem seu próprio circuito no banco (public.pncp_circuit), de modo
// que uma indisponibilidade em atas ou nos itens de contrato não derruba a
// ingestão dos demais — e vice-versa.
//
// Estados e backoff continuam controlados pelas RPCs:
//   pncp_circuit_allow(source) / pncp_circuit_report(source, ok, reason)

/** Mapeia a URL do PNCP para a chave do circuito. */
export function circuitSource(url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch (_) { /* usa a string crua */ }
  const p = path.toLowerCase();

  if (p.includes("/atas")) return "atas";
  if (p.includes("/contratos") && /\/itens|\/itemcontrato/.test(p)) return "contratos_itens";
  if (p.includes("/contratos")) return "contratos";
  if (p.includes("/compras") && p.includes("/resultados")) return "compras_resultados";
  if (p.includes("/compras") && p.includes("/itens")) return "compras_itens";
  if (p.includes("/compras")) return "compras";
  if (p.includes("/contratacoes")) return "contratacoes";
  if (p.includes("/instrumentoscobranca")) return "instrumentos_cobranca";
  if (p.includes("/pca")) return "pca";
  return "outros";
}

/** Falhas que caracterizam indisponibilidade da fonte (abrem o circuito). */
export function isSourceOutage(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("abort") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("http 429") ||
    /http 5\d\d/.test(m) ||
    m.includes("error sending request") ||
    m.includes("connection")
  );
}

export class CircuitOpenError extends Error {
  constructor(public source: string, public retryAt: string | null) {
    super(`circuit_open:${source}`);
    this.name = "CircuitOpenError";
  }
}

interface CacheEntry {
  allowed: boolean;
  retryAt: string | null;
  checkedAt: number;
}

/** Gerencia os circuitos de todos os endpoints usados numa execução. */
export class PncpCircuits {
  private cache = new Map<string, CacheEntry>();
  // enquanto aberto, não vale a pena reconsultar o banco a cada request
  private readonly ttlMs = 15_000;

  constructor(private supabase: any) {}

  /** Consulta (com cache curto) se o endpoint pode ser chamado. */
  async allow(url: string): Promise<{ allowed: boolean; source: string; retryAt: string | null }> {
    const source = circuitSource(url);
    const cached = this.cache.get(source);
    if (cached && Date.now() - cached.checkedAt < this.ttlMs) {
      return { allowed: cached.allowed, source, retryAt: cached.retryAt };
    }
    try {
      const { data, error } = await this.supabase.rpc("pncp_circuit_allow", { p_source: source });
      if (error) return { allowed: true, source, retryAt: null };
      if (data === false) {
        const { data: st } = await this.supabase
          .from("pncp_circuit")
          .select("open_until")
          .eq("source", source)
          .maybeSingle();
        const entry = { allowed: false, retryAt: st?.open_until ?? null, checkedAt: Date.now() };
        this.cache.set(source, entry);
        return { allowed: false, source, retryAt: entry.retryAt };
      }
      // em half_open a sondagem é liberada; não cacheia para não liberar várias
      this.cache.delete(source);
      return { allowed: true, source, retryAt: null };
    } catch (_) {
      return { allowed: true, source, retryAt: null };
    }
  }

  /** Lança CircuitOpenError se o endpoint estiver pausado. */
  async ensure(url: string): Promise<void> {
    const g = await this.allow(url);
    if (!g.allowed) throw new CircuitOpenError(g.source, g.retryAt);
  }

  /** Registra o resultado da chamada no circuito do endpoint. */
  async report(url: string, ok: boolean, reason?: string | null): Promise<void> {
    const source = circuitSource(url);
    this.cache.delete(source);
    try {
      await this.supabase.rpc("pncp_circuit_report", {
        p_source: source,
        p_ok: ok,
        p_reason: reason ? String(reason).slice(0, 300) : null,
      });
    } catch (_) { /* best-effort */ }
  }

  /** Reporta apenas quando a falha caracteriza indisponibilidade da fonte. */
  async reportOutcome(url: string, ok: boolean, reason?: string | null): Promise<void> {
    if (ok) return this.report(url, true);
    if (isSourceOutage(String(reason ?? ""))) return this.report(url, false, reason);
  }
}
