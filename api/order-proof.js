import { issueOrderProof } from "../lib/orderProof.js";

const WINDOW_MS = 60 * 1000;
const MAX_PROOFS_PER_WINDOW = 12;

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || "").trim();
}

function sameSiteRequest(req) {
  const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (site && !["same-origin", "same-site", "none"].includes(site)) return false;

  const origin = String(req.headers.origin || "").trim();
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!origin || !host) return true;

  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function proofBucket() {
  if (!globalThis.__hanaaOrderProofBuckets) {
    globalThis.__hanaaOrderProofBuckets = new Map();
  }
  return globalThis.__hanaaOrderProofBuckets;
}

function rateLimited(req) {
  const ip = clientIp(req);
  if (!ip) return true;

  const now = Date.now();
  const buckets = proofBucket();
  const current = buckets.get(ip);

  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  if (current.count > MAX_PROOFS_PER_WINDOW) return true;

  if (buckets.size > 5000) {
    for (const [key, value] of buckets) {
      if (now - value.startedAt >= WINDOW_MS) buckets.delete(key);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  if (!sameSiteRequest(req)) {
    return res.status(403).json({ ok: false, code: "ORDER_PROOF_ORIGIN_DENIED" });
  }

  if (rateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ ok: false, code: "ORDER_PROOF_RATE_LIMITED" });
  }

  const body = bodyOf(req);
  const orderId = String(body.orderId || "").trim();
  const phone = String(body.phone || "").trim();

  if (!/^HF[A-Z0-9]{4,24}$/i.test(orderId) || !phone) {
    return res.status(400).json({ ok: false, code: "INVALID_ORDER_PROOF_REQUEST" });
  }

  const proof = issueOrderProof(req, { orderId, phone });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true, ...proof });
}
