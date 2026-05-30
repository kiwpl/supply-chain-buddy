import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const POSTYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-transparent",
  sent: "bg-primary/10 text-primary border-transparent",
  partially_received: "bg-warning/15 text-warning-foreground border-warning/40",
  received: "bg-success/15 text-success border-transparent",
  closed: "bg-muted text-muted-foreground border-transparent",
  cancelled: "bg-destructive/10 text-destructive border-transparent",
};

const POLABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partial",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

export function POStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", POSTYLES[status] ?? "")}>
      {POLABELS[status] ?? status}
    </Badge>
  );
}

export function PaymentStatusBadge({ total, paid }: { total: number; paid: number }) {
  const t = Number(total), p = Number(paid);
  if (p <= 0) return <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">Unpaid</Badge>;
  if (p < t)  return <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/40">Partial</Badge>;
  return <Badge variant="outline" className="bg-success/15 text-success border-transparent">Paid</Badge>;
}
