
-- Enums
CREATE TYPE public.po_status AS ENUM ('draft','sent','partially_received','received','closed','cancelled');
CREATE TYPE public.payment_method AS ENUM ('bank_transfer','card','cheque','cash','other');

-- Suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  contact_name text,
  email text,
  phone text,
  address text,
  payment_terms text,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'ea',
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Supplier prices
CREATE TABLE public.supplier_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_sku text,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  min_qty numeric(14,4) NOT NULL DEFAULT 1,
  lead_time_days integer,
  valid_from date,
  valid_to date,
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.supplier_prices(supplier_id);
CREATE INDEX ON public.supplier_prices(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_prices TO authenticated;
GRANT ALL ON public.supplier_prices TO service_role;
ALTER TABLE public.supplier_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.supplier_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PO number sequence
CREATE SEQUENCE public.po_number_seq START 1000;

-- Purchase orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL DEFAULT ('PO-' || lpad(nextval('public.po_number_seq')::text, 5, '0')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status public.po_status NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.purchase_orders(supplier_id);
CREATE INDEX ON public.purchase_orders(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PO lines
CREATE TABLE public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  qty_ordered numeric(14,4) NOT NULL DEFAULT 0,
  qty_received numeric(14,4) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.purchase_order_lines(po_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.purchase_order_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Receipts
CREATE SEQUENCE public.receipt_number_seq START 1000;
CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text UNIQUE NOT NULL DEFAULT ('RC-' || lpad(nextval('public.receipt_number_seq')::text, 5, '0')),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.receipts(po_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  po_line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE CASCADE,
  qty_received numeric(14,4) NOT NULL DEFAULT 0
);
CREATE INDEX ON public.receipt_lines(receipt_id);
CREATE INDEX ON public.receipt_lines(po_line_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_lines TO authenticated;
GRANT ALL ON public.receipt_lines TO service_role;
ALTER TABLE public.receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.receipt_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Payments
CREATE TABLE public.po_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.po_payments(po_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_payments TO authenticated;
GRANT ALL ON public.po_payments TO service_role;
ALTER TABLE public.po_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.po_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_supplier_prices_updated BEFORE UPDATE ON public.supplier_prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
