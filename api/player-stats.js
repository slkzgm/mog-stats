import { WALLET_REGEX, fetchPlayerStats, json, methodNotAllowed, readJsonBody } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }

    const body = await readJsonBody(req);
    const wallet = (body.wallet || "").trim().toLowerCase();

    if (!WALLET_REGEX.test(wallet)) {
      json(res, 400, { error: "Invalid wallet format" });
      return;
    }

    const stats = await fetchPlayerStats(wallet);
    json(res, 200, { stats });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
