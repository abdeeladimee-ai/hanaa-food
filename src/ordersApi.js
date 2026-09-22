import { requireSupabase } from "./supabase";

const TABLE = "orders";
const DEFAULT_POLL_INTERVAL_MS = 60000;
const CUSTOMER_TRACKING_POLL_INTERVAL_MS = 30000;
const MAX_POLL_BACKOFF_MS = 120000;
const SUPABASE_REQUEST_TIMEOUT_MS = 8000;
const ORDER_SUBMIT_TIMEOUT_MS = 12000;
const RETRYABLE_ORDER_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const STAFF_SESSION_KEY = "hanaa-auth-session";
const CLIENT_ORDER_IDS_KEY = "hanaa-client-order-ids";
const LEGACY_CLIENT_ORDER_KEY = "hanaa-order";
const PENDING_ORDER_QUEUE_KEY = "hanaa-pending-order-writes-v2";
const LEGACY_PENDING_ORDER_QUEUE_KEY = "hanaa-pending-order-writes-v1";
const PENDING_ORDER_QUEUE_LIMIT = 5;
const PENDING_ORDER_MAX_AGE_MS = 30 * 60 * 1000;
const LEGACY_PENDING_MIGRATION_MAX_AGE_MS = 10 * 60 * 1000;
const PENDING_ORDER_FLUSH_INTERVAL_MS = 120000;

const listOrdersInFlight = new Map();
let createOrderInFlight = null;
const getOrderInFlight = new Map();

const ordersSubscribers = new Set();
let sharedOrdersPollTimer = null;
let sharedOrdersFailureCount = 0;
let pendingOrdersFlushInFlight = null;
let pendingOrdersFlushTimer = null;
let pendingOrdersLastAttemptAt = 0;

function readStaffSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw =
      localStorage.getItem(STAFF_SESSION_KEY) ||
      sessionStorage.getItem(STAFF_SESSION_KEY) ||
      "null";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasStaffSession() {
  const session = readStaffSession();
  const role = String(session?.role || "").trim().toUpperCase();
  return ["ADMIN", "SNACK", "LIVREUR"].includes(role);
}

const CUSTOMER_ORDER_TIME_ZONE = "UTC";
const CUSTOMER_ORDER_OPEN_HOUR = 0;
const CUSTOMER_ORDER_CLOSE_HOUR = 0;

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

function normalizePendingOrderRows(saved, maxAgeMs = PENDING_ORDER_MAX_AGE_MS) {
  if (!Array.isArray(saved)) return [];

  const now = Date.now();

  return saved
    .map((entry) => {
      const row = entry?.row && typeof entry.row === "object" ? entry.row : entry;
      const id = String(row?.id || "").trim();
      const queuedAt = entry?.queuedAt || new Date().toISOString();
      const queuedAtMs = Date.parse(queuedAt);

      if (!id || !Number.isFinite(queuedAtMs) || now - queuedAtMs > maxAgeMs) {
        return null;
      }

      return { row, queuedAt };
    })
    .filter(Boolean)
    .slice(-PENDING_ORDER_QUEUE_LIMIT);
}

function readPendingOrderRows() {
  if (typeof window === "undefined") return [];

  try {
    let raw = localStorage.getItem(PENDING_ORDER_QUEUE_KEY);

    // The old queue could contain many stale retries. Migrate only the newest
    // recent order once, then remove v1 so it cannot recreate a request storm.
    if (raw == null) {
      const legacyRaw = localStorage.getItem(LEGACY_PENDING_ORDER_QUEUE_KEY);
      const legacy = JSON.parse(legacyRaw || "[]");
      const migrated = normalizePendingOrderRows(
        legacy,
        LEGACY_PENDING_MIGRATION_MAX_AGE_MS,
      ).slice(-1);

      localStorage.removeItem(LEGACY_PENDING_ORDER_QUEUE_KEY);
      localStorage.setItem(PENDING_ORDER_QUEUE_KEY, JSON.stringify(migrated));
      raw = JSON.stringify(migrated);
    }

    return normalizePendingOrderRows(JSON.parse(raw || "[]"));
  } catch {
    return [];
  }
}

