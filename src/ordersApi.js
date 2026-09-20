import { requireSupabase } from "./supabase";

const TABLE = "orders";
const POLL_INTERVAL_MS = 60000;
const REALTIME_DEBOUNCE_MS = 3000;
const STAFF_SESSION_KEY = "hanaa-auth-session";
const CLIENT_ORDER_IDS_KEY = "hanaa-client-order-ids";
const LEGACY_CLIENT_ORDER_KEY = "hanaa-order";

let listOrdersInFlight = null;
const getOrderInFlight = new Map();

const ordersSubscribers = new Set();
let sharedOrdersChannel = null;
let sharedOrdersPollTimer = null;
let sharedOrdersNotifyTimer = null;
let pendingOrdersPayload = null;
let sharedOrdersSupabase = null;

function hasStaffSession() {
  if (typeof window === "undefined") return false;

  try {
    const session = JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY) || "null");
    const role = String(session?.role || "").trim().toUpperCase();
    return ["ADMIN", "SNACK", "LIVREUR"].includes(role);
  } catch {
    return false;
  }
}

const CUSTOMER_ORDER_TIME_ZONE = "Africa/Casablanca";
const CUSTOMER_ORDER_OPEN_HOUR = 12;
const CUSTOMER_ORDER_CLOSE_HOUR = 3;

function getCustomerOrderHour(now = new Date()) {
  const part = new Intl.DateTimeFormat("en-GB", {
    timeZone: CUSTOMER_ORDER_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((item) => item.type === "hour");

  return Number(part?.value);
}

function assertCustomerOrderingOpen() {
  if (hasStaffSession()) return;

  const hour = getCustomerOrderHour();
  if (
    Number.isFinite(hour) &&
    hour >= CUSTOMER_ORDER_CLOSE_HOUR &&
    hour < CUSTOMER_ORDER_OPEN_HOUR
  ) {
    const error = new Error("CUSTOMER_ORDERING_CLOSED");
    error.code = "CUSTOMER_ORDERING_CLOSED";
    throw error;
  }
}

function readClientOrderIds() {
  if (typeof window === "undefined") return [];

  const ids = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(CLIENT_ORDER_IDS_KEY) || "[]");
    if (Array.isArray(saved)) {
      saved.forEach((id) => {
        const value = String(id || "").trim();
        if (value) ids.add(value);
      });
    }
  } catch {
    // Ignore invalid local client history.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CLIENT_ORDER_KEY) || "null");
    const legacyId = String(legacy?.id || "").trim();
    if (legacyId) ids.add(legacyId);
  } catch {
    // Ignore invalid legacy order.
  }

  return [...ids];
}

function rememberClientOrder(orderId) {
  if (typeof window === "undefined" || hasStaffSession()) return;

  const id = String(orderId || "").trim();
  if (!id) return;

  const ids = new Set(readClientOrderIds());
  ids.add(id);
  localStorage.setItem(CLIENT_ORDER_IDS_KEY, JSON.stringify([...ids].slice(-50)));
}

function customerCanReadOrder(orderId) {
  if (hasStaffSession()) return true;
  const id = String(orderId || "").trim();
  return Boolean(id) && readClientOrderIds().includes(id);
}

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

export async function listOrders(options = {}) {
  if (listOrdersInFlight) return listOrdersInFlight;

  const request = (async () => {
    const supabase = requireSupabase();
    const staff = hasStaffSession();
    const clientOrderIds = staff ? [] : readClientOrderIds();
    const branchId = String(options?.branchId || "").trim();

    if (!staff && !clientOrderIds.length) return [];

    let query = supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (staff && branchId) query = query.eq("branch_id", branchId);
    if (!staff) query = query.in("id", clientOrderIds);

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(fromRow);
  })();

  listOrdersInFlight = request;

  try {
    return await request;
  } finally {
    if (listOrdersInFlight === request) listOrdersInFlight = null;
  }
}

export async function getOrder(orderId) {
  const key = String(orderId);
  if (!customerCanReadOrder(key)) return null;

  const existing = getOrderInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const supabase = requireSupabase();

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", key)
      .maybeSingle();

    if (error) throw error;

    return data ? fromRow(data) : null;
  })();

  getOrderInFlight.set(key, request);

  try {
    return await request;
  } finally {
    if (getOrderInFlight.get(key) === request) getOrderInFlight.delete(key);
  }
}

export async function createOrder(order) {
  assertCustomerOrderingOpen();
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(TABLE)
    .insert(toRow(order))
    .select("*")
    .single();

  if (error) throw error;

  const savedOrder = fromRow(data);
  rememberClientOrder(savedOrder.id);
  return savedOrder;
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

export async function updateExistingOrder(order) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(TABLE)
    .update(toRow(order))
    .eq("id", String(order.id))
    .select("*")
    .single();

  if (error) throw error;

  return fromRow(data);
}

function flushOrdersNotification() {
  sharedOrdersNotifyTimer = null;
  const payload = pendingOrdersPayload;
  pendingOrdersPayload = null;

  for (const subscriber of [...ordersSubscribers]) {
    try {
      subscriber(payload);
    } catch (error) {
      console.error("Order subscriber callback failed:", error);
    }
  }
}

function scheduleOrdersNotification(payload) {
  pendingOrdersPayload = payload;
  if (sharedOrdersNotifyTimer != null) return;

  sharedOrdersNotifyTimer = window.setTimeout(
    flushOrdersNotification,
    REALTIME_DEBOUNCE_MS,
  );
}

function startSharedOrdersSubscription() {
  if (sharedOrdersChannel || sharedOrdersPollTimer != null || !ordersSubscribers.size) return;

  const supabase = requireSupabase();
  sharedOrdersSupabase = supabase;

  if (hasStaffSession()) {
    sharedOrdersChannel = supabase
      .channel(`hanaa-orders-shared-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        (payload) => scheduleOrdersNotification(payload),
      )
      .subscribe();
  }

  sharedOrdersPollTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    scheduleOrdersNotification({ type: "poll" });
  }, POLL_INTERVAL_MS);
}

function stopSharedOrdersSubscription() {
  if (sharedOrdersPollTimer != null) {
    window.clearInterval(sharedOrdersPollTimer);
    sharedOrdersPollTimer = null;
  }

  if (sharedOrdersNotifyTimer != null) {
    window.clearTimeout(sharedOrdersNotifyTimer);
    sharedOrdersNotifyTimer = null;
  }

  pendingOrdersPayload = null;

  if (sharedOrdersChannel && sharedOrdersSupabase) {
    void sharedOrdersSupabase.removeChannel(sharedOrdersChannel);
  }

  sharedOrdersChannel = null;
  sharedOrdersSupabase = null;
}

export function subscribeOrders(onChange) {
  if (typeof onChange !== "function") return () => {};

  ordersSubscribers.add(onChange);
  startSharedOrdersSubscription();

  let active = true;
  return () => {
    if (!active) return;
    active = false;

    ordersSubscribers.delete(onChange);
    if (!ordersSubscribers.size) stopSharedOrdersSubscription();
  };
}

export function subscribeOrder(orderId, onChange) {
  if (!customerCanReadOrder(orderId)) return () => {};

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
    if (document.visibilityState !== "visible") return;
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
