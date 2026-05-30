import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const [pos, payments, suppliers, products, recentPOs, recentReceipts] = await Promise.all([
      supabase.from("purchase_orders").select("id, status, total"),
      supabase.from("po_payments").select("amount, po_id"),
      supabase.from("suppliers").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("purchase_orders")
        .select("id, po_number, status, total, order_date, supplier:suppliers(name)")
        .order("created_at", { ascending: false }).limit(8),
      supabase.from("receipts")
        .select("id, receipt_number, received_date, po:purchase_orders(po_number, supplier:suppliers(name))")
        .order("received_date", { ascending: false }).limit(8),
    ]);

    const poList = pos.data ?? [];
    const paidByPo = new Map<string, number>();
    for (const p of payments.data ?? []) {
      paidByPo.set(p.po_id, (paidByPo.get(p.po_id) ?? 0) + Number(p.amount || 0));
    }
    const openPOs = poList.filter((p: any) => ["draft","sent","partially_received"].includes(p.status)).length;
    const awaitingReceipt = poList.filter((p: any) => ["sent","partially_received"].includes(p.status)).length;
    const outstanding = poList
      .filter((p: any) => p.status !== "cancelled")
      .reduce((s: number, p: any) => s + Math.max(0, Number(p.total) - (paidByPo.get(p.id) ?? 0)), 0);

    return {
      kpis: {
        open_pos: openPOs,
        awaiting_receipt: awaitingReceipt,
        outstanding_payable: outstanding,
        supplier_count: suppliers.count ?? 0,
        product_count: products.count ?? 0,
      },
      recent_pos: recentPOs.data ?? [],
      recent_receipts: recentReceipts.data ?? [],
    };
  });
