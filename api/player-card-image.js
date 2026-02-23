import { json, methodNotAllowed, readJsonBody, renderPlayerCardImage } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }

    const body = await readJsonBody(req);
    const pngBuffer = await renderPlayerCardImage(body);

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.end(pngBuffer);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
