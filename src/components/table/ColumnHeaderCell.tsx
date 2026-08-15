import { ReactNode, useState } from "react";
import { ArrowDownUp, Filter, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type SortState = "none" | "active";

type Props = {
  id: string;
  label: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  /** Conteúdo do popover de filtro da coluna. Ausente = coluna sem filtro. */
  filter?: ReactNode;
  /** Indica se há filtro aplicado nesta coluna. */
  filterActive?: boolean;
  onClearFilter?: () => void;
  onApplyFilter?: () => void;
  /** Ordenação: se definido, mostra o botão de ordenar. */
  sortActive?: boolean;
  onSort?: () => void;
  onDragStartCol: (id: string) => void;
  onDropCol: (id: string) => void;
  isDragging?: boolean;
};

export default function ColumnHeaderCell({
  id,
  label,
  align = "left",
  className,
  filter,
  filterActive,
  onClearFilter,
  onApplyFilter,
  sortActive,
  onSort,
  onDragStartCol,
  onDropCol,
  isDragging,
}: Props) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <th
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        onDragStartCol(id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropCol(id);
      }}
      className={cn(
        "group select-none px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        over && "bg-primary/10",
        isDragging && "opacity-50",
        filterActive && "bg-primary/5 text-primary",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          align === "right" && "justify-end",
          align === "center" && "justify-center"
        )}
      >
        <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="truncate">{label}</span>

        {filter && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "rounded p-0.5 transition-colors hover:bg-secondary",
                  filterActive ? "text-primary opacity-100" : "text-muted-foreground/60 opacity-0 group-hover:opacity-100"
                )}
                title="Filtrar coluna"
              >
                <Filter className={cn("h-3 w-3", filterActive && "fill-current")} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3 normal-case tracking-normal">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  {filterActive && onClearFilter && (
                    <button
                      onClick={() => onClearFilter()}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> limpar
                    </button>
                  )}
                </div>
                <div className="text-sm font-normal text-foreground">{filter}</div>
                {onApplyFilter && (
                  <Button
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => {
                      onApplyFilter();
                      setOpen(false);
                    }}
                  >
                    Aplicar
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {onSort && (
          <button
            onClick={onSort}
            title="Ordenar por esta coluna"
            className={cn(
              "rounded p-0.5 transition-colors hover:bg-secondary",
              sortActive ? "text-primary opacity-100" : "text-muted-foreground/60 opacity-0 group-hover:opacity-100"
            )}
          >
            <ArrowDownUp className="h-3 w-3" />
          </button>
        )}
      </div>
    </th>
  );
}
