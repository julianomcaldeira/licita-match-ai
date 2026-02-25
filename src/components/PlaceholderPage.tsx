import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export default function PlaceholderPage({ title, description, icon: Icon }: PlaceholderPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-center text-muted-foreground max-w-md">{description}</p>
      <div className="mt-6 rounded-lg border border-dashed border-border bg-secondary/50 px-6 py-3 text-sm text-muted-foreground">
        Em desenvolvimento — será implementado com Lovable Cloud
      </div>
    </motion.div>
  );
}
