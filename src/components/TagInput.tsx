import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  onEnterEmpty?: () => void;
}

/** Input de termos múltiplos: Enter ou vírgula adiciona um termo. */
export default function TagInput({
  values,
  onChange,
  placeholder,
  className,
  icon,
  onEnterEmpty,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !values.includes(t));
    if (parts.length) onChange([...values, ...parts]);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      } else if (e.key === "Enter") {
        onEnterEmpty?.();
      }
      return;
    }
    if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-sm focus-within:ring-1 focus-within:ring-ring",
        className
      )}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="h-6 max-w-[200px] gap-1 px-1.5 text-[11px]">
          <span className="truncate">{v}</span>
          <X
            className="h-3 w-3 shrink-0 cursor-pointer opacity-60 hover:opacity-100"
            onClick={() => onChange(values.filter((x) => x !== v))}
          />
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={values.length ? "" : placeholder}
        className="h-7 min-w-[100px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
