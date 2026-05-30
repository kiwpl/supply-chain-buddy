import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const paymentSchema = z.object({
  po_id: z.string().uuid(),
  payment_date: z.string(),
  amount: z.coerce.number().positive(),
  method: z.enum(["bank_transfer","card","cheque","cash","other"]),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().nullable().optional(),
});

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
    const { error } = await context.supabase.from("po_payments").insert({
      ...data, created_by: context.userId,
    });
    if (error) throw new Error(error.message);
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
