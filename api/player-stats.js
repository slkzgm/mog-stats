import { WALLET_REGEX, fetchCurrentWeekProjectedPayout, fetchPlayerStats, json, methodNotAllowed, readJsonBody } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }

    const body = await readJsonBody(req);
    const wallet = (body.wallet || "").trim().toLowerCase();
    const includeCurrentWeekProjected = Boolean(body.includeCurrentWeekProjected);

    if (!WALLET_REGEX.test(wallet)) {
      json(res, 400, { error: "Invalid wallet format" });
      return;
    }

    const stats = await fetchPlayerStats(wallet);
    let currentWeekProjected = null;
    let currentWeekProjectedError = null;

    if (includeCurrentWeekProjected && stats) {
      try {
        currentWeekProjected = await fetchCurrentWeekProjectedPayout(wallet);
      } catch (error) {
        currentWeekProjectedError = error instanceof Error ? error.message : "Projected payout unavailable";
      }
    }

    json(res, 200, { stats, currentWeekProjected, currentWeekProjectedError });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
