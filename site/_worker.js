// Deather Vector Pages worker (advanced mode). _routes.json sends only /api/* here;
// every other path is served as a static file by Cloudflare Pages with _headers applied.
// Deather Vector email signup. Stores addresses in the SUBSCRIBERS KV namespace
// (bound in the Cloudflare Pages project settings). No third-party service involved.
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;
const MAX_PER_IP_PER_HOUR = 5;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function wantsHtml(request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

function reply(request, ok, error, status) {
  if (wantsHtml(request)) {
    const url = new URL(request.url);
    const target = ok ? "/?subscribed=1#follow" : "/?subscribe_error=" + encodeURIComponent(error || "failed") + "#follow";
    return Response.redirect(url.origin + target, 303);
  }
  return ok ? json({ ok: true }) : json({ ok: false, error }, status);
}

async function subscribeGet({ env }) {
  if (!env.SUBSCRIBERS) return json({ ok: false, error: "storage_not_bound" }, 503);
  try {
    await env.SUBSCRIBERS.get("health");
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "storage_error" }, 503);
  }
}

async function subscribePost({ request, env }) {
  if (!env.SUBSCRIBERS) return reply(request, false, "unavailable", 503);

  let email = "";
  let trap = "";
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("application/json")) {
      const body = await request.json();
      email = String((body && body.email) || "");
      trap = String((body && body.website) || "");
    } else {
      const form = await request.formData();
      email = String(form.get("email") || "");
      trap = String(form.get("website") || "");
    }
  } catch (e) {
    return reply(request, false, "bad_request", 400);
  }

  // Bot trap: humans never see or fill the "website" field. Pretend success, store nothing.
  if (trap) return reply(request, true);

  email = email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return reply(request, false, "invalid_email", 400);

  try {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const hour = new Date().toISOString().slice(0, 13);
    const rateKey = "rl:" + ip + ":" + hour;
    const count = parseInt((await env.SUBSCRIBERS.get(rateKey)) || "0", 10);
    if (count >= MAX_PER_IP_PER_HOUR) return reply(request, false, "rate_limited", 429);
    await env.SUBSCRIBERS.put(rateKey, String(count + 1), { expirationTtl: 7200 });

    const key = "sub:" + email;
    const existing = await env.SUBSCRIBERS.getWithMetadata(key);
    if (existing.value === null) {
      const meta = { t: new Date().toISOString(), s: "deathervector.com" };
      await env.SUBSCRIBERS.put(key, "1", { metadata: meta });
    }
    return reply(request, true);
  } catch (e) {
    return reply(request, false, "storage_error", 503);
  }
}


// Owner-only CSV export of the subscriber list.
// Needs the EXPORT_TOKEN value (encrypted variable in the Cloudflare Pages project settings),
// sent as "Authorization: Bearer <token>". Without EXPORT_TOKEN configured this endpoint does not exist.
function notFound() {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

async function sameToken(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportGet({ request, env }) {
  const tokenKey = Object.keys(env || {}).find((k) => k.trim() === "EXPORT_TOKEN");
  const token = tokenKey ? String(env[tokenKey]).trim() : "";
  if (!token || token.length < 24 || !env.SUBSCRIBERS) return notFound();
  const auth = request.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!given || !(await sameToken(given, token))) return notFound();

  const rows = ["email,subscribed_utc,source"];
  let cursor;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      rows.push([k.name.slice(4), m.t || "", m.s || ""].map(csvCell).join(","));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return new Response(rows.join("\n") + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
  });
}

const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

function harden(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  out.headers.set("cache-control", "no-store");
  return out;
}

// Find the KV binding even if its name was saved with stray spaces in the dashboard.
function withStore(env) {
  if (env && env.SUBSCRIBERS) return env;
  const key = Object.keys(env || {}).find((k) => k.trim() === "SUBSCRIBERS");
  return key ? Object.assign({}, env, { SUBSCRIBERS: env[key] }) : env;
}

export default {
  async fetch(request, rawEnv) {
    const env = withStore(rawEnv);
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const method = request.method;
    let res;
    if (path === "/api/subscribe" && method === "GET") res = await subscribeGet({ request, env });
    else if (path === "/api/subscribe" && method === "POST") res = await subscribePost({ request, env });
    else if (path === "/api/export" && method === "GET") res = await exportGet({ request, env });
    else if (path.startsWith("/api")) res = json({ ok: false, error: "not_found" }, 404);
    else return env.ASSETS.fetch(request);
    // Redirects (no-JS form fallback) keep their Location header; harden() copies it.
    return harden(res);
  },
};
