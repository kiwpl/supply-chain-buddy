import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/api/dashboard.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { POStatusBadge } from "@/components/status-badge";
import { fmtMoney, fmtDate } from "@/lib/format";
import { FileText, PackageCheck, Truck, Package, Wallet } from "lucide-react";

const dashOpts = queryOptions({ queryKey: ["dashboard"], queryFn: () => getDashboard() });

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashOpts),
  component: DashboardPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function Kpi({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold mt-0.5">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function DashboardPage() {
  const { data } = useSuspenseQuery(dashOpts);
  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of purchasing activity." />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Kpi icon={FileText} label="Open POs" value={data.kpis.open_pos} />
        <Kpi icon={PackageCheck} label="Awaiting receipt" value={data.kpis.awaiting_receipt} />
        <Kpi icon={Wallet} label="Outstanding payable" value={fmtMoney(data.kpis.outstanding_payable)} />
        <Kpi icon={Truck} label="Suppliers" value={data.kpis.supplier_count} />
        <Kpi icon={Package} label="Products" value={data.kpis.product_count} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent purchase orders</h2>
            <Link to="/purchase-orders" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-1">
            {data.recent_pos.length === 0 && <p className="text-sm text-muted-foreground">No purchase orders yet.</p>}
            {data.recent_pos.map((po: any) => (
              <Link key={po.id} to="/purchase-orders/$id" params={{ id: po.id }}
                className="flex items-center justify-between gap-3 px-2 py-2 rounded hover:bg-muted">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{po.po_number} · {po.supplier?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(po.order_date)}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm tabular-nums">{fmtMoney(po.total)}</span>
                  <POStatusBadge status={po.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent receipts</h2>
            <Link to="/receiving" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-1">
            {data.recent_receipts.length === 0 && <p className="text-sm text-muted-foreground">No receipts yet.</p>}
            {data.recent_receipts.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-2 py-2 rounded">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.receipt_number} · {r.po?.po_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.po?.supplier?.name ?? ""}</div>
                </div>
                <span className="text-xs text-muted-foreground">{fmtDate(r.received_date)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
