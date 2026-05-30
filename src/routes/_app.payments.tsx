import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listPayments, recordPayment, deletePayment } from "@/lib/api/payments.functions";
import { listPurchaseOrders } from "@/lib/api/purchase-orders.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { fmtMoney, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const paymentsOpts = queryOptions({ queryKey: ["payments"], queryFn: () => listPayments() });
const posOpts = queryOptions({ queryKey: ["purchase-orders"], queryFn: () => listPurchaseOrders() });

export const Route = createFileRoute("/_app/payments")({
  head: () => ({ meta: [{ title: "Payments" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(paymentsOpts),
      context.queryClient.ensureQueryData(posOpts),
    ]);
  },
  component: PaymentsPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const del = useServerFn(deletePayment);
  const { data: payments } = useSuspenseQuery(paymentsOpts);
  const [open, setOpen] = useState(false);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this payment?")) return;
    try { await del({ data: { id } }); qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("Deleted"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Supplier payments recorded against purchase orders."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Record payment</Button>}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Date</TableHead><TableHead>PO</TableHead><TableHead>Supplier</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{fmtDate(p.payment_date)}</TableCell>
                <TableCell><Link to="/purchase-orders/$id" params={{ id: p.po?.id }} className="hover:underline">{p.po?.po_number}</Link></TableCell>
                <TableCell>{p.po?.supplier?.name}</TableCell>
                <TableCell className="capitalize">{p.method.replace("_"," ")}</TableCell>
                <TableCell>{p.reference ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(p.amount)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => onDelete(p.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No payments recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <PaymentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function PaymentDialog({ open, onOpenChange, defaultPoId }: { open: boolean; onOpenChange: (v: boolean) => void; defaultPoId?: string }) {
  const qc = useQueryClient();
  const save = useServerFn(recordPayment);
  const { data: pos } = useSuspenseQuery(posOpts);
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState<any>({ po_id: defaultPoId ?? "", payment_date: today, amount: "", method: "bank_transfer", reference: "", notes: "" });
  useEffect(() => { if (open) setForm((f: any) => ({ ...f, po_id: defaultPoId ?? f.po_id })); }, [open, defaultPoId]);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const m = useMutation({
    mutationFn: () => save({ data: { ...form, amount: Number(form.amount) } }),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      if (defaultPoId) qc.invalidateQueries({ queryKey: ["po", defaultPoId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Purchase order *</Label>
            <Select value={form.po_id} onValueChange={(v) => set("po_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
              <SelectContent>
                {pos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.po_number} · {p.supplier?.name} · bal {fmtMoney(p.balance_due, p.currency)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.payment_date} onChange={(e) => set("payment_date", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Method</Label>
            <Select value={form.method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Reference</Label><Input value={form.reference} onChange={(e) => set("reference", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!form.po_id || !form.amount || m.isPending}>{m.isPending ? "Saving…" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
