import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getPurchaseOrder, savePurchaseOrder, setPOStatus, deletePurchaseOrder } from "@/lib/api/purchase-orders.functions";
import { listProducts, listSupplierPrices } from "@/lib/api/products.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { POStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { PaymentDialog } from "./_app.payments";
import { fmtMoney, fmtDate, fmtQty } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Send, X, Lock, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/purchase-orders/$id")({
  head: () => ({ meta: [{ title: "Purchase order" }] }),
  loader: async ({ params, context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["po", params.id], queryFn: () => getPurchaseOrder({ data: { id: params.id } }) }),
      context.queryClient.ensureQueryData({ queryKey: ["products"], queryFn: () => listProducts() }),
    ]);
  },
  component: PODetailPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

type LineDraft = { id?: string; product_id: string | null; description: string; qty_ordered: number; unit_price: number; qty_received?: number };

function PODetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const save = useServerFn(savePurchaseOrder);
  const setStatus = useServerFn(setPOStatus);
  const del = useServerFn(deletePurchaseOrder);

  const { data: po } = useSuspenseQuery({ queryKey: ["po", id], queryFn: () => getPurchaseOrder({ data: { id } }) });
  const { data: products } = useSuspenseQuery({ queryKey: ["products"], queryFn: () => listProducts() });

  const [tax, setTax] = useState<number>(Number(po?.tax ?? 0));
  const [notes, setNotes] = useState<string>(po?.notes ?? "");
  const [expected_date, setExpected] = useState<string>(po?.expected_date ?? "");
  const [order_date, setOrderDate] = useState<string>(po?.order_date ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() => (po?.lines ?? []).map((l: any) => ({
    id: l.id, product_id: l.product_id, description: l.description,
    qty_ordered: Number(l.qty_ordered), unit_price: Number(l.unit_price), qty_received: Number(l.qty_received),
  })));
  const [paymentOpen, setPaymentOpen] = useState(false);

  useEffect(() => {
    if (!po) return;
    setTax(Number(po.tax)); setNotes(po.notes ?? ""); setExpected(po.expected_date ?? ""); setOrderDate(po.order_date);
    setLines((po.lines ?? []).map((l: any) => ({
      id: l.id, product_id: l.product_id, description: l.description,
      qty_ordered: Number(l.qty_ordered), unit_price: Number(l.unit_price), qty_received: Number(l.qty_received),
    })));
  }, [po?.id, po?.updated_at]);

  if (!po) return <div>Not found.</div>;

  const isEditable = po.status === "draft";
  const subtotal = lines.reduce((s, l) => s + (Number(l.qty_ordered) * Number(l.unit_price)), 0);
  const total = subtotal + Number(tax || 0);

  const addLine = async (product_id?: string) => {
    let description = "", unit_price = 0;
    if (product_id) {
      const p = products.find((pp: any) => pp.id === product_id);
      if (p) description = `${p.sku} · ${p.name}`;
      try {
        const prices = await listSupplierPrices({ data: { product_id, supplier_id: po.supplier_id } });
        if (prices[0]) unit_price = Number(prices[0].unit_price);
      } catch {}
    }
    setLines([...lines, { product_id: product_id ?? null, description, qty_ordered: 1, unit_price }]);
  };

  const updateLine = (i: number, patch: Partial<LineDraft>) => {
    setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const onSave = useMutation({
    mutationFn: () => save({ data: {
      id: po.id, supplier_id: po.supplier_id, order_date, expected_date: expected_date || null,
      currency: po.currency, tax: Number(tax || 0), notes: notes || null,
      lines: lines.map((l) => ({ id: l.id, product_id: l.product_id, description: l.description, qty_ordered: Number(l.qty_ordered), unit_price: Number(l.unit_price) })),
    }}),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["po", id] }); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const transition = async (status: string, label: string) => {
    try {
      await setStatus({ data: { id, status } });
      toast.success(label);
      qc.invalidateQueries({ queryKey: ["po", id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const onDelete = async () => {
    if (!confirm("Delete this PO?")) return;
    try { await del({ data: { id } }); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("Deleted"); navigate({ to: "/purchase-orders" }); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <div className="mb-4">
        <Link to="/purchase-orders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to purchase orders
        </Link>
      </div>
      <PageHeader
        title={po.po_number}
        description={<span className="inline-flex items-center gap-2"><Link to="/suppliers/$id" params={{ id: po.supplier_id }} className="hover:underline">{po.supplier?.name}</Link> <POStatusBadge status={po.status} /> <PaymentStatusBadge total={Number(po.total)} paid={po.amount_paid} /></span> as any}
        actions={
          <>
            {isEditable && <Button onClick={() => onSave.mutate()} disabled={onSave.isPending}>{onSave.isPending ? "Saving…" : "Save draft"}</Button>}
            {po.status === "draft" && <Button variant="outline" onClick={() => transition("sent", "Sent to supplier")}><Send className="h-4 w-4 mr-1" />Send</Button>}
            {["sent","partially_received"].includes(po.status) && <Button variant="outline" onClick={() => navigate({ to: "/receiving/$id", params: { id } })}>Receive</Button>}
            {po.status !== "cancelled" && po.status !== "closed" && <Button variant="outline" onClick={() => setPaymentOpen(true)}>Record payment</Button>}
            {po.status === "received" && <Button variant="outline" onClick={() => transition("closed", "Closed")}><Lock className="h-4 w-4 mr-1" />Close</Button>}
            {po.status !== "cancelled" && po.status !== "closed" && <Button variant="outline" onClick={() => transition("cancelled", "Cancelled")}><X className="h-4 w-4 mr-1" />Cancel</Button>}
            {po.status === "draft" && <Button variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>}
          </>
        }
      />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Order date</Label><Input type="date" disabled={!isEditable} value={order_date} onChange={(e) => setOrderDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Expected</Label><Input type="date" disabled={!isEditable} value={expected_date ?? ""} onChange={(e) => setExpected(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input disabled value={po.currency} /></div>
              <div className="space-y-1.5"><Label>Created</Label><Input disabled value={fmtDate(po.created_at)} /></div>
            </div>
          </Card>

          <Card>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold">Line items</h2>
              {isEditable && (
                <div className="flex items-center gap-2">
                  <Select onValueChange={(v) => addLine(v)}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Add product…" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.sku} · {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => addLine()}><Plus className="h-4 w-4 mr-1" />Empty line</Button>
                </div>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-24">Qty</TableHead>
                  {!isEditable && <TableHead className="text-right w-24">Received</TableHead>}
                  <TableHead className="text-right w-28">Unit price</TableHead>
                  <TableHead className="text-right w-28">Total</TableHead>
                  {isEditable && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.id ?? `new-${i}`}>
                    <TableCell>
                      {isEditable
                        ? <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                        : <span>{l.description}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditable
                        ? <Input type="number" step="0.01" className="text-right" value={l.qty_ordered} onChange={(e) => updateLine(i, { qty_ordered: Number(e.target.value) })} />
                        : <span className="tabular-nums">{fmtQty(l.qty_ordered)}</span>}
                    </TableCell>
                    {!isEditable && <TableCell className="text-right tabular-nums">{fmtQty(l.qty_received ?? 0)}</TableCell>}
                    <TableCell className="text-right">
                      {isEditable
                        ? <Input type="number" step="0.0001" className="text-right" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })} />
                        : <span className="tabular-nums">{fmtMoney(l.unit_price, po.currency)}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(l.qty_ordered * l.unit_price, po.currency)}</TableCell>
                    {isEditable && <TableCell><Button size="sm" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>}
                  </TableRow>
                ))}
                {lines.length === 0 && (
                  <TableRow><TableCell colSpan={isEditable ? 5 : 5} className="text-center text-sm text-muted-foreground py-6">No line items yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-2">Notes</h2>
            <Textarea rows={3} disabled={!isEditable} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Receipts</h2>
              {(po.receipts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No receipts yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {po.receipts.map((r: any) => (
                    <li key={r.id} className="flex justify-between">
                      <span>{r.receipt_number}</span>
                      <span className="text-muted-foreground">{fmtDate(r.received_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Payments</h2>
              {(po.payments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {po.payments.map((p: any) => (
                    <li key={p.id} className="flex justify-between">
                      <span>{fmtDate(p.payment_date)} · <span className="capitalize">{p.method.replace("_"," ")}</span></span>
                      <span className="tabular-nums">{fmtMoney(p.amount, po.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <Card className="p-5 h-fit space-y-2 text-sm">
          <Row label="Subtotal" v={fmtMoney(subtotal, po.currency)} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Tax</span>
            {isEditable
              ? <Input className="w-28 text-right" type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} />
              : <span className="tabular-nums">{fmtMoney(po.tax, po.currency)}</span>}
          </div>
          <div className="border-t pt-2"><Row label="Total" v={fmtMoney(total, po.currency)} bold /></div>
          <Row label="Paid" v={fmtMoney(po.amount_paid, po.currency)} />
          <Row label="Balance" v={fmtMoney(po.balance_due, po.currency)} bold />
        </Card>
      </div>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultPoId={po.id} />
    </div>
  );
}

function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={"tabular-nums " + (bold ? "font-semibold" : "")}>{v}</span>
    </div>
  );
}
