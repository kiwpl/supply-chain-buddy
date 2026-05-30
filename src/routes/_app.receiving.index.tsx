import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listPOsAwaitingReceipt, listReceipts } from "@/lib/api/receiving.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { POStatusBadge } from "@/components/status-badge";
import { fmtDate, fmtQty } from "@/lib/format";

const awaitOpts = queryOptions({ queryKey: ["awaiting-receipt"], queryFn: () => listPOsAwaitingReceipt() });
const receiptsOpts = queryOptions({ queryKey: ["receipts"], queryFn: () => listReceipts() });

export const Route = createFileRoute("/_app/receiving/")({
  head: () => ({ meta: [{ title: "Receiving" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(awaitOpts),
      context.queryClient.ensureQueryData(receiptsOpts),
    ]);
  },
  component: ReceivingPage,
  errorComponent: ({ error }) => <div className="text-sm text-destructive">{error.message}</div>,
});

function ReceivingPage() {
  const { data: awaiting } = useSuspenseQuery(awaitOpts);
  const { data: receipts } = useSuspenseQuery(receiptsOpts);

  return (
    <div>
      <PageHeader title="Receiving" description="Receive stock against open purchase orders." />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="px-4 py-3 border-b"><h2 className="font-semibold">Awaiting receipt</h2></div>
          <Table>
            <TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Supplier</TableHead><TableHead>Expected</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {awaiting.map((po: any) => {
                const ordered = po.lines.reduce((s: number, l: any) => s + Number(l.qty_ordered), 0);
                const received = po.lines.reduce((s: number, l: any) => s + Number(l.qty_received), 0);
                return (
                  <TableRow key={po.id}>
                    <TableCell><Link to="/receiving/$id" params={{ id: po.id }} className="font-medium hover:underline">{po.po_number}</Link></TableCell>
                    <TableCell>{po.supplier?.name}</TableCell>
                    <TableCell>{fmtDate(po.expected_date)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtQty(received)} / {fmtQty(ordered)}</TableCell>
                    <TableCell><POStatusBadge status={po.status} /></TableCell>
                  </TableRow>
                );
              })}
              {awaiting.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No POs awaiting receipt.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <div className="px-4 py-3 border-b"><h2 className="font-semibold">Recent receipts</h2></div>
          <Table>
            <TableHeader><TableRow><TableHead>Receipt #</TableHead><TableHead>PO</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {receipts.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.receipt_number}</TableCell>
                  <TableCell><Link to="/purchase-orders/$id" params={{ id: r.po?.id }} className="hover:underline">{r.po?.po_number}</Link></TableCell>
                  <TableCell>{r.po?.supplier?.name}</TableCell>
                  <TableCell>{fmtDate(r.received_date)}</TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No receipts yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
