import { requireSupabase } from "./supabase";

const TABLE = "orders";
const POLL_INTERVAL_MS = 3000;

const toRow = (order) => ({
  id: String(order.id),

  customer_name: order.customerName || null,
  customer_phone: order.customerPhone || null,

  order_type: order.orderType || null,

  branch_id: order.branchId || null,
  branch_name: order.branchName || null,

  delivery_address: order.deliveryAddress || "",
  customer_latitude: order.customerLatitude ?? null,
  customer_longitude: order.customerLongitude ?? null,

  distance_km: order.distanceKm ?? null,
  estimated_travel_time:
    order.estimatedTravelTime != null
      ? Math.round(Number(order.estimatedTravelTime))
      : null,

  delivery_fee: order.deliveryFee ?? 0,
  payment_method: order.paymentMethod || null,

  subtotal: order.subtotal ?? 0,
  total: order.total ?? 0,

  status: order.status ?? 0,
  status_label: order.statusLabel || null,

  items: order.items || [],
  status_history: order.statusHistory || [],

  driver_id: order.driverId || null,

  payload: order,

  created_at: order.createdAt || new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const fromRow = (row) => ({
  ...(row?.payload || {}),

  id: row.id,

  customerName: row.customer_name ?? row?.payload?.customerName ?? "",
  customerPhone: row.customer_phone ?? row?.payload?.customerPhone ?? "",

  orderType: row.order_type ?? row?.payload?.orderType ?? "",

  branchId: row.branch_id ?? row?.payload?.branchId ?? "",
  branchName: row.branch_name ?? row?.payload?.branchName ?? "",

  deliveryAddress:
    row.delivery_address ?? row?.payload?.deliveryAddress ?? "",

  customerLatitude:
    row.customer_latitude ?? row?.payload?.customerLatitude ?? null,

  customerLongitude:
    row.customer_longitude ?? row?.payload?.customerLongitude ?? null,

  distanceKm: row.distance_km ?? row?.payload?.distanceKm ?? null,

  estimatedTravelTime:
    row.estimated_travel_time ??
    row?.payload?.estimatedTravelTime ??
    null,

  deliveryFee: row.delivery_fee ?? row?.payload?.deliveryFee ?? 0,

  paymentMethod:
    row.payment_method ?? row?.payload?.paymentMethod ?? "",

  subtotal: row.subtotal ?? row?.payload?.subtotal ?? 0,
  total: row.total ?? row?.payload?.total ?? 0,

  status: row.status ?? row?.payload?.status ?? 0,

  statusLabel:
    row.status_label ?? row?.payload?.statusLabel ?? "",

  items: row.items ?? row?.payload?.items ?? [],

  statusHistory:
    row.status_history ?? row?.payload?.statusHistory ?? [],

  driverId: row.driver_id ?? row?.payload?.driverId ?? null,

  createdAt: row.created_at ?? row?.payload?.createdAt,
  updatedAt: row.updated_at,
});

export async function listOrders() {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  return (data || []).map(fromRow);
}

export async function getOrder(orderId) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", String(orderId))
    .maybeSingle();

  if (error) throw error;

  return data ? fromRow(data) : null;
}

export async function createOrder(order) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(TABLE)
    .insert(toRow(order))
    .select("*")
    .single();

  if (error) throw error;

  return fromRow(data);
}

export async function upsertOrder(order) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(toRow(order), { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;

  return fromRow(data);
}

export function subscribeOrders(onChange) {
  const supabase = requireSupabase();

  const channel = supabase
    .channel(`hanaa-orders-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => onChange?.(payload),
    )
    .subscribe();

  const pollTimer = window.setInterval(() => {
    onChange?.({ type: "poll" });
  }, POLL_INTERVAL_MS);

  return () => {
    window.clearInterval(pollTimer);
    void supabase.removeChannel(channel);
  };
}

export function subscribeOrder(orderId, onChange) {
  const supabase = requireSupabase();

  const channel = supabase
    .channel(
      `hanaa-order-${String(orderId)}-${Math.random()
        .toString(36)
        .slice(2)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `id=eq.${String(orderId)}`,
      },
      (payload) => {
        if (payload.new?.id) onChange?.(fromRow(payload.new));
      },
    )
    .subscribe();

  const pollTimer = window.setInterval(() => {
    void getOrder(orderId)
      .then((order) => {
        if (order) onChange?.(order);
      })
      .catch((error) => {
        console.error("Order polling fallback failed:", error);
      });
  }, POLL_INTERVAL_MS);

  return () => {
    window.clearInterval(pollTimer);
    void supabase.removeChannel(channel);
  };
}
