// Shared Netlify Blobs cache helper — write-through cache so any panel can
// fall back to the last known-good value when a live source fails.
const { getStore } = require("@netlify/blobs");

const STORE_NAME = "macro-cache";

async function readCache(key) {
  try {
    const store = getStore(STORE_NAME);
    return (await store.get(key, { type: "json" })) || null;
  } catch {
    return null;
  }
}

async function writeCache(key, data) {
  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(key, data);
  } catch {
    // best effort — a cache write failure should never break a live response
  }
}

module.exports = { readCache, writeCache };