function writePendingOrderRows(entries) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      PENDING_ORDER_QUEUE_KEY,
      JSON.stringify(entries.slice(-PENDING_ORDER_QUEUE_LIMIT)),
    );
  } catch {
    // If local storage is unavailable, the normal network path still runs.
  }
}

function enqueuePendingOrderRow(row) {
  if (typeof window === "undefined") return;

  const id = String(row?.id || "").trim();
  if (!id) return;

  const entries = readPendingOrderRows().filter(
    (entry) => String(entry?.row?.id || "") !== id,
  );

  entries.push({ row, queuedAt: new Date().toISOString() });
  writePendingOrderRows(entries);
}

function removePendingOrderRow(orderId) {
  if (typeof window === "undefined") return;

  const id = String(orderId || "").trim();
  if (!id) return;

  const entries = readPendingOrderRows().filter(
    (entry) => String(entry?.row?.id || "") !== id,
  );
  writePendingOrderRows(entries);
}

function isRetryableOrderError(error) {
  const status = Number(error?.status || 0);
  return (
    error?.name === "AbortError" ||
    error instanceof TypeError ||
    RETRYABLE_ORDER_STATUSES.has(status)
  );
}

function schedulePendingOrdersFlush(delayMs = PENDING_ORDER_FLUSH_INTERVAL_MS) {
  if (typeof window === "undefined") return;

  if (pendingOrdersFlushTimer != null) {
    window.clearTimeout(pendingOrdersFlushTimer);
  }

  pendingOrdersFlushTimer = window.setTimeout(() => {
    pendingOrdersFlushTimer = null;
    void flushPendingOrderRows();
  }, delayMs);
}

async function flushPendingOrderRows() {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    schedulePendingOrdersFlush();
    return;
  }

  if (pendingOrdersFlushInFlight) return pendingOrdersFlushInFlight;

  const cooldownMs =
    PENDING_ORDER_FLUSH_INTERVAL_MS - (Date.now() - pendingOrdersLastAttemptAt);
  if (cooldownMs > 0) {
    schedulePendingOrdersFlush(cooldownMs);
    return;
  }

  const request = (async () => {
    const [entry] = readPendingOrderRows();
    const row = entry?.row;
    const id = String(row?.id || "").trim();

    if (!id) return;

    // Exactly one recovery write per cycle. A slow backend must never turn
    // into dozens of simultaneous retries.
    pendingOrdersLastAttemptAt = Date.now();

    try {
      await submitOrderRow(row);
      removePendingOrderRow(id);
      rememberClientOrder(id);
    } catch (error) {
      if (!isRetryableOrderError(error)) {
        console.error("Pending order needs manual attention:", id, error);
      }
    }
  })();

  pendingOrdersFlushInFlight = request;

  try {
    await request;
  } finally {
    if (pendingOrdersFlushInFlight === request) {
      pendingOrdersFlushInFlight = null;
    }

    if (readPendingOrderRows().length) {
      schedulePendingOrdersFlush();
    }
  }
}

