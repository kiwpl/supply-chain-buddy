import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPurchaseOrder } from "@/lib/api/purchase-orders.functions";
import { createReceipt } from "@/lib/api/receiving.functions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { fmtQty, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/receiving/$id")({
  head: () => ({ meta: [{ title: "Receive PO" }] }),
  loader: ({ params, context }) => context.queryClient.ensureQueryData({
    queryKey: ["po", params.id], queryFn: () => getPurchaseOrder({ data: { id: params.id } }),
  }),
  component: ReceivePOPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function ReceivePOPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const create = useServerFn(createReceipt);

  const { data: po } = useSuspenseQuery({ queryKey: ["po", id], queryFn: () => getPurchaseOrder({ data: { id } }) });
  const [received_date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (po?.lines ?? []).forEach((l: any) => {
      m[l.id] = Math.max(0, Number(l.qty_ordered) - Number(l.qty_received));
    });
    return m;
  });

  if (!po) return <div>Not found.</div>;

  const m = useMutation({
    mutationFn: () => create({ data: {
      po_id: po.id, received_date, notes: notes || null,
      lines: Object.entries(qty).map(([po_line_id, qty_received]) => ({ po_line_id, qty_received: Number(qty_received) })),
    }}),
    onSuccess: (r) => {
      toast.success(`Receipt ${r.receipt_number} recorded`);
      qc.invalidateQueries();
      navigate({ to: "/purchase-orders/$id", params: { id: po.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-4">
        <Link to="/receiving" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to receiving
        </Link>
      </div>
      <PageHeader
        title={`Receive ${po.po_number}`}
        description={`${po.supplier?.name} · Expected ${fmtDate(po.expected_date)}`}
        actions={<Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Record receipt"}</Button>}
      />
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Already received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right w-32">Receive now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((l: any) => {
                const outstanding = Math.max(0, Number(l.qty_ordered) - Number(l.qty_received));
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(l.qty_ordered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(l.qty_received)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(outstanding)}</TableCell>
                    <TableCell className="text-right">
                      <Input className="text-right" type="number" step="0.01" min={0} max={outstanding}
                        value={qty[l.id] ?? 0}
                        onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        <Card className="p-5 space-y-3 h-fit">
          <div className="space-y-1.5"><Label>Received date</Label><Input type="date" value={received_date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </Card>
      </div>
    </div>
  );
}
