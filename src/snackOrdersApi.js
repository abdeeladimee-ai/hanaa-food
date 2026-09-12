import { requireSupabase } from "./supabase";

const TABLE = "orders";
const LIST_LIMIT = 40;
const FALLBACK_POLL_MS = 60000;
const LIST_FIELDS = [
  "id",
  "customer_name",
  "customer_phone",
  "order_type",
  "branch_id",
  "branch_name",
  "delivery_address",
  "customer_latitude",
  "customer_longitude",
  "delivery_fee",
  "payment_method",
  "subtotal",
  "total",
  "status",
  "status_label",
  "items",
  "status_history",
  "driver_id",
  "created_at",
  "updated_at",
].join(",");

const fromRow = (row) => ({
  id: row.id,
  customerName: row.customer_name || "",
  customerPhone: row.customer_phone || "",
  orderType: row.order_type || "",
  branchId: row.branch_id || "",
  branchName: row.branch_name || "",
  deliveryAddress: row.delivery_address || "",
  customerLatitude: row.customer_latitude ?? null,
  customerLongitude: row.customer_longitude ?? null,
  deliveryFee: row.delivery_fee ?? 0,
  paymentMethod: row.payment_method || "",
  subtotal: row.subtotal ?? 0,
  total: row.total ?? 0,
  status: row.status ?? 0,
  statusLabel: row.status_label || "",
  items: Array.isArray(row.items) ? row.items : [],
  statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
  driverId: row.driver_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listSnackOrders(branchId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select(LIST_FIELDS)
    .eq("branch_id", String(branchId))
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function getSnackOrder(orderId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", String(orderId))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...fromRow(data),
    payload: data.payload && typeof data.payload === "object" ? data.payload : {},
  };
}

export async function saveSnackOrderStatus(orderId, nextStatus, extra = {}) {
  const supabase = requireSupabase();
  const current = await getSnackOrder(orderId);
  if (!current) throw new Error("Commande introuvable");

  const at = new Date().toISOString();
  const statusHistory = [
    ...(current.statusHistory || []),
    { status: nextStatus, at, ...extra },
  ];
  const payload = {
    ...(current.payload || {}),
    ...extra,
    statusLabel: nextStatus,
    statusHistory,
  };

  const update = {
    status_label: nextStatus,
    status_history: statusHistory,
    payload,
    updated_at: at,
  };

  if (extra.branchId) update.branch_id = extra.branchId;

  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq("id", String(orderId))
    .select(LIST_FIELDS)
    .single();

  if (error) throw error;
  return fromRow(data);
}

export function subscribeSnackOrders(branchId, onChange) {
  const supabase = requireSupabase();
  const branch = String(branchId);
  const channel = supabase
    .channel(`hanaa-snack-${branch}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `branch_id=eq.${branch}`,
      },
      (payload) => onChange?.(payload),
    )
    .subscribe();

  const pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      onChange?.({ type: "fallback-poll" });
    }
  }, FALLBACK_POLL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      onChange?.({ type: "visible" });
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(pollTimer);
    document.removeEventListener("visibilitychange", onVisible);
    void supabase.removeChannel(channel);
  };
}
