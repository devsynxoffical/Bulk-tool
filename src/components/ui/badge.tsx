import { cn } from "@/lib/utils";

const tones = {
  default: "bg-zinc-100 text-zinc-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  brand: "bg-zinc-900 text-white",
  whatsapp: "bg-emerald-50 text-emerald-800",
} as const;

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function campaignStatusTone(status: string) {
  switch (status) {
    case "RUNNING":
      return "info" as const;
    case "COMPLETED":
      return "success" as const;
    case "PAUSED":
      return "warning" as const;
    case "CANCELLED":
    case "FAILED":
      return "danger" as const;
    case "SCHEDULED":
      return "info" as const;
    default:
      return "default" as const;
  }
}
