import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSupplier, deleteSupplier } from "@/lib/api/suppliers.functions";
import { listSupplierPrices } from "@/lib/api/products.functions";
import { listPurchaseOrders } from "@/lib/api/purchase-orders.functions";
import { listPayments } from "@/lib/api/payments.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { SupplierDialog } from "./_app.suppliers.index";
import { POStatusBadge } from "@/components/status-badge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers/$id")({
  head: () => ({ meta: [{ title: "Supplier" }] }),
  loader: async ({ params, context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["supplier", params.id], queryFn: () => getSupplier({ data: { id: params.id } }) }),
      context.queryClient.ensureQueryData({ queryKey: ["supplier-prices", params.id], queryFn: () => listSupplierPrices({ data: { supplier_id: params.id } }) }),
      context.queryClient.ensureQueryData({ queryKey: ["purchase-orders"], queryFn: () => listPurchaseOrders() }),
      context.queryClient.ensureQueryData({ queryKey: ["payments"], queryFn: () => listPayments() }),
    ]);
  },
  component: SupplierDetail,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function SupplierDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const [edit, setEdit] = useState(false);
  const del = useServerFn(deleteSupplier);

  const { data: supplier } = useSuspenseQuery({ queryKey: ["supplier", id], queryFn: () => getSupplier({ data: { id } }) });
  const { data: prices } = useSuspenseQuery({ queryKey: ["supplier-prices", id], queryFn: () => listSupplierPrices({ data: { supplier_id: id } }) });
  const { data: pos } = useSuspenseQuery({ queryKey: ["purchase-orders"], queryFn: () => listPurchaseOrders() });
  const { data: payments } = useSuspenseQuery({ queryKey: ["payments"], queryFn: () => listPayments() });

  if (!supplier) return <div>Supplier not found.</div>;

  const supplierPOs = pos.filter((p: any) => p.supplier_id === id);
  const supplierPayments = payments.filter((p: any) => p.po?.supplier?.name === supplier.name);

  const onDelete = async () => {
    if (!confirm("Delete this supplier? This cannot be undone.")) return;
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier deleted");
      navigate({ to: "/suppliers" });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader
        title={supplier.name}
        description={[supplier.code, supplier.payment_terms].filter(Boolean).join(" · ") || "Supplier"}
        actions={
          <>
            <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
            <Button variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
          </>
        }
      />
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="prices">Price list ({prices.length})</TabsTrigger>
          <TabsTrigger value="pos">Purchase orders ({supplierPOs.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({supplierPayments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card className="p-5 grid sm:grid-cols-2 gap-4 text-sm">
            <Field label="Contact" v={supplier.contact_name} />
            <Field label="Email" v={supplier.email} />
            <Field label="Phone" v={supplier.phone} />
            <Field label="Currency" v={supplier.currency} />
            <Field label="Payment terms" v={supplier.payment_terms} />
            <Field label="Status" v={supplier.is_active ? "Active" : "Inactive"} />
            <Field label="Address" v={supplier.address} cls="sm:col-span-2 whitespace-pre-wrap" />
            <Field label="Notes" v={supplier.notes} cls="sm:col-span-2 whitespace-pre-wrap" />
          </Card>
        </TabsContent>

        <TabsContent value="prices">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Supplier SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Min qty</TableHead>
                  <TableHead className="text-right">Lead time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell><Link to="/products" className="hover:underline">{p.product?.sku} · {p.product?.name}</Link></TableCell>
                    <TableCell>{p.supplier_sku ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.unit_price, p.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.min_qty}</TableCell>
                    <TableCell className="text-right">{p.lead_time_days ? `${p.lead_time_days} d` : "—"}</TableCell>
                  </TableRow>
                ))}
                {prices.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No prices yet. Add them from the Products page.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="pos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow><TableHead>PO #</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {supplierPOs.map((po: any) => (
                  <TableRow key={po.id}>
                    <TableCell><Link to="/purchase-orders/$id" params={{ id: po.id }} className="hover:underline">{po.po_number}</Link></TableCell>
                    <TableCell>{fmtDate(po.order_date)}</TableCell>
                    <TableCell><POStatusBadge status={po.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(po.total, po.currency)}</TableCell>
                  </TableRow>
                ))}
                {supplierPOs.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No POs for this supplier.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Date</TableHead><TableHead>PO</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {supplierPayments.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDate(p.payment_date)}</TableCell>
                    <TableCell>{p.po?.po_number}</TableCell>
                    <TableCell className="capitalize">{p.method.replace("_"," ")}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.amount)}</TableCell>
                  </TableRow>
                ))}
                {supplierPayments.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No payments recorded.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <SupplierDialog open={edit} onOpenChange={setEdit} initial={supplier} />
    </div>
  );
}

function Field({ label, v, cls }: { label: string; v: any; cls?: string }) {
  return (
    <div className={cls}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{v || "—"}</div>
    </div>
  );
}
