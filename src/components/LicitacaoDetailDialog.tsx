import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ExternalLink, Building2, MapPin, Calendar, Tag, FileText, Trophy } from "lucide-react";
import MinhaParticipacaoBlock from "@/components/MinhaParticipacaoBlock";

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}
function fmtDate(d: any) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return String(d); }
}
function fmtCnpj(c?: string | null) {
  if (!c) return "—";
  const d = c.replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

interface Props {
  licitacaoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LicitacaoDetailDialog({ licitacaoId, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["licitacao-detail", licitacaoId],
    enabled: !!licitacaoId && open,
    queryFn: async () => {
      const [{ data: lic, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
        supabase.from("licitacoes").select("*").eq("id", licitacaoId!).maybeSingle(),
        supabase.from("licitacao_itens").select("*").eq("licitacao_id", licitacaoId!).order("numero_item", { ascending: true }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const itemIds = (itens ?? []).map((i) => i.id);
      let vencedores: any[] = [];
      if (itemIds.length) {
        const { data: v, error: e3 } = await supabase
          .from("licitacao_vencedores")
          .select("*")
          .in("item_id", itemIds);
        if (e3) throw e3;
        vencedores = v ?? [];
      }
      return { lic, itens: itens ?? [], vencedores };
    },
  });

  const lic = data?.lic;
  const itens = data?.itens ?? [];
  const vencedores = data?.vencedores ?? [];
  const vencedoresByItem = vencedores.reduce<Record<string, any[]>>((acc, v) => {
    (acc[v.item_id] ||= []).push(v);
    return acc;
  }, {});

  const totalVencedores = vencedores.length;
  const valorTotalVencido = vencedores.reduce((s, v) => s + Number(v.valor_final ?? 0), 0);
  const pncpUrl = lic?.numero_controle_pncp
    ? `https://pncp.gov.br/app/editais/${encodeURIComponent(lic.numero_controle_pncp)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Detalhes da Licitação
          </DialogTitle>
        </DialogHeader>

        {isLoading || !lic ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Objeto</div>
              <p className="text-sm leading-relaxed">{lic.objeto || "—"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Info icon={<Building2 className="h-3.5 w-3.5" />} label="Órgão" value={lic.orgao} />
              <Info icon={<MapPin className="h-3.5 w-3.5" />} label="Local" value={`${lic.municipio ?? "—"}/${lic.uf ?? "—"}`} />
              <Info icon={<Tag className="h-3.5 w-3.5" />} label="Modalidade" value={lic.modalidade} />
              <Info icon={<Tag className="h-3.5 w-3.5" />} label="Situação" value={lic.situacao} />
              <Info icon={<Calendar className="h-3.5 w-3.5" />} label="Publicação" value={fmtDate(lic.data_publicacao)} />
              <Info icon={<Calendar className="h-3.5 w-3.5" />} label="Resultado" value={fmtDate(lic.data_resultado)} />
              <Info label="Valor estimado" value={fmtMoney(lic.valor_estimado)} />
              <Info label="Valor homologado" value={fmtMoney(lic.valor_homologado)} highlight />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Itens</div>
                <div className="font-display text-xl font-bold">{itens.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Vencedores</div>
                <div className="font-display text-xl font-bold">{totalVencedores}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Valor total vencido</div>
                <div className="font-display text-xl font-bold text-emerald-600">{fmtMoney(valorTotalVencido)}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {lic.fonte && <span className="rounded-full bg-muted px-2 py-0.5">Fonte: {lic.fonte}</span>}
              {lic.id_origem && <span className="rounded-full bg-muted px-2 py-0.5 font-mono">ID origem: {lic.id_origem}</span>}
              {lic.numero_controle_pncp && <span className="rounded-full bg-muted px-2 py-0.5 font-mono">PNCP: {lic.numero_controle_pncp}</span>}
              {pncpUrl && (
                <a href={pncpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Abrir no PNCP <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {licitacaoId && <MinhaParticipacaoBlock licitacaoId={licitacaoId} />}


            {itens.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="h-4 w-4 text-primary" /> Itens e vencedores
                </h3>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 w-12">#</th>
                        <th className="px-3 py-2">Descrição</th>
                        <th className="px-3 py-2 text-right">Qtd</th>
                        <th className="px-3 py-2 text-right">V. Unit. Est.</th>
                        <th className="px-3 py-2 text-right">V. Unit. Final</th>
                        <th className="px-3 py-2">Vencedor(es)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((it) => {
                        const vs = vencedoresByItem[it.id] ?? [];
                        return (
                          <tr key={it.id} className="border-b border-border align-top">
                            <td className="px-3 py-2 text-xs text-muted-foreground">{it.numero_item ?? "—"}</td>
                            <td className="px-3 py-2 max-w-md"><div className="line-clamp-3">{it.descricao || "—"}</div></td>
                            <td className="px-3 py-2 text-right">{it.quantidade ?? "—"} {it.unidade ?? ""}</td>
                            <td className="px-3 py-2 text-right text-xs">{fmtMoney(it.valor_unitario_estimado)}</td>
                            <td className="px-3 py-2 text-right text-xs">{fmtMoney(it.valor_unitario_final)}</td>
                            <td className="px-3 py-2">
                              {vs.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div className="space-y-1">
                                  {vs.map((v) => (
                                    <div key={v.id} className="rounded bg-muted/40 px-2 py-1 text-xs">
                                      <div className="font-medium line-clamp-1">{v.razao_social || "—"}</div>
                                      <div className="font-mono text-[10px] text-muted-foreground">{fmtCnpj(v.cnpj)}</div>
                                      <div className="mt-0.5 flex justify-between gap-2">
                                        <span className="text-emerald-600 font-semibold">{fmtMoney(v.valor_final)}</span>
                                        {v.percentual_desconto != null && (
                                          <span className="text-muted-foreground">{Number(v.percentual_desconto).toFixed(2)}% desc.</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon, label, value, highlight }: { icon?: React.ReactNode; label: string; value: any; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`mt-1 text-sm ${highlight ? "font-bold text-emerald-600" : "font-medium"} line-clamp-2`}>{value || "—"}</div>
    </div>
  );
}
