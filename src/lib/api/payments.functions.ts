import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PaymentAmount = { amount: number | string | null };

const paymentSchema = z.object({
  po_id: z.string().uuid(),
  payment_date: z.string(),
  amount: z.coerce.number().positive(),
  method: z.enum(["bank_transfer", "card", "cheque", "cash", "other"]),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().nullable().optional(),
});

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("po_payments")
      .select("*, po:purchase_orders(id, po_number, total, supplier:suppliers(name))")
      .order("payment_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: po, error: poErr } = await context.supabase
      .from("purchase_orders")
      .select("id, total")
      .eq("id", data.po_id)
      .maybeSingle();
    if (poErr) throw new Error(poErr.message);
    if (!po) throw new Error("Purchase order not found");

    const { data: payments, error: paymentsErr } = await context.supabase
      .from("po_payments")
      .select("amount")
      .eq("po_id", data.po_id);
    if (paymentsErr) throw new Error(paymentsErr.message);

    const paid = ((payments ?? []) as PaymentAmount[]).reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const balance = roundMoney(Number(po.total) - paid);
    if (Number(data.amount) > balance) {
      throw new Error(`Payment amount exceeds remaining PO balance. Remaining balance: ${balance}`);
    }

    const { data: payment, error } = await context.supabase
      .from("po_payments")
      .insert({
        ...data,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: updatedPayments, error: updatedPaymentsErr } = await context.supabase
      .from("po_payments")
      .select("amount")
      .eq("po_id", data.po_id);
    if (updatedPaymentsErr) throw new Error(updatedPaymentsErr.message);

    const updatedPaid = ((updatedPayments ?? []) as PaymentAmount[]).reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    if (roundMoney(updatedPaid) > Number(po.total)) {
      const { error: rollbackErr } = await context.supabase
        .from("po_payments")
        .delete()
        .eq("id", payment.id);
      if (rollbackErr) {
        throw new Error(
          `Critical rollback failure: payment ${payment.id} for PO ${data.po_id} exceeded PO balance and could not be deleted. Manual cleanup required. ${rollbackErr.message}`,
        );
      }
      throw new Error("Payment amount exceeds remaining PO balance");
    }

    return { ok: true };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("po_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
