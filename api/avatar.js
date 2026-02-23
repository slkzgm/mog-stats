import { fetchAvatarImage, getQueryParam, json, methodNotAllowed } from "./_lib/core.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }

    const sourceUrl = getQueryParam(req, "url").trim();
    if (!sourceUrl) {
      json(res, 400, { error: "Missing avatar URL" });
      return;
    }

    const image = await fetchAvatarImage(sourceUrl);
    res.statusCode = 200;
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(image.body);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}
