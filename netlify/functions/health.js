export default async () => {
  return new Response(
    JSON.stringify({ status: "ok", ts: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/.netlify/functions/health",
};
