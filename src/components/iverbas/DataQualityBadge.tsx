import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, FileSignature } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export type DataQualityVariant = "official" | "sample" | "contracts";

interface Props {
  variant: DataQualityVariant;
  className?: string;
}

const DataQualityBadge: React.FC<Props> = ({ variant, className = "" }) => {
  const { t } = useLanguage();

  const config = {
    official: {
      label: t("dqOfficialLabel"),
      tooltip: t("dqOfficialTooltip"),
      icon: CheckCircle2,
      classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    },
    sample: {
      label: t("dqSampleLabel"),
      tooltip: t("dqSampleTooltip"),
      icon: AlertTriangle,
      classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    },
    contracts: {
      label: t("dqContractsLabel"),
      tooltip: t("dqContractsTooltip"),
      icon: FileSignature,
      classes: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    },
  }[variant];

  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium leading-none whitespace-nowrap ${config.classes} ${className}`}
        >
          <Icon className="w-3 h-3" />
          {config.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {config.tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

export default DataQualityBadge;
