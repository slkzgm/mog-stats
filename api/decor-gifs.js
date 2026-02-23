import { json, listDecorGifs, methodNotAllowed } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }

    const gifs = await listDecorGifs();
    json(res, 200, { gifs });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
