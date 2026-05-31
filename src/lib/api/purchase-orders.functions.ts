import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables } from "@/integrations/supabase/types";

type PaymentAmount = { amount: number | string | null };
type PurchaseOrderLine = Tables<"purchase_order_lines">;
type PurchaseOrderSummary = Tables<"purchase_orders"> & {
  payments?: PaymentAmount[] | null;
};
type PurchaseOrderDetail = Tables<"purchase_orders"> & {
  payments?: PaymentAmount[] | null;
  lines?: PurchaseOrderLine[] | null;
};
type ExistingLine = Pick<PurchaseOrderLine, "id" | "qty_received">;

const lineSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(500),
  qty_ordered: z.coerce.number().min(0),
  unit_price: z.coerce.number().min(0),
});

const poInputSchema = z.object({
  id: z.string().uuid().optional(),
  supplier_id: z.string().uuid(),
  order_date: z.string(),
  expected_date: z.string().nullable().optional(),
  currency: z.string().min(3).max(3).default("USD"),
  tax: z.coerce.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).default([]),
});

function recomputeTotals(lines: { qty_ordered: number; unit_price: number }[], tax: number) {
  const subtotal = lines.reduce((s, l) => s + Number(l.qty_ordered) * Number(l.unit_price), 0);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number((subtotal + Number(tax || 0)).toFixed(2)),
  };
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export const listPurchaseOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("purchase_orders")
      .select("*, supplier:suppliers(id,name,code), payments:po_payments(amount)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as PurchaseOrderSummary[]).map((po) => {
      const paid = (po.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        ...po,
        amount_paid: roundMoney(paid),
        balance_due: roundMoney(Number(po.total) - paid),
      };
    });
  });

export const getPurchaseOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: po, error } = await context.supabase
      .from("purchase_orders")
      .select(
        "*, supplier:suppliers(*), lines:purchase_order_lines(*, product:products(id,sku,name,unit)), receipts(*, lines:receipt_lines(*)), payments:po_payments(*)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!po) return null;
    const typedPo = po as PurchaseOrderDetail;
    const paid = (typedPo.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const sortedLines = [...(typedPo.lines ?? [])].sort(
      (a: PurchaseOrderLine, b: PurchaseOrderLine) => (a.position ?? 0) - (b.position ?? 0),
    );
    return {
      ...po,
      lines: sortedLines,
      amount_paid: roundMoney(paid),
      balance_due: roundMoney(Number(po.total) - paid),
    };
  });

export const savePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => poInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { lines, id, ...header } = data;
    const totals = recomputeTotals(lines, header.tax ?? 0);
    const payload = {
      ...header,
      ...totals,
      expected_date: header.expected_date || null,
    };
    let poId = id;
    if (poId) {
      const { error } = await context.supabase
        .from("purchase_orders")
        .update(payload)
        .eq("id", poId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await context.supabase
        .from("purchase_orders")
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      poId = ins.id;
    }

    // Replace lines (simple, safe for draft editing)
    const { data: existing } = await context.supabase
      .from("purchase_order_lines")
      .select("id, qty_received")
      .eq("po_id", poId);
    const keepIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
    const toDelete = ((existing ?? []) as ExistingLine[]).filter((e) => !keepIds.has(e.id));
    if (toDelete.length) {
      const { error } = await context.supabase
        .from("purchase_order_lines")
        .delete()
        .in(
          "id",
          toDelete.map((e) => e.id),
        );
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const lineTotal = Number((l.qty_ordered * l.unit_price).toFixed(2));
      if (l.id) {
        const { error } = await context.supabase
          .from("purchase_order_lines")
          .update({
            product_id: l.product_id ?? null,
            description: l.description,
            qty_ordered: l.qty_ordered,
            unit_price: l.unit_price,
            line_total: lineTotal,
            position: i,
          })
          .eq("id", l.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await context.supabase.from("purchase_order_lines").insert({
          po_id: poId,
          product_id: l.product_id ?? null,
          description: l.description,
          qty_ordered: l.qty_ordered,
          unit_price: l.unit_price,
          line_total: lineTotal,
          position: i,
        });
        if (error) throw new Error(error.message);
      }
    }
    return { id: poId };
  });

export const setPOStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "sent", "partially_received", "received", "closed", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("purchase_orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("purchase_orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
