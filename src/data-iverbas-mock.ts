// Mock data — execution intelligence focused (Portal da Transparência)

export const mockBudgetSummary = {
  totalAuthorized: 4_872_350_000,
  totalCommitted: 3_945_120_000,
  totalSettled: 3_210_450_000,
  totalPaid: 2_876_230_000,
  availableBudget: 927_230_000, // dotacao_atualizada - empenhado
  executionRate: 59.0,
  year: 2025,
};

export const mockTopCompanies = [
  { cnpj: "12.345.678/0001-90", name: "TechGov Soluções S.A.", totalPaid: 456_230_000, percentage: 15.87 },
  { cnpj: "98.765.432/0001-10", name: "Construtora Nacional Ltda.", totalPaid: 321_450_000, percentage: 11.18 },
  { cnpj: "11.222.333/0001-44", name: "Saúde Brasil Serviços", totalPaid: 287_100_000, percentage: 9.98 },
  { cnpj: "55.666.777/0001-88", name: "Logística Federal S.A.", totalPaid: 198_750_000, percentage: 6.91 },
  { cnpj: "33.444.555/0001-22", name: "Educação Digital Ltda.", totalPaid: 167_890_000, percentage: 5.84 },
  { cnpj: "77.888.999/0001-66", name: "Infraestrutura BR S.A.", totalPaid: 145_320_000, percentage: 5.05 },
  { cnpj: "22.111.000/0001-33", name: "DefenTech Ltda.", totalPaid: 134_560_000, percentage: 4.68 },
  { cnpj: "44.555.666/0001-77", name: "Alimentação Pública S.A.", totalPaid: 112_890_000, percentage: 3.92 },
];

export const mockExecutionByOrgan = [
  { organ: "Min. da Saúde", authorized: 980_000_000, committed: 820_000_000, paid: 650_000_000 },
  { organ: "Min. da Educação", authorized: 870_000_000, committed: 710_000_000, paid: 580_000_000 },
  { organ: "Min. da Defesa", authorized: 650_000_000, committed: 590_000_000, paid: 470_000_000 },
  { organ: "Min. dos Transportes", authorized: 540_000_000, committed: 430_000_000, paid: 320_000_000 },
  { organ: "Min. da Ciência", authorized: 320_000_000, committed: 250_000_000, paid: 190_000_000 },
];

export const mockMonthlyExecution = [
  { month: "Jan", authorized: 400, committed: 280, paid: 180 },
  { month: "Fev", authorized: 400, committed: 310, paid: 220 },
  { month: "Mar", authorized: 400, committed: 340, paid: 260 },
  { month: "Abr", authorized: 400, committed: 350, paid: 290 },
  { month: "Mai", authorized: 400, committed: 360, paid: 310 },
  { month: "Jun", authorized: 400, committed: 370, paid: 330 },
  { month: "Jul", authorized: 400, committed: 380, paid: 340 },
  { month: "Ago", authorized: 400, committed: 385, paid: 350 },
  { month: "Set", authorized: 400, committed: 390, paid: 360 },
  { month: "Out", authorized: 400, committed: 392, paid: 365 },
  { month: "Nov", authorized: 400, committed: 395, paid: 370 },
  { month: "Dez", authorized: 400, committed: 398, paid: 378 },
];

// Payment speed by organ
export const mockPaymentSpeed = [
  { organ: "Min. da Ciência", avgDays: 18, totalPayments: 1240 },
  { organ: "Min. da Educação", avgDays: 25, totalPayments: 3450 },
  { organ: "Min. dos Transportes", avgDays: 32, totalPayments: 2100 },
  { organ: "Min. da Saúde", avgDays: 38, totalPayments: 5670 },
  { organ: "Min. da Defesa", avgDays: 45, totalPayments: 2890 },
  { organ: "Min. do Meio Ambiente", avgDays: 52, totalPayments: 890 },
  { organ: "Min. da Agricultura", avgDays: 58, totalPayments: 1560 },
  { organ: "Min. do Trabalho", avgDays: 63, totalPayments: 2340 },
];

// Market concentration by organ
export const mockConcentration = [
  { organ: "Min. da Saúde", top3Pct: 42.5, top5Pct: 58.3, totalCompanies: 1240 },
  { organ: "Min. da Educação", top3Pct: 35.8, top5Pct: 51.2, totalCompanies: 980 },
  { organ: "Min. da Defesa", top3Pct: 55.1, top5Pct: 72.4, totalCompanies: 450 },
  { organ: "Min. dos Transportes", top3Pct: 48.9, top5Pct: 65.7, totalCompanies: 620 },
  { organ: "Min. da Ciência", top3Pct: 61.2, top5Pct: 78.5, totalCompanies: 320 },
];

// Companies by organ ranking
export const mockCompaniesByOrgan = [
  { organ: "Min. da Saúde", company: "Saúde Brasil Serviços", cnpj: "11.222.333/0001-44", totalPaid: 287_100_000, pct: 18.2 },
  { organ: "Min. da Saúde", company: "MedTech Ltda.", cnpj: "66.777.888/0001-55", totalPaid: 198_500_000, pct: 12.6 },
  { organ: "Min. da Saúde", company: "Farma Gov S.A.", cnpj: "99.000.111/0001-22", totalPaid: 184_200_000, pct: 11.7 },
  { organ: "Min. da Educação", company: "Educação Digital Ltda.", cnpj: "33.444.555/0001-22", totalPaid: 167_890_000, pct: 14.5 },
  { organ: "Min. da Educação", company: "TechGov Soluções S.A.", cnpj: "12.345.678/0001-90", totalPaid: 145_300_000, pct: 12.5 },
  { organ: "Min. da Defesa", company: "DefenTech Ltda.", cnpj: "22.111.000/0001-33", totalPaid: 134_560_000, pct: 22.8 },
  { organ: "Min. da Defesa", company: "Logística Federal S.A.", cnpj: "55.666.777/0001-88", totalPaid: 112_400_000, pct: 19.0 },
];

// Budget growth by area (year-over-year)
export const mockBudgetGrowth = [
  { area: "Saúde", y2023: 850_000_000, y2024: 920_000_000, y2025: 980_000_000, variation: 6.5 },
  { area: "Educação", y2023: 780_000_000, y2024: 830_000_000, y2025: 870_000_000, variation: 4.8 },
  { area: "Defesa", y2023: 600_000_000, y2024: 630_000_000, y2025: 650_000_000, variation: 3.2 },
  { area: "Transportes", y2023: 520_000_000, y2024: 530_000_000, y2025: 540_000_000, variation: 1.9 },
  { area: "Ciência e Tecnologia", y2023: 350_000_000, y2024: 340_000_000, y2025: 320_000_000, variation: -5.9 },
  { area: "Meio Ambiente", y2023: 180_000_000, y2024: 165_000_000, y2025: 150_000_000, variation: -9.1 },
  { area: "Agricultura", y2023: 420_000_000, y2024: 450_000_000, y2025: 490_000_000, variation: 8.9 },
];

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
