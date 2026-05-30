import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const supplierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  code: z.string().max(50).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  payment_terms: z.string().max(100).nullable().optional(),
  currency: z.string().min(3).max(3).default("USD"),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("suppliers").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const getSupplier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("suppliers").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => supplierSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, email: data.email || null };
    if (data.id) {
      const { error } = await context.supabase.from("suppliers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("suppliers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
