// Simple local test for the Python function under vercel dev
// Usage: node scripts/test_quossi_api.mjs [BASE_URL]
// Default BASE_URL: http://localhost:3000

const base = process.argv[2] || process.env.BASE_URL || "http://localhost:3000";
const url = `${base.replace(/\/$/, "")}/api/quossi_2_0`;

async function main() {
  try {
    // Optional: sanity GET should be 405
    const getResp = await fetch(url);
    if (getResp.status !== 405 && getResp.status !== 200) {
      console.warn(`GET ${url} returned ${getResp.status}; expected 405 for method not allowed.`);
    }

    // POST with a minimal payload
    const payload = { answers: ["a", "b", "c"] };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error(`POST ${url} failed: ${resp.status} ${resp.statusText} -> ${text}`);
      process.exit(1);
    }

    console.log(`POST ${url} ok: ${resp.status}`);
    try { JSON.parse(text || "{}"); } catch {}
    process.exit(0);
  } catch (err) {
    console.error("Error calling API:", err?.message || err);
    process.exit(1);
  }
}

main();

