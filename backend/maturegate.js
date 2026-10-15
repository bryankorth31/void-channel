// THE MATURE GATE (slice 16). B's question: "how do we stop kids from just selecting
// mature when their parents are not watching?" The answer in three layers:
//   1. members only (already true: anonymous never enters),
//   2. a PIN the account holder sets once (this file),
//   3. SERVER-SIDE payload stripping (server.js): mature categories simply do not ride the
//      payload without a valid gate token. Enforcement, not client politeness.
// The gate token is a short-lived HMAC (4h), held by the client IN MEMORY only, so every
// fresh session re-asks the PIN. No new dependencies: node crypto scrypt + hmac.
const express = require("express");
const crypto = require("crypto");
const { supabase, requireAuth } = require("./supabase");

const router = express.Router();
const GATE_SECRET = process.env.MATURE_GATE_SECRET;
if (!GATE_SECRET) throw new Error("MATURE_GATE_SECRET is not set (the legacy backend is retired; no fallback secret)");
const GATE_TTL_MS = 4 * 60 * 60 * 1000;

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString("hex");
}

function signGate(userId) {
  const exp = Date.now() + GATE_TTL_MS;
  const mac = crypto.createHmac("sha256", GATE_SECRET).update(`${userId}.${exp}`).digest("hex");
  return `${userId}.${exp}.${mac}`;
}

// Exported for server.js: true when the request carries a valid, unexpired gate token.
function gateVerified(req) {
  const tok = req.get("x-mature-gate") || "";
  const [userId, expStr, mac] = tok.split(".");
  if (!userId || !expStr || !mac) return false;
  const exp = parseInt(expStr, 10);
  if (!exp || Date.now() > exp) return false;
  const expect = crypto.createHmac("sha256", GATE_SECRET).update(`${userId}.${exp}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect));
  } catch (e) { return false; }
}

// Set (or change) the PIN. Auth required; changing an existing PIN requires the current one.
router.post("/api/mature-gate/set", requireAuth, async (req, res) => {
  try {
    const { pin, currentPin } = req.body || {};
    if (!/^\d{4,8}$/.test(String(pin || ""))) {
      return res.status(400).json({ error: "PIN must be 4 to 8 digits" });
    }
    const { data: prof } = await supabase
      .from("profiles").select("mature_pin_hash, mature_pin_salt").eq("id", req.user.id).single();
    if (prof && prof.mature_pin_hash) {
      const ok = prof.mature_pin_salt && hashPin(currentPin || "", prof.mature_pin_salt) === prof.mature_pin_hash;
      if (!ok) return res.status(403).json({ error: "current PIN required to change it" });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const { error } = await supabase
      .from("profiles")
      .update({ mature_pin_hash: hashPin(pin, salt), mature_pin_salt: salt })
      .eq("id", req.user.id);
    if (error) throw error;
    res.json({ ok: true, gate: signGate(req.user.id) });
  } catch (err) {
    console.error("[mature-gate/set]", err.message);
    res.status(500).json({ error: "could not set PIN" });
  }
});

// Verify the PIN -> gate token. Small per-user attempt throttle blunts brute force.
const attempts = new Map(); // userId -> { n, t }
router.post("/api/mature-gate/verify", requireAuth, async (req, res) => {
  try {
    const a = attempts.get(req.user.id) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 10 * 60 * 1000) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 8) return res.status(429).json({ error: "too many attempts, wait a few minutes" });
    const { data: prof } = await supabase
      .from("profiles").select("mature_pin_hash, mature_pin_salt").eq("id", req.user.id).single();
    if (!prof || !prof.mature_pin_hash) return res.json({ needsSetup: true });
    const ok = hashPin(req.body && req.body.pin, prof.mature_pin_salt) === prof.mature_pin_hash;
    a.n = ok ? 0 : a.n + 1;
    attempts.set(req.user.id, a);
    if (!ok) return res.status(403).json({ error: "wrong PIN" });
    res.json({ ok: true, gate: signGate(req.user.id) });
  } catch (err) {
    console.error("[mature-gate/verify]", err.message);
    res.status(500).json({ error: "verify failed" });
  }
});

module.exports = { router, gateVerified };
