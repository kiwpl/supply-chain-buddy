import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables } from "@/integrations/supabase/types";

type PurchaseOrderLineReceiptState = Pick<
  Tables<"purchase_order_lines">,
  "id" | "po_id" | "qty_ordered" | "qty_received"
>;
type ReceiptLineQuantity = Pick<Tables<"receipt_lines">, "po_line_id" | "qty_received">;

const receiptSchema = z.object({
  po_id: z.string().uuid(),
  received_date: z.string(),
  notes: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        po_line_id: z.string().uuid(),
        qty_received: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

export const listPOsAwaitingReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("purchase_orders")
      .select(
        "*, supplier:suppliers(id,name), lines:purchase_order_lines(qty_ordered, qty_received)",
      )
      .in("status", ["sent", "partially_received"])
      .order("expected_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const listReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("receipts")
      .select("*, po:purchase_orders(id, po_number, supplier:suppliers(name))")
      .order("received_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const createReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => receiptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const filtered = data.lines.filter((l) => l.qty_received > 0);
    if (filtered.length === 0) throw new Error("Enter a quantity for at least one line");

    const { data: poLines, error: poLinesErr } = await supabase
      .from("purchase_order_lines")
      .select("id, po_id, qty_ordered, qty_received")
      .in(
        "id",
        filtered.map((l) => l.po_line_id),
      );
    if (poLinesErr) throw new Error(poLinesErr.message);

    if ((poLines ?? []).length !== filtered.length) {
      throw new Error("One or more purchase order lines could not be found");
    }

    for (const line of filtered) {
      const current = ((poLines ?? []) as PurchaseOrderLineReceiptState[]).find(
        (p) => p.id === line.po_line_id,
      );
      if (!current || current.po_id !== data.po_id) {
        throw new Error("Receipt lines must belong to the selected purchase order");
      }
      const remaining = Number(current.qty_ordered) - Number(current.qty_received);
      if (Number(line.qty_received) > remaining) {
        throw new Error(
          `Receipt quantity exceeds remaining quantity for a PO line. Remaining: ${remaining}`,
        );
      }
    }

    const { data: receipt, error: rErr } = await supabase
      .from("receipts")
      .insert({
        po_id: data.po_id,
        received_date: data.received_date,
        notes: data.notes ?? null,
        received_by: context.userId,
      })
      .select("id, receipt_number")
      .single();
    if (rErr) throw new Error(rErr.message);

    const { error: lErr } = await supabase.from("receipt_lines").insert(
      filtered.map((l) => ({
        receipt_id: receipt.id,
        po_line_id: l.po_line_id,
        qty_received: l.qty_received,
      })),
    );
    if (lErr) throw new Error(lErr.message);

    const { data: receiptLineTotals, error: receiptLineTotalsErr } = await supabase
      .from("receipt_lines")
      .select("po_line_id, qty_received")
      .in(
        "po_line_id",
        filtered.map((l) => l.po_line_id),
      );
    if (receiptLineTotalsErr) throw new Error(receiptLineTotalsErr.message);

    const receivedTotals = new Map<string, number>();
    for (const l of filtered) {
      receivedTotals.set(
        l.po_line_id,
        ((receiptLineTotals ?? []) as ReceiptLineQuantity[])
          .filter((line) => line.po_line_id === l.po_line_id)
          .reduce((sum, line) => sum + Number(line.qty_received || 0), 0),
      );
    }

    for (const l of filtered) {
      const cur = ((poLines ?? []) as PurchaseOrderLineReceiptState[]).find(
        (p) => p.id === l.po_line_id,
      );
      const totalReceived = receivedTotals.get(l.po_line_id) ?? 0;
      if (totalReceived > Number(cur?.qty_ordered ?? 0)) {
        const { error: rollbackErr } = await supabase
          .from("receipts")
          .delete()
          .eq("id", receipt.id);
        if (rollbackErr) {
          throw new Error(
            `Critical rollback failure: receipt ${receipt.id} for PO ${data.po_id} exceeded line quantity and could not be deleted. Manual cleanup required. ${rollbackErr.message}`,
          );
        }
        throw new Error("Receipt quantity exceeds remaining quantity for a PO line");
      }
    }

    for (const l of filtered) {
      const { error } = await supabase
        .from("purchase_order_lines")
        .update({ qty_received: receivedTotals.get(l.po_line_id) ?? 0 })
        .eq("id", l.po_line_id);
      if (error) throw new Error(error.message);
    }

    // Recompute PO status
    const { data: allLines, error: allLinesErr } = await supabase
      .from("purchase_order_lines")
      .select("qty_ordered, qty_received")
      .eq("po_id", data.po_id);
    if (allLinesErr) throw new Error(allLinesErr.message);
    const typedAllLines = (allLines ?? []) as PurchaseOrderLineReceiptState[];
    const fullyReceived = typedAllLines.every(
      (l: PurchaseOrderLineReceiptState) => Number(l.qty_received) >= Number(l.qty_ordered),
    );
    const anyReceived = typedAllLines.some((l) => Number(l.qty_received) > 0);
    const newStatus = fullyReceived ? "received" : anyReceived ? "partially_received" : "sent";
    const { error: statusErr } = await supabase
      .from("purchase_orders")
      .update({ status: newStatus })
      .eq("id", data.po_id);
    if (statusErr) throw new Error(statusErr.message);

    return { id: receipt.id, receipt_number: receipt.receipt_number };
  });
