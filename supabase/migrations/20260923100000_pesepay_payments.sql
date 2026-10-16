alter table public.invoices
  add column if not exists pesepay_reference text;

create unique index if not exists invoices_pesepay_reference_idx
  on public.invoices (pesepay_reference)
  where pesepay_reference is not null;

create unique index if not exists payments_reference_idx
  on public.payments (reference)
  where reference is not null;
