import { getQueryParam, json, methodNotAllowed, searchAbstractProfiles } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }

    const query = getQueryParam(req, "query").trim();
    if (query.length < 2) {
      json(res, 200, { users: [] });
      return;
    }

    try {
      const users = await searchAbstractProfiles(query);
      json(res, 200, { users });
    } catch {
      // Graceful degradation: manual wallet search still works.
      json(res, 200, { users: [] });
    }
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
