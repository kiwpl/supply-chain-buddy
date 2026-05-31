import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listProducts, upsertProduct, deleteProduct, listSupplierPrices, upsertSupplierPrice, deleteSupplierPrice } from "@/lib/api/products.functions";
import { listSuppliers } from "@/lib/api/suppliers.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Search, Star, Trash2 } from "lucide-react";
import { fmtMoney } from "@/lib/format";

const productsOpts = queryOptions({ queryKey: ["products"], queryFn: () => listProducts() });
const suppliersOpts = queryOptions({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });

export const Route = createFileRoute("/_app/products")({
  head: () => ({ meta: [{ title: "Products & supplier prices" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(productsOpts),
      context.queryClient.ensureQueryData(suppliersOpts),
    ]);
  },
  component: ProductsPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function ProductsPage() {
  const qc = useQueryClient();
  const { data: products } = useSuspenseQuery(productsOpts);
  const { data: suppliers } = useSuspenseQuery(suppliersOpts);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(products[0]?.id ?? null);
  const [productDialog, setProductDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [priceDialog, setPriceDialog] = useState<{ open: boolean; initial?: any }>({ open: false });

  const delProduct = useServerFn(deleteProduct);
  const delPrice = useServerFn(deleteSupplierPrice);

  const filtered = products.filter((p: any) =>
    !q || p.sku.toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()));

  const currentProduct = products.find((p: any) => p.id === selected) ?? filtered[0] ?? null;
  const productId = currentProduct?.id;

  const { data: prices } = useSuspenseQuery({
    queryKey: ["product-prices", productId ?? "none"],
    queryFn: () => productId ? listSupplierPrices({ data: { product_id: productId } }) : Promise.resolve([]),
  });

  const onDeleteProduct = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try { await delProduct({ data: { id } }); qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Deleted"); }
    catch (e: any) { toast.error(e.message); }
  };
  const onDeletePrice = async (id: string) => {
    if (!confirm("Remove this price?")) return;
    try { await delPrice({ data: { id } }); qc.invalidateQueries({ queryKey: ["product-prices", productId] }); toast.success("Removed"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="Catalog and supplier price lists."
        actions={<Button onClick={() => setProductDialog({ open: true })}><Plus className="h-4 w-4 mr-1" />New product</Button>}
      />

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
        <Card>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search SKU or name" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((p: any) => (
                <TableRow key={p.id} className={productId === p.id ? "bg-accent" : "cursor-pointer"} onClick={() => setSelected(p.id)}>
                  <TableCell className="font-medium">{p.sku}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">No products.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5">
          {!currentProduct ? (
            <p className="text-sm text-muted-foreground">Select a product to view supplier prices.</p>
          ) : (
            <>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">{currentProduct.sku} · {currentProduct.unit}{currentProduct.category ? ` · ${currentProduct.category}` : ""}</div>
                  <h2 className="text-lg font-semibold">{currentProduct.name}</h2>
                  {currentProduct.description && <p className="text-sm text-muted-foreground mt-1">{currentProduct.description}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setProductDialog({ open: true, initial: currentProduct })}>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => onDeleteProduct(currentProduct.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Supplier prices</h3>
                <Button size="sm" onClick={() => setPriceDialog({ open: true, initial: { product_id: currentProduct.id, currency: "USD", min_qty: 1, unit_price: 0 } })}>
                  <Plus className="h-4 w-4 mr-1" />Add price
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Min qty</TableHead>
                    <TableHead>Lead time</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {p.is_preferred && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                          {p.supplier?.name}
                        </div>
                        {p.supplier_sku && <div className="text-xs text-muted-foreground">{p.supplier_sku}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(p.unit_price, p.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.min_qty}</TableCell>
                      <TableCell>{p.lead_time_days ? `${p.lead_time_days} d` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setPriceDialog({ open: true, initial: p })}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => onDeletePrice(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {prices.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No supplier prices yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </Card>
      </div>

      <ProductDialog state={productDialog} onClose={() => setProductDialog({ open: false })} />
      <PriceDialog state={priceDialog} onClose={() => setPriceDialog({ open: false })} suppliers={suppliers} productId={productId} />
    </div>
  );
}

function ProductDialog({ state, onClose }: { state: { open: boolean; initial?: any }; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertProduct);
  const [form, setForm] = useState<any>(state.initial ?? { sku: "", name: "", unit: "ea", is_active: true });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!state.open) return;
    setForm(state.initial ?? { sku: "", name: "", unit: "ea", is_active: true });
  }, [state.open, state.initial]);

  const m = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => { toast.success("Product saved"); qc.invalidateQueries({ queryKey: ["products"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{form.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>SKU *</Label><Input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit ?? "ea"} onChange={(e) => set("unit", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Category</Label><Input value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!form.sku || !form.name || m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceDialog({ state, onClose, suppliers, productId }: {
  state: { open: boolean; initial?: any }; onClose: () => void; suppliers: any[]; productId?: string;
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertSupplierPrice);
  const [form, setForm] = useState<any>(state.initial ?? {});

  useEffect(() => {
    if (!state.open) return;
    setForm(state.initial ?? { product_id: productId, currency: "USD", min_qty: 1, unit_price: 0 });
  }, [state.open, state.initial, productId]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const m = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => { toast.success("Price saved"); qc.invalidateQueries({ queryKey: ["product-prices", productId] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{form.id ? "Edit price" : "Add supplier price"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Supplier *</Label>
            <Select value={form.supplier_id ?? ""} onValueChange={(v) => set("supplier_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Supplier SKU</Label><Input value={form.supplier_sku ?? ""} onChange={(e) => set("supplier_sku", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency ?? "USD"} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} /></div>
          <div className="space-y-1.5"><Label>Unit price *</Label><Input type="number" step="0.0001" value={form.unit_price ?? 0} onChange={(e) => set("unit_price", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Min qty</Label><Input type="number" step="0.01" value={form.min_qty ?? 1} onChange={(e) => set("min_qty", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Lead time (days)</Label><Input type="number" value={form.lead_time_days ?? ""} onChange={(e) => set("lead_time_days", e.target.value ? Number(e.target.value) : null)} /></div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox id="preferred" checked={!!form.is_preferred} onCheckedChange={(v) => set("is_preferred", !!v)} />
            <Label htmlFor="preferred">Preferred supplier</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!form.supplier_id || m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
