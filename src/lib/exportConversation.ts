import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportSource { label: string; url?: string }
export interface ExportToolMeta { name: string; args?: any; summary?: string }
export interface ExportMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: ExportToolMeta[];
  sources?: ExportSource[];
}

/** Parse all GFM-style markdown tables from a string. */
export function parseMarkdownTables(md: string): { headers: string[]; rows: string[][] }[] {
  const lines = md.split(/\r?\n/);
  const tables: { headers: string[]; rows: string[][] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i];
    const sep = lines[i + 1];
    if (!header || !sep) continue;
    if (!/^\s*\|.*\|\s*$/.test(header)) continue;
    if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(sep)) continue;
    const headers = header.split("|").map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || (arr[0] !== "" || arr[arr.length - 1] !== ""))
      .filter(s => s.length > 0 || true);
    // simpler split
    const splitRow = (s: string) =>
      s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());
    const hdrs = splitRow(header);
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
      rows.push(splitRow(lines[j]));
      j++;
    }
    tables.push({ headers: hdrs, rows });
    i = j - 1;
  }
  return tables;
}

function csvEscape(v: string): string {
  const s = (v ?? "").replace(/\r?\n/g, " ").trim();
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a single CSV with all tables found in assistant messages, plus a sources block. */
export function exportConversationCsv(messages: ExportMessage[], filename = "conversa-ipesquisei.csv") {
  const lines: string[] = [];
  lines.push(`# i-pesquisei — Exportação da conversa`);
  lines.push(`# Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  lines.push("");

  let qIdx = 0;
  messages.forEach((msg) => {
    if (msg.role === "user") {
      qIdx++;
      lines.push(`## Pergunta ${qIdx}`);
      lines.push(csvEscape(msg.content));
      lines.push("");
      return;
    }
    const tables = parseMarkdownTables(msg.content);
    if (tables.length === 0) {
      lines.push(`## Resposta ${qIdx} (sem tabelas)`);
      lines.push(csvEscape(msg.content.replace(/[#*`>_]/g, "").slice(0, 4000)));
      lines.push("");
    } else {
      tables.forEach((t, ti) => {
        lines.push(`## Resposta ${qIdx} — Tabela ${ti + 1}`);
        lines.push(t.headers.map(csvEscape).join(","));
        t.rows.forEach(r => lines.push(r.map(csvEscape).join(",")));
        lines.push("");
      });
    }
    if (msg.sources && msg.sources.length > 0) {
      lines.push(`## Fontes oficiais — Resposta ${qIdx}`);
      lines.push("Fonte,URL");
      msg.sources.forEach(s => lines.push([csvEscape(s.label), csvEscape(s.url || "")].join(",")));
      lines.push("");
    }
  });

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Strip basic markdown for plain-text rendering in PDF. */
function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

export function exportConversationPdf(messages: ExportMessage[], filename = "conversa-ipesquisei.pdf") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(40);
  doc.text("i-pesquisei — Análise de mercado", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, y);
  y += 6;
  doc.setDrawColor(220);
  doc.line(margin, y + 6, pageW - margin, y + 6);
  y += 18;

  let qIdx = 0;

  messages.forEach((msg) => {
    if (msg.role === "user") {
      qIdx++;
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(`Pergunta ${qIdx}`, margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60);
      const lines = doc.splitTextToSize(stripMd(msg.content), pageW - margin * 2);
      lines.forEach((ln: string) => { ensureSpace(14); doc.text(ln, margin, y); y += 13; });
      y += 6;
      return;
    }

    // Assistant
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(`Resposta ${qIdx}`, margin, y);
    y += 14;

    if (msg.toolsUsed && msg.toolsUsed.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120);
      const tools = "Ferramentas: " + msg.toolsUsed.map(t => t.name).join(", ");
      const lines = doc.splitTextToSize(tools, pageW - margin * 2);
      lines.forEach((ln: string) => { ensureSpace(11); doc.text(ln, margin, y); y += 11; });
      y += 4;
    }

    // Split content into table chunks and prose
    const tables = parseMarkdownTables(msg.content);
    // For simplicity render prose first (without table lines), then tables
    const proseLines = msg.content.split(/\r?\n/).filter(l => !/^\s*\|/.test(l) && !/^\s*\|?\s*:?-{2,}:?/.test(l));
    const prose = stripMd(proseLines.join("\n")).replace(/\n{3,}/g, "\n\n").trim();
    if (prose) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60);
      const lines = doc.splitTextToSize(prose, pageW - margin * 2);
      lines.forEach((ln: string) => { ensureSpace(13); doc.text(ln, margin, y); y += 13; });
      y += 6;
    }

    tables.forEach((t) => {
      ensureSpace(60);
      autoTable(doc, {
        startY: y,
        head: [t.headers],
        body: t.rows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        theme: "grid",
      });
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 12;
    });

    if (msg.sources && msg.sources.length > 0) {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text("Fontes oficiais:", margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(60, 90, 200);
      msg.sources.forEach(s => {
        const txt = s.url ? `• ${s.label} — ${s.url}` : `• ${s.label}`;
        const lines = doc.splitTextToSize(txt, pageW - margin * 2);
        lines.forEach((ln: string, idx: number) => {
          ensureSpace(11);
          doc.text(ln, margin, y);
          if (s.url && idx === 0) {
            // make it a link
            doc.link(margin, y - 8, pageW - margin * 2, 10, { url: s.url });
          }
          y += 11;
        });
      });
      y += 6;
    }

    // separator
    ensureSpace(14);
    doc.setDrawColor(230);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  });

  // Footer with page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`i-pesquisei · página ${p} de ${pageCount}`, pageW - margin, pageH - 16, { align: "right" });
    doc.text("Fontes: PNCP · Portal da Transparência · SICONFI", margin, pageH - 16);
  }

  doc.save(filename);
}
