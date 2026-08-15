import { useCallback, useEffect, useState } from "react";

export type ColumnPrefs = {
  order: string[];
  hidden: string[];
};

const VERSION = "v1";

function storageKey(tableKey: string, scope?: string | null) {
  return `colprefs:${VERSION}:${tableKey}:${scope || "anon"}`;
}

function read(tableKey: string, scope?: string | null): ColumnPrefs | null {
  try {
    const raw = localStorage.getItem(storageKey(tableKey, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.order)) return null;
    return { order: parsed.order, hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [] };
  } catch {
    return null;
  }
}

/**
 * Persiste ordem e visibilidade das colunas de uma tabela.
 * A configuração é gravada a cada alteração e recarregada em todo acesso.
 */
export function useColumnPrefs(tableKey: string, defaultOrder: string[], scope?: string | null) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(() => {
    const stored = read(tableKey, scope);
    if (!stored) return { order: defaultOrder, hidden: [] };
    // reconcilia com colunas novas/removidas
    const known = stored.order.filter((id) => defaultOrder.includes(id));
    const missing = defaultOrder.filter((id) => !known.includes(id));
    return { order: [...known, ...missing], hidden: stored.hidden.filter((id) => defaultOrder.includes(id)) };
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(tableKey, scope), JSON.stringify(prefs));
    } catch {
      /* storage indisponível */
    }
  }, [prefs, tableKey, scope]);

  const moveColumn = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setPrefs((prev) => {
      const order = [...prev.order];
      const from = order.indexOf(fromId);
      const to = order.indexOf(toId);
      if (from < 0 || to < 0) return prev;
      order.splice(to, 0, order.splice(from, 1)[0]);
      return { ...prev, order };
    });
  }, []);

  const toggleColumn = useCallback((id: string) => {
    setPrefs((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id) ? prev.hidden.filter((c) => c !== id) : [...prev.hidden, id],
    }));
  }, []);

  const reset = useCallback(() => setPrefs({ order: defaultOrder, hidden: [] }), [defaultOrder]);

  return { order: prefs.order, hidden: prefs.hidden, moveColumn, toggleColumn, reset };
}