function startPendingOrdersRecovery() {
  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    schedulePendingOrdersFlush(5000);
  });

  if (readPendingOrderRows().length) {
    schedulePendingOrdersFlush(5000);
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
  const staff = hasStaffSession();
  const clientOrderIds = staff ? [] : readClientOrderIds();
  const branchId = String(options?.branchId || "").trim();
  const updatedSince = String(options?.updatedSince || "").trim();
  const requestedLimit = Number(options?.limit || (staff ? 120 : 50));
  const limit = Math.max(1, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 120));
  const requestKey = JSON.stringify({
    staff,
    branchId,
    updatedSince,
    limit,
    clientOrderIds: staff ? [] : clientOrderIds,
  });

  const existing = listOrdersInFlight.get(requestKey);
  if (existing) return existing;

  if (!staff && !clientOrderIds.length) return [];

  const request = (async () => {
    const supabase = requireSupabase();
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      SUPABASE_REQUEST_TIMEOUT_MS,
    );

    try {
      const session = readStaffSession();
      const role = String(session?.role || "").trim().toUpperCase();

      if (role === "ADMIN" && session?.cloudToken) {
        const { data, error } = await supabase
          .rpc("staff_admin_orders", {
            p_token: String(session.cloudToken),
            p_updated_since: updatedSince || null,
            p_limit: limit,
          })
          .abortSignal(controller.signal);

        if (error) throw error;
        return (data || []).map(fromRow);
      }

      let query = supabase
        .from(TABLE)
        .select("id,payload,created_at,updated_at")
        .order(updatedSince ? "updated_at" : "created_at", { ascending: false })
        .limit(limit)
        .abortSignal(controller.signal);

      if (staff && branchId) query = query.eq("branch_id", branchId);
      if (updatedSince) query = query.gt("updated_at", updatedSince);
      if (!staff) query = query.in("id", clientOrderIds);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(fromRow);
    } finally {
      window.clearTimeout(timer);
    }
  })();

  listOrdersInFlight.set(requestKey, request);

  try {
    return await request;
  } finally {
    if (listOrdersInFlight.get(requestKey) === request) {
      listOrdersInFlight.delete(requestKey);
    }
  }
}

export async function getOrder(orderId) {
  const key = String(orderId);
  if (!customerCanReadOrder(key)) return null;

  const existing = getOrderInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const supabase = requireSupabase();

    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      SUPABASE_REQUEST_TIMEOUT_MS,
    );

    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("id,payload,created_at,updated_at")
        .eq("id", key)
        .maybeSingle()
        .abortSignal(controller.signal);

      if (error) throw error;
      return data ? fromRow(data) : null;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  getOrderInFlight.set(key, request);

  try {
    return await request;
  } finally {
    if (getOrderInFlight.get(key) === request) getOrderInFlight.delete(key);
  }
}

const wait = (delayMs) =>
  new Promise((resolve) => window.setTimeout(resolve, delayMs));

async function submitOrderRow(row) {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    ORDER_SUBMIT_TIMEOUT_MS,
  );

  try {
    const response = await fetch("/api/order-submit-v3", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hanaa-order-client": "hanaa-orders-v3",
      },
      body: JSON.stringify(row),
      signal: controller.signal,
    });

    if (response.ok) return;

    let body = null;
    try {
      body = await response.json();
    } catch {}

    const error = new Error(
      body?.code || `ORDER_WRITE_FAILED_${response.status}`,
    );
    error.status = response.status;
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
export async function createOrder(order) {
  assertCustomerOrderingOpen();

  if (createOrderInFlight) return createOrderInFlight;

  const request = (async () => {
    const row = toRow(order);

    // Persist locally before touching the network so a refresh/crash cannot
    // silently lose a customer's order.
    enqueuePendingOrderRow(row);

    try {
      await submitOrderRow(row);
      removePendingOrderRow(row.id);

      const savedOrder = fromRow(row);
      rememberClientOrder(savedOrder.id);
      return savedOrder;
    } catch (error) {
      if (!isRetryableOrderError(error)) {
        removePendingOrderRow(row.id);
        throw error;
      }

      // Keep the exact same order ID queued. The server endpoint is idempotent,
      // so recovery can safely retry without creating duplicate orders.
      rememberClientOrder(row.id);
      schedulePendingOrdersFlush(30000);

      return {
        ...fromRow(row),
        pendingSync: true,
      };
    }
  })();

  createOrderInFlight = request;

  try {
    return await request;
  } finally {
    if (createOrderInFlight === request) createOrderInFlight = null;
  }
}

