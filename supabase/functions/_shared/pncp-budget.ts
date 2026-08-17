// Orçamento adaptativo de timeout/retry por endpoint do PNCP.
//
// Lê as métricas recentes (public.pncp_endpoint_metrics via RPC
// pncp_endpoint_budgets) e deriva, para cada endpoint:
//   - timeoutMs: ~3x a latência média recente (piso no maior tempo observado)
//   - maxRetries: mais retentativas quando há instabilidade, menos quando a
//     fonte está fora do ar
//   - baseBackoffMs: espera base entre tentativas
//
// Objetivo: parar de cancelar chamadas prematuramente quando o PNCP está
// degradado (as respostas demoram, mas chegam).

import { classifyEndpoint } from "./pncp-metrics.ts";

export interface EndpointBudget {
  timeoutMs: number;
  maxRetries: number;
  baseBackoffMs: number;
}

export const DEFAULT_BUDGET: EndpointBudget = {
  timeoutMs: 20_000,
  maxRetries: 3,
  baseBackoffMs: 1200,
};

const MIN_TIMEOUT = 8_000;
const MAX_TIMEOUT = 75_000;

export class PncpBudgets {
  private map = new Map<string, EndpointBudget>();
  private fallback: EndpointBudget = { ...DEFAULT_BUDGET };

  constructor(private windowMinutes = 30) {}

  /** Carrega os orçamentos do banco. Best-effort: nunca derruba a ingestão. */
  async load(supabase: any): Promise<void> {
    try {
      const { data, error } = await supabase.rpc("pncp_endpoint_budgets", {
        p_minutes: this.windowMinutes,
      });
      if (error || !Array.isArray(data)) return;
      let sumTimeout = 0;
      let n = 0;
      for (const row of data) {
        const b: EndpointBudget = {
          timeoutMs: clamp(Number(row.timeout_ms) || DEFAULT_BUDGET.timeoutMs),
          maxRetries: Math.max(1, Math.min(4, Number(row.max_retries) || DEFAULT_BUDGET.maxRetries)),
          baseBackoffMs: Math.max(
            500,
            Math.min(8_000, Number(row.base_backoff_ms) || DEFAULT_BUDGET.baseBackoffMs),
          ),
        };
        this.map.set(String(row.endpoint), b);
        sumTimeout += b.timeoutMs;
        n++;
      }
      if (n > 0) {
        // fallback para endpoints ainda sem histórico: média da fonte
        this.fallback = {
          timeoutMs: clamp(Math.round(sumTimeout / n)),
          maxRetries: DEFAULT_BUDGET.maxRetries,
          baseBackoffMs: DEFAULT_BUDGET.baseBackoffMs,
        };
      }
    } catch (_) {
      /* mantém defaults */
    }
  }

  /** Orçamento para a URL informada. */
  for(url: string): EndpointBudget {
    return this.map.get(classifyEndpoint(url)) ?? this.fallback;
  }

  /**
   * Timeout da tentativa `attempt` (0-based): cresce a cada retentativa,
   * respeitando o teto e, se informado, o tempo restante da execução.
   */
  timeoutFor(url: string, attempt: number, remainingMs?: number): number {
    const b = this.for(url);
    let t = clamp(Math.round(b.timeoutMs * (1 + attempt * 0.5)));
    if (typeof remainingMs === "number" && Number.isFinite(remainingMs)) {
      t = Math.max(5_000, Math.min(t, remainingMs - 2_000));
    }
    return t;
  }

  /** Espera antes da próxima tentativa, com jitter. */
  backoffFor(url: string, attempt: number): number {
    const b = this.for(url);
    return b.baseBackoffMs * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
  }

  retriesFor(url: string): number {
    return this.for(url).maxRetries;
  }

  /** Snapshot para logs/telemetria. */
  snapshot(): Record<string, EndpointBudget> {
    return Object.fromEntries(this.map.entries());
  }
}

function clamp(ms: number): number {
  return Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, ms));
}
