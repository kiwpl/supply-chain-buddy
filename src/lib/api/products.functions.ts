import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  unit: z.string().min(1).max(20).default("ea"),
  category: z.string().max(100).nullable().optional(),
  is_active: z.boolean().default(true),
});

const priceSchema = z.object({
  id: z.string().uuid().optional(),
  supplier_id: z.string().uuid(),
  product_id: z.string().uuid(),
  supplier_sku: z.string().max(80).nullable().optional(),
  unit_price: z.coerce.number().min(0),
  currency: z.string().min(3).max(3).default("USD"),
  min_qty: z.coerce.number().min(0).default(1),
  lead_time_days: z.coerce.number().int().min(0).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  is_preferred: z.boolean().default(false),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("products").select("*").order("sku");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("products").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("products").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSupplierPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id?: string; supplier_id?: string }) =>
    z.object({ product_id: z.string().uuid().optional(), supplier_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("supplier_prices")
      .select("*, supplier:suppliers(id,name,code), product:products(id,sku,name,unit)")
      .order("is_preferred", { ascending: false })
      .order("unit_price");
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.supplier_id) q = q.eq("supplier_id", data.supplier_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const upsertSupplierPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => priceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      ...data,
      valid_from: data.valid_from || null,
      valid_to: data.valid_to || null,
      lead_time_days: data.lead_time_days ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("supplier_prices").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("supplier_prices").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteSupplierPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("supplier_prices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
