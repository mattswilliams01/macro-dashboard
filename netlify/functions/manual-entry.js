import { getStore } from "@netlify/blobs";

const ALLOWED_KEYS = new Set(["naaim", "umich_prelim", "umich_final"]);

const JSON_HEADERS = { "Content-Type": "application/json" };

export default async (req) => {
  const store = getStore("manual-entries");

  if (req.method === "GET") {
    const key = new URL(req.url).searchParams.get("key");
    if (!key || !ALLOWED_KEYS.has(key)) {
      return new Response(JSON.stringify({ error: "invalid key" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    const entry = await store.get(key, { type: "json" });
    return new Response(JSON.stringify(entry ?? { value: null, asOf: null }), {
      headers: JSON_HEADERS,
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid JSON" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    const { key, value } = body;
    if (!key || !ALLOWED_KEYS.has(key) || typeof value !== "number" || !isFinite(value)) {
      return new Response(JSON.stringify({ error: "invalid key or value" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    const entry = { value, asOf: new Date().toISOString() };
    await store.setJSON(key, entry);
    return new Response(JSON.stringify(entry), { headers: JSON_HEADERS });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = {
  path: "/.netlify/functions/manual-entry",
};
