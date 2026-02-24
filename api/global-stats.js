import { fetchGlobalStats, getQueryParam, json, methodNotAllowed } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }

    const requestedLimit = getQueryParam(req, "limit");
    const limit = Number.parseInt(requestedLimit || "100", 10);
    const includeProjectedRaw = (getQueryParam(req, "includeCurrentWeekProjected") || "").trim().toLowerCase();
    const includeCurrentWeekProjected = includeProjectedRaw === "1" || includeProjectedRaw === "true";
    const payload = await fetchGlobalStats(limit, { includeCurrentWeekProjected });

    json(res, 200, payload, "public, max-age=20, stale-while-revalidate=40");
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
