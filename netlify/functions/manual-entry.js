const { getStore } = require("@netlify/blobs");

const ALLOWED_KEYS = new Set(["naaim", "umich_prelim", "umich_final"]);

exports.handler = async (event) => {
  const store = getStore("manual-entries");

  if (event.httpMethod === "GET") {
    const key = event.queryStringParameters?.key;
    if (!key || !ALLOWED_KEYS.has(key)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "invalid key" }),
      };
    }
    const entry = await store.get(key, { type: "json" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry ?? { value: null, asOf: null }),
    };
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "invalid JSON" }),
      };
    }
    const { key, value } = body;
    if (!key || !ALLOWED_KEYS.has(key) || typeof value !== "number" || !isFinite(value)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "invalid key or value" }),
      };
    }
    const entry = { value, asOf: new Date().toISOString() };
    await store.setJSON(key, entry);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    };
  }

  return { statusCode: 405, body: "Method not allowed" };
};
