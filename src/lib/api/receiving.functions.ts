import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const receiptSchema = z.object({
  po_id: z.string().uuid(),
  received_date: z.string(),
  notes: z.string().nullable().optional(),
  lines: z.array(z.object({
    po_line_id: z.string().uuid(),
    qty_received: z.coerce.number().min(0),
  })).min(1),
});

export const listPOsAwaitingReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("purchase_orders")
      .select("*, supplier:suppliers(id,name), lines:purchase_order_lines(qty_ordered, qty_received)")
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

    const { data: receipt, error: rErr } = await supabase
      .from("receipts")
      .insert({
        po_id: data.po_id,
        received_date: data.received_date,
        notes: data.notes ?? null,
        received_by: context.userId,
      })
      .select("id, receipt_number").single();
    if (rErr) throw new Error(rErr.message);

    const { error: lErr } = await supabase.from("receipt_lines").insert(
      filtered.map((l) => ({ receipt_id: receipt.id, po_line_id: l.po_line_id, qty_received: l.qty_received }))
    );
    if (lErr) throw new Error(lErr.message);

    // Increment qty_received on each PO line
    const { data: poLines } = await supabase
      .from("purchase_order_lines")
      .select("id, qty_ordered, qty_received")
      .in("id", filtered.map((l) => l.po_line_id));
    for (const l of filtered) {
      const cur = poLines?.find((p: any) => p.id === l.po_line_id);
      const next = Number(cur?.qty_received ?? 0) + Number(l.qty_received);
      await supabase.from("purchase_order_lines").update({ qty_received: next }).eq("id", l.po_line_id);
    }

    // Recompute PO status
    const { data: allLines } = await supabase
      .from("purchase_order_lines").select("qty_ordered, qty_received").eq("po_id", data.po_id);
    const fullyReceived = (allLines ?? []).every((l: any) => Number(l.qty_received) >= Number(l.qty_ordered));
    const anyReceived = (allLines ?? []).some((l: any) => Number(l.qty_received) > 0);
    const newStatus = fullyReceived ? "received" : anyReceived ? "partially_received" : "sent";
    await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", data.po_id);

    return { id: receipt.id, receipt_number: receipt.receipt_number };
  });
