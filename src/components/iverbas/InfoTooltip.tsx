import React from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, className = "" }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className}`}>
        <HelpCircle className="w-4 h-4" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
      {text}
    </TooltipContent>
  </Tooltip>
);

export default InfoTooltip;
