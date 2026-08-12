// Coletor de métricas por endpoint do PNCP.
// Agrega em memória durante a execução (bucket por minuto + endpoint) e
// descarrega em public.pncp_endpoint_metrics via RPC pncp_metrics_record.

export interface EndpointSample {
  endpoint: string;
  latencyMs: number;
  status?: number | null;
  ok: boolean;
  aborted?: boolean;
  retry?: boolean;
  error?: string | null;
}

interface Row {
  bucket: string;
  endpoint: string;
  function_name: string;
  requests: number;
  errors: number;
  aborts: number;
  retries: number;
  http_429: number;
  http_4xx: number;
  http_5xx: number;
  latency_ms_sum: number;
  latency_ms_max: number;
  last_error: string | null;
}

/** Normaliza a URL do PNCP num rótulo estável de endpoint. */
export function classifyEndpoint(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname
      .replace(/\/\d{14}(?=\/|$)/g, "/{cnpj}")
      .replace(/\/\d{5,}(?=\/|$)/g, "/{id}")
      .replace(/\/(19|20)\d{2}(?=\/|$)/g, "/{ano}")
      .replace(/\/\d+(?=\/|$)/g, "/{n}");
    return path.slice(0, 120);
  } catch (_) {
    return "desconhecido";
  }
}

function bucketNow(): string {
  const d = new Date();
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

export class PncpMetrics {
  private rows = new Map<string, Row>();
  constructor(private functionName: string) {}

  record(s: EndpointSample) {
    const bucket = bucketNow();
    const key = `${bucket}|${s.endpoint}`;
    let r = this.rows.get(key);
    if (!r) {
      r = {
        bucket,
        endpoint: s.endpoint,
        function_name: this.functionName,
        requests: 0,
        errors: 0,
        aborts: 0,
        retries: 0,
        http_429: 0,
        http_4xx: 0,
        http_5xx: 0,
        latency_ms_sum: 0,
        latency_ms_max: 0,
        last_error: null,
      };
      this.rows.set(key, r);
    }
    r.requests++;
    r.latency_ms_sum += Math.max(0, Math.round(s.latencyMs));
    r.latency_ms_max = Math.max(r.latency_ms_max, Math.round(s.latencyMs));
    if (s.retry) r.retries++;
    if (s.aborted) r.aborts++;
    if (!s.ok) {
      r.errors++;
      if (s.error) r.last_error = String(s.error).slice(0, 300);
    }
    const st = s.status ?? 0;
    if (st === 429) r.http_429++;
    else if (st >= 500) r.http_5xx++;
    else if (st >= 400) r.http_4xx++;
  }

  /** Envelopa um fetch, medindo latência/erros/aborts. */
  async timed(
    url: string,
    run: () => Promise<Response>,
    opts: { retry?: boolean } = {},
  ): Promise<Response> {
    const endpoint = classifyEndpoint(url);
    const t0 = Date.now();
    try {
      const resp = await run();
      this.record({
        endpoint,
        latencyMs: Date.now() - t0,
        status: resp.status,
        ok: resp.status < 400 || resp.status === 404 || resp.status === 204,
        retry: opts.retry,
        error: resp.status >= 400 ? `HTTP ${resp.status}` : null,
      });
      return resp;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.record({
        endpoint,
        latencyMs: Date.now() - t0,
        ok: false,
        aborted: /abort|timeout|timed out/i.test(msg),
        retry: opts.retry,
        error: msg,
      });
      throw e;
    }
  }

  size() {
    return this.rows.size;
  }

  async flush(supabase: any) {
    if (this.rows.size === 0) return;
    const payload = Array.from(this.rows.values());
    this.rows.clear();
    try {
      await supabase.rpc("pncp_metrics_record", { p_rows: payload });
    } catch (_) {
      /* best-effort: métricas nunca derrubam a ingestão */
    }
  }
}
