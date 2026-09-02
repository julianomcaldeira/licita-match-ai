interface LicitacaoStatusBadgeProps {
  situacao: string | null;
  hasWinner?: boolean;
  valorHomologado?: number | null;
}

export function LicitacaoStatusBadge({
  situacao,
  hasWinner,
  valorHomologado,
}: LicitacaoStatusBadgeProps) {
  const hasResult = hasWinner || (valorHomologado != null && valorHomologado > 0);
  if (!situacao && !hasResult) return <span className="text-muted-foreground text-xs">—</span>;

  const displayStatus = hasResult ? "Com Resultado" : situacao;
  const normalized = (displayStatus || "").toLowerCase();

  const color =
    hasResult ||
    normalized.includes("homologad") ||
    normalized.includes("conclu") ||
    normalized.includes("resultado")
      ? "bg-success/10 text-success border-success/20"
      : normalized.includes("andamento") ||
        normalized.includes("abert") ||
        normalized.includes("divulgada")
      ? "bg-info/10 text-info border-info/20"
      : normalized.includes("revogad") ||
        normalized.includes("anulad") ||
        normalized.includes("suspens")
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {displayStatus || "—"}
    </span>
  );
}

export default LicitacaoStatusBadge;
