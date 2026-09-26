// ---------------------------------------------------------------------------
// maps-link-resolve — what a pasted Google Maps link points at, without the
// Maps API.
//
// A doctor adding a preferred lab can paste the lab's Google Maps share link
// ("https://maps.app.goo.gl/…"). That short link is only a redirect: the URL
// it lands on carries the place's name and coordinates in the path
// ("/maps/place/City+Diagnostics/@26.91,75.78,17z/…" or "!3d26.91!4d75.78").
// This follows the redirects (never the page content) and reads them, so
// the lab form can say "Found: City Diagnostics" and fill a landmark line.
//
// No key, no quota, no page scraping. If Google ever changes the shape, the
// reply is simply empty and the patient's Navigate button still works from
// the link itself — nothing depends on this succeeding.
//
// verify_jwt ON: a signed-in clinic user only; it fetches only Google hosts.
//
// Route: POST /functions/v1/maps-link-resolve   { url }
// Reply: { ok: true, name, lat, lng, url }  |  { ok: false, error }
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const GOOGLE_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|app\.goo\.gl|maps\.app\.goo\.gl|g\.co)$/i;

function isGoogle(u: URL): boolean {
  return (u.protocol === "https:" || u.protocol === "http:") && GOOGLE_HOST.test(u.hostname);
}

/** Name and coordinates out of a full Maps URL, whichever form it takes. */
function parse(url: string): { name: string | null; lat: number | null; lng: number | null } {
  let name: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  const place = url.match(/\/maps\/place\/([^/@?]+)/);
  if (place) name = decodeURIComponent(place[1].replace(/\+/g, " ")).trim() || null;
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const bang = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const q = url.match(/[?&](?:q|query|destination|ll)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  const pick = bang ?? at ?? q;
  if (pick) { lat = Number(pick[1]); lng = Number(pick[2]); }
  if (!name) {
    const qn = url.match(/[?&]q=([^&]+)/);
    if (qn) {
      const v = decodeURIComponent(qn[1].replace(/\+/g, " ")).trim();
      if (v && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(v)) name = v;
    }
  }
  return { name, lat, lng };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "bad_request" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }

  let current: URL;
  try { current = new URL(String(body.url ?? "").trim()); } catch { return json({ ok: false, error: "not_a_link" }); }
  if (!isGoogle(current)) return json({ ok: false, error: "not_google_maps" });

  // Follow redirects by hand, at most five, and only ever to Google.
  for (let hop = 0; hop < 5; hop++) {
    const direct = parse(current.toString());
    if (direct.name || direct.lat !== null) {
      return json({ ok: true, ...direct, url: current.toString() });
    }
    let res: Response;
    try {
      res = await fetch(current.toString(), { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    } catch {
      return json({ ok: false, error: "unreachable" });
    }
    const loc = res.headers.get("location");
    await res.body?.cancel();
    if (!loc) break;
    let next: URL;
    try { next = new URL(loc, current); } catch { break; }
    if (!isGoogle(next)) break;
    current = next;
  }
  const last = parse(current.toString());
  return json({ ok: !!(last.name || last.lat !== null), ...last, url: current.toString() });
});