export async function upsertOrder(order) {
  const supabase = requireSupabase();
  const row = toRow(order);
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    SUPABASE_REQUEST_TIMEOUT_MS,
  );

  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: "id" })
      .abortSignal(controller.signal);

    if (error) throw error;
    return fromRow(row);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function updateExistingOrder(order) {
  const supabase = requireSupabase();
  const row = toRow(order);
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    SUPABASE_REQUEST_TIMEOUT_MS,
  );

  try {
    const { error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("id", String(order.id))
      .abortSignal(controller.signal);

    if (error) throw error;
    return fromRow(row);
  } finally {
    window.clearTimeout(timer);
  }
}

function baseOrdersPollInterval() {
  const path = window.location.pathname;
  if (path === "/snack") return 20000;
  if (path === "/livreur") return 20000;
  return DEFAULT_POLL_INTERVAL_MS;
}

async function runOrdersSubscribers() {
  if (!ordersSubscribers.size) return true;

  const results = await Promise.allSettled(
    [...ordersSubscribers].map((subscriber) =>
      Promise.resolve().then(() => subscriber({ type: "poll" })),
    ),
  );

  return results.some((result) => result.status === "fulfilled");
}

function scheduleNextOrdersPoll(delayMs) {
  if (!ordersSubscribers.size) return;

  if (sharedOrdersPollTimer != null) {
    window.clearTimeout(sharedOrdersPollTimer);
  }

  sharedOrdersPollTimer = window.setTimeout(async () => {
    sharedOrdersPollTimer = null;

    if (document.visibilityState !== "visible") {
      scheduleNextOrdersPoll(baseOrdersPollInterval());
      return;
    }

    const success = await runOrdersSubscribers();
    if (success) {
      sharedOrdersFailureCount = 0;
    } else {
      sharedOrdersFailureCount = Math.min(sharedOrdersFailureCount + 1, 4);
    }

    const base = baseOrdersPollInterval();
    const nextDelay = success
      ? base
      : Math.min(base * 2 ** sharedOrdersFailureCount, MAX_POLL_BACKOFF_MS);

    scheduleNextOrdersPoll(nextDelay);
  }, delayMs);
}

function startSharedOrdersSubscription() {
  if (sharedOrdersPollTimer != null || !ordersSubscribers.size) return;
  sharedOrdersFailureCount = 0;
  scheduleNextOrdersPoll(baseOrdersPollInterval());
}

function stopSharedOrdersSubscription() {
  if (sharedOrdersPollTimer != null) {
    window.clearTimeout(sharedOrdersPollTimer);
    sharedOrdersPollTimer = null;
  }

  sharedOrdersFailureCount = 0;
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

  let active = true;
  let timer = null;
  let failures = 0;

  const schedule = (delayMs) => {
    if (!active) return;
    timer = window.setTimeout(async () => {
      if (!active) return;

      if (document.visibilityState !== "visible") {
        schedule(CUSTOMER_TRACKING_POLL_INTERVAL_MS);
        return;
      }

      try {
        const order = await getOrder(orderId);
        failures = 0;
        if (order) onChange?.(order);
      } catch (error) {
        failures = Math.min(failures + 1, 4);
        console.error("Order polling fallback failed:", error);
      }

      const nextDelay = failures
        ? Math.min(
            CUSTOMER_TRACKING_POLL_INTERVAL_MS * 2 ** failures,
            MAX_POLL_BACKOFF_MS,
          )
        : CUSTOMER_TRACKING_POLL_INTERVAL_MS;

      schedule(nextDelay);
    }, delayMs);
  };

  schedule(CUSTOMER_TRACKING_POLL_INTERVAL_MS);

  return () => {
    active = false;
    if (timer != null) window.clearTimeout(timer);
  };
}


startPendingOrdersRecovery();
