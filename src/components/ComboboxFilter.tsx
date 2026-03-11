import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ComboboxFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  className?: string;
}

export default function ComboboxFilter({
  value,
  onChange,
  options,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  isLoading,
  className,
}: ComboboxFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
    }
  }, [open]);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedLabel = value
    ? options.find((o) => o.value === value)?.label || value
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <div className="flex items-center gap-1 shrink-0">
            {value && (
              <X
                className="h-3 w-3 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ScrollArea className="max-h-[250px]">
          <div className="p-1">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado</div>
            ) : (
              filtered.slice(0, 100).map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value === value ? "" : option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    option.value === value && "bg-accent"
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate text-left">{option.label}</span>
                </button>
              ))
            )}
            {filtered.length > 100 && (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Mostrando 100 de {filtered.length}. Refine a busca.
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
