import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listSuppliers, upsertSupplier } from "@/lib/api/suppliers.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

const suppliersOpts = queryOptions({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });

export const Route = createFileRoute("/_app/suppliers/")({
  head: () => ({ meta: [{ title: "Suppliers" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(suppliersOpts),
  component: SuppliersPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function SuppliersPage() {
  const { data } = useSuspenseQuery(suppliersOpts);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = data.filter((s: any) =>
    !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.code ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Manage vendors and contact information."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New supplier</Button>}
      />
      <Card>
        <div className="p-3 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s: any) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate({ to: "/suppliers/$id", params: { id: s.id } })}>
                <TableCell className="font-medium">
                  <Link to="/suppliers/$id" params={{ id: s.id }} className="hover:underline">{s.name}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{s.code ?? "—"}</TableCell>
                <TableCell>{s.contact_name ?? "—"}</TableCell>
                <TableCell>{s.email ?? "—"}</TableCell>
                <TableCell>{s.phone ?? "—"}</TableCell>
                <TableCell>{s.currency}</TableCell>
                <TableCell>
                  {s.is_active
                    ? <Badge variant="outline" className="bg-success/15 text-success border-transparent">Active</Badge>
                    : <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">Inactive</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No suppliers found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <SupplierDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function SupplierDialog({ open, onOpenChange, initial }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: any;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(upsertSupplier);
  const [form, setForm] = useState<any>(initial ?? { name: "", currency: "USD", is_active: true });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? { name: "", currency: "USD", is_active: true });
  }, [open, initial]);

  const m = useMutation({
    mutationFn: async () => save({ data: form }),
    onSuccess: (r) => {
      toast.success("Supplier saved");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplier", r.id] });
      onOpenChange(false);
      if (!initial?.id) navigate({ to: "/suppliers/$id", params: { id: r.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial?.id ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Code</Label>
            <Input value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Currency</Label>
            <Input value={form.currency ?? "USD"} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} /></div>
          <div className="space-y-1.5"><Label>Contact name</Label>
            <Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Email</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Address</Label>
            <Textarea rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Payment terms</Label>
            <Input placeholder="Net 30" value={form.payment_terms ?? ""} onChange={(e) => set("payment_terms", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Notes</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !form.name}>
            {m.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
