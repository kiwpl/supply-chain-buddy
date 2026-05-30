import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPurchaseOrders, savePurchaseOrder } from "@/lib/api/purchase-orders.functions";
import { listSuppliers } from "@/lib/api/suppliers.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { POStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { fmtMoney, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

const posOpts = queryOptions({ queryKey: ["purchase-orders"], queryFn: () => listPurchaseOrders() });
const suppliersOpts = queryOptions({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });

export const Route = createFileRoute("/_app/purchase-orders/")({
  head: () => ({ meta: [{ title: "Purchase orders" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(posOpts),
      context.queryClient.ensureQueryData(suppliersOpts),
    ]);
  },
  component: POListPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function POListPage() {
  const { data: pos } = useSuspenseQuery(posOpts);
  const { data: suppliers } = useSuspenseQuery(suppliersOpts);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [supplier, setSupplier] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = pos.filter((p: any) => {
    if (status !== "all" && p.status !== status) return false;
    if (supplier !== "all" && p.supplier_id !== supplier) return false;
    if (q && !p.po_number.toLowerCase().includes(q.toLowerCase()) && !(p.supplier?.name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="All purchase orders, draft to closed."
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" />New PO</Button>}
      />
      <Card>
        <div className="p-3 border-b flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search PO or supplier" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="partially_received">Partial</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplier} onValueChange={setSupplier}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
              <TableHead>Status</TableHead><TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((po: any) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium"><Link to="/purchase-orders/$id" params={{ id: po.id }} className="hover:underline">{po.po_number}</Link></TableCell>
                <TableCell>{po.supplier?.name}</TableCell>
                <TableCell>{fmtDate(po.order_date)}</TableCell>
                <TableCell><POStatusBadge status={po.status} /></TableCell>
                <TableCell><PaymentStatusBadge total={Number(po.total)} paid={po.amount_paid} /></TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(po.total, po.currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(po.balance_due, po.currency)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No purchase orders match.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <NewPODialog open={newOpen} onOpenChange={setNewOpen} suppliers={suppliers} />
    </div>
  );
}

function NewPODialog({ open, onOpenChange, suppliers }: { open: boolean; onOpenChange: (v: boolean) => void; suppliers: any[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(savePurchaseOrder);
  const today = new Date().toISOString().slice(0,10);
  const [supplier_id, setSupplier] = useState("");
  const [order_date, setOrderDate] = useState(today);
  const [expected_date, setExpected] = useState("");

  const m = useMutation({
    mutationFn: () => save({ data: { supplier_id, order_date, expected_date: expected_date || null, currency: "USD", tax: 0, lines: [], notes: null } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      onOpenChange(false);
      navigate({ to: "/purchase-orders/$id", params: { id: r.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Supplier *</Label>
            <Select value={supplier_id} onValueChange={setSupplier}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Order date</Label><Input type="date" value={order_date} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Expected</Label><Input type="date" value={expected_date} onChange={(e) => setExpected(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!supplier_id || m.isPending}>{m.isPending ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
