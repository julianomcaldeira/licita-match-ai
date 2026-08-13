import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ComboboxMultiFilterProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  className?: string;
  onServerSearch?: (term: string) => void;
}

export default function ComboboxMultiFilter({
  values,
  onChange,
  options,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  isLoading,
  className,
  onServerSearch,
}: ComboboxMultiFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (onServerSearch) onServerSearch("");
    } else {
      setSearch("");
    }
  }, [open]);

  const handleSearchChange = (term: string) => {
    setSearch(term);
    if (onServerSearch) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onServerSearch(term), 300);
    }
  };

  const filtered = onServerSearch
    ? options
    : search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  const removeValue = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(values.filter((v) => v !== val));
  };

  const selectedLabels = values
    .map((v) => options.find((o) => o.value === v)?.label || v)
    .slice(0, 2);
  const extraCount = values.length - 2;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-auto min-h-9 w-full justify-between font-normal", !values.length && "text-muted-foreground", className)}
        >
          <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
            {values.length === 0 ? (
              <span className="truncate">{placeholder}</span>
            ) : (
              <>
                {selectedLabels.map((label, i) => (
                  <Badge
                    key={values[i]}
                    variant="secondary"
                    className="text-[11px] px-1.5 py-0 h-5 max-w-[180px] truncate shrink-0"
                  >
                    <span className="truncate">{label}</span>
                    <X
                      className="h-3 w-3 ml-1 shrink-0 opacity-50 hover:opacity-100 cursor-pointer"
                      onClick={(e) => removeValue(values[i], e)}
                    />
                  </Badge>
                ))}
                {extraCount > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                    +{extraCount}
                  </Badge>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {values.length > 0 && (
              <X
                className="h-3 w-3 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isLoading && <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <ScrollArea className="max-h-[250px]">
          <div className="p-1">
            {isLoading && filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado</div>
            ) : (
              filtered.slice(0, 100).map((option, optionIndex) => {
                const isSelected = values.includes(option.value);
                return (
                  <button
                    key={`${option.value}-${optionIndex}`}
                    onClick={() => toggleValue(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      isSelected && "bg-accent"
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="truncate text-left">{option.label}</span>
                  </button>
                );
              })
            )}
            {filtered.length > 100 && (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Mostrando 100 de {filtered.length}. Refine a busca.
              </div>
            )}
          </div>
        </ScrollArea>
        {values.length > 0 && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {values.length} selecionado{values.length > 1 ? "s" : ""}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
