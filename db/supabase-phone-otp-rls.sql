-- Apply only after Supabase Phone Auth + SMS provider is configured and tested.
-- New customer orders must come from a Supabase Auth session whose verified
-- phone number matches the phone stored on the order.

drop policy if exists public_create_orders on public.orders;
drop policy if exists verified_phone_create_orders on public.orders;

create policy verified_phone_create_orders
on public.orders
for insert
to authenticated
with check (
  auth.uid() is not null
  and right(
    regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'),
    9
  ) = right(
    regexp_replace(coalesce(auth.jwt()->>'phone', ''), '[^0-9]', '', 'g'),
    9
  )
);
