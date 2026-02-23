import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://127.0.0.1:8080/v1/graphql";
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || "";
const ABS_SEARCH_ENDPOINT = "https://backend.portal.abs.xyz/api/search/global";
const ABS_SEARCH_BEARER = process.env.ABS_SEARCH_BEARER || "";
const ALLOWED_AVATAR_HOST_SUFFIX = ".abs.xyz";
const CARD_IMAGE_WIDTH = 1600;
const CARD_IMAGE_HEIGHT = 520;
const KEY_ICON_ASSET = "assets/bundle_2.png";
const JACKPOT_ICON_ASSET = "assets/jackpot_big.png";
let cardIconDataUrlsPromise = null;

const PLAYER_STATS_QUERY = `
query WalletOverview($wallet: String!) {
  PlayerStats(where: { wallet: { _eq: $wallet } }) {
    wallet
    keyPurchaseAmount
    keyPurchaseEvents
    keysPurchased
    weeklyClaimAmount
    weeklyClaimEvents
    jackpotClaimAmount
    jackpotClaimEvents
    firstSeenBlock
    updatedAtBlock
    updatedAtTimestamp
  }
}
`;

export const json = (res, statusCode, payload, cache = "no-store") => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(payload));
};

export const getQueryParam = (req, key) => {
  if (req.query && key in req.query) {
    const value = req.query[key];
    if (Array.isArray(value)) return String(value[0] || "");
    return String(value || "");
  }

  try {
    const url = new URL(req.url || "", "http://localhost");
    return url.searchParams.get(key) || "";
  } catch {
    return "";
  }
};

export const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString("utf8");
    return raw ? JSON.parse(raw) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

export const methodNotAllowed = (res, allowed) => {
  res.setHeader("Allow", allowed);
  json(res, 405, { error: "Method not allowed" });
};

const toLimitedString = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const shortAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const normalizeEthString = (value, fallback = "0") => {
  const raw = toLimitedString(value, 40).replaceAll(",", ".");
  const clean = raw.replace(/[^0-9.+-]/g, "");
  if (!clean || clean === "." || clean === "+" || clean === "-" || clean === "+." || clean === "-.") {
    return fallback;
  }
  return clean;
};

const normalizeIntegerString = (value, fallback = "0") => {
  const clean = toLimitedString(value, 30).replace(/[^\d]/g, "");
  return clean || fallback;
};

const normalizeSearchUsers = (users) =>
  (users || [])
    .filter((user) => WALLET_REGEX.test(user.address || ""))
    .slice(0, 8)
    .map((user) => ({
      name: user.name || "",
      address: user.address.toLowerCase(),
      image: user.image || "",
      verification: user.verification || null,
    }));

export const fetchPlayerStats = async (wallet) => {
  const headers = {
    "Content-Type": "application/json",
  };
  if (HASURA_ADMIN_SECRET) {
    headers["x-hasura-admin-secret"] = HASURA_ADMIN_SECRET;
  }

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: PLAYER_STATS_QUERY,
      variables: { wallet },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL HTTP ${response.status}: ${text}`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors[0].message || "GraphQL error");
  }

  return body.data?.PlayerStats?.[0] || null;
};

export const searchAbstractProfiles = async (query) => {
  const searchUrl = `${ABS_SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    Referer: "https://portal.abs.xyz/",
  };

  if (ABS_SEARCH_BEARER) {
    headers.Authorization = `Bearer ${ABS_SEARCH_BEARER}`;
  }

  const response = await fetch(searchUrl, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`ABS search HTTP ${response.status}`);
  }

  const body = await response.json();
  return normalizeSearchUsers(body?.results?.users ?? []);
};

export const fetchAvatarImage = async (rawUrl) => {
  let avatarUrl;
  try {
    avatarUrl = new URL(rawUrl);
  } catch {
    throw new Error("Invalid avatar URL");
  }

  if (avatarUrl.protocol !== "https:") {
    throw new Error("Only https avatars are allowed");
  }

  const host = avatarUrl.hostname.toLowerCase();
  if (!(host === "abs.xyz" || host.endsWith(ALLOWED_AVATAR_HOST_SUFFIX))) {
    throw new Error("Avatar host is not allowed");
  }

  const response = await fetch(avatarUrl.toString(), {
    headers: {
      Accept: "image/*",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Avatar fetch failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("Avatar URL is not an image");
  }

  const body = Buffer.from(await response.arrayBuffer());
  return { contentType, body };
};

const parseCardPayload = (body) => {
  const wallet = toLimitedString(body.wallet, 42).toLowerCase();
  if (!WALLET_REGEX.test(wallet)) {
    throw new Error("Invalid wallet format");
  }

  const shortWallet = toLimitedString(body.shortWallet, 22) || shortAddress(wallet);
  const displayName = toLimitedString(body.displayName, 22) || shortWallet;

  const keySpendEth = normalizeEthString(body.keySpendEth, "0");
  const weeklyClaimsEth = normalizeEthString(body.weeklyClaimsEth, "0");
  const jackpotClaimsEth = normalizeEthString(body.jackpotClaimsEth, "0");
  const totalClaimsEth = normalizeEthString(body.totalClaimsEth, "0");
  const netEth = normalizeEthString(body.netEth, "0");

  const keysBought = normalizeIntegerString(body.keysBought, "0");
  const purchaseEvents = normalizeIntegerString(body.purchaseEvents, "0");
  const weeklyEvents = normalizeIntegerString(body.weeklyEvents, "0");
  const jackpotEvents = normalizeIntegerString(body.jackpotEvents, "0");
  const avatarUrl = toLimitedString(body.avatarUrl, 600);

  const netNumber = Number(netEth);
  const netTone = Number.isFinite(netNumber) ? (netNumber > 0 ? "positive" : netNumber < 0 ? "negative" : "neutral") : "neutral";

  return {
    wallet,
    displayName,
    shortWallet,
    keySpendEth,
    weeklyClaimsEth,
    jackpotClaimsEth,
    totalClaimsEth,
    netEth,
    keysBought,
    purchaseEvents,
    weeklyEvents,
    jackpotEvents,
    avatarUrl,
    netTone,
  };
};

const getNetPalette = (tone) => {
  if (tone === "positive") {
    return {
      text: "#bfffd7",
      fill: "rgba(84, 220, 150, 0.17)",
      stroke: "rgba(120, 255, 188, 0.44)",
    };
  }

  if (tone === "negative") {
    return {
      text: "#ffb8bf",
      fill: "rgba(255, 129, 156, 0.16)",
      stroke: "rgba(255, 155, 175, 0.45)",
    };
  }

  return {
    text: "#ffd989",
    fill: "rgba(255, 207, 100, 0.16)",
    stroke: "rgba(255, 207, 100, 0.4)",
  };
};

const loadCardIconDataUrls = async () => {
  if (cardIconDataUrlsPromise) return cardIconDataUrlsPromise;

  const toDataUrl = async (assetPath) => {
    try {
      const body = await readFile(join(process.cwd(), assetPath));
      return `data:image/png;base64,${body.toString("base64")}`;
    } catch {
      return "";
    }
  };

  cardIconDataUrlsPromise = Promise.all([toDataUrl(KEY_ICON_ASSET), toDataUrl(JACKPOT_ICON_ASSET)]).then(
    ([keyIcon, jackpotIcon]) => ({
      keyIcon,
      jackpotIcon,
    }),
  );

  return cardIconDataUrlsPromise;
};

const buildPlayerCardSvg = (payload, avatarDataUrl = "", icons = { keyIcon: "", jackpotIcon: "" }) => {
  const width = CARD_IMAGE_WIDTH;
  const height = CARD_IMAGE_HEIGHT;
  const panelX = 18;
  const panelY = 18;
  const panelW = width - panelX * 2;
  const panelH = height - panelY * 2;
  const leftPad = panelX + 34;
  const topPad = panelY + 34;

  const statY = panelY + 132;
  const statGap = 16;
  const statW = (panelW - 72 - statGap * 3) / 4;
  const statH = 102;
  const metaY1 = panelY + 252;
  const metaY2 = panelY + 326;
  const metaW = (panelW - 72 - statGap) / 2;
  const metaH = 56;

  const safeDisplayName = payload.displayName.length > 18 ? `${payload.displayName.slice(0, 17)}...` : payload.displayName;

  const netPalette = getNetPalette(payload.netTone);
  const netLabel = `Net ${payload.netEth} ETH`;
  const netPillW = Math.max(340, Math.min(520, 90 + netLabel.length * 18));
  const netPillX = panelX + panelW - netPillW - 28;
  const netPillY = topPad + 2;

  const statCard = (x, y, label, value, iconDataUrl = "", iconType = "") => {
    const iconShellX = x + statW - 50;
    const iconShellY = y + 10;
    const iconSize = iconType === "key" ? 29 : 23;
    const iconOffset = (34 - iconSize) / 2;

    const iconMarkup = iconDataUrl
      ? `
      <rect x="${iconShellX}" y="${iconShellY}" width="34" height="34" rx="10" fill="rgba(8, 26, 43, 0.68)" stroke="rgba(130, 188, 230, 0.34)" stroke-width="1.5"/>
      <image href="${iconDataUrl}" x="${iconShellX + iconOffset}" y="${iconShellY + iconOffset}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" opacity="0.98"/>
    `
      : "";

    return `
    <g>
      <rect x="${x}" y="${y}" width="${statW}" height="${statH}" rx="24" fill="rgba(6, 22, 37, 0.56)" stroke="rgba(114, 183, 230, 0.3)" stroke-width="2"/>
      ${iconMarkup}
      <text x="${x + 24}" y="${y + 34}" fill="#9eb8d1" font-size="16" font-family="Arial, sans-serif" font-weight="600" letter-spacing="2.2">${escapeXml(
        label,
      )}</text>
      <text x="${x + 24}" y="${y + 78}" fill="#edf7ff" font-size="26" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
        value,
      )} ETH</text>
    </g>
  `;
  };

  const metaCard = (x, y, text) => `
    <g>
      <rect x="${x}" y="${y}" width="${metaW}" height="${metaH}" rx="20" fill="rgba(6, 22, 37, 0.44)" stroke="rgba(114, 183, 230, 0.23)" stroke-width="2"/>
      <text x="${x + 22}" y="${y + 37}" fill="#aac4db" font-size="20" font-family="Arial, sans-serif">${escapeXml(text)}</text>
    </g>
  `;

  const avatarMarkup = avatarDataUrl
    ? `
      <clipPath id="avatarClip"><circle cx="${leftPad + 44}" cy="${topPad + 44}" r="38"/></clipPath>
      <circle cx="${leftPad + 44}" cy="${topPad + 44}" r="40" fill="#18364f" stroke="rgba(110, 198, 255, 0.86)" stroke-width="4"/>
      <image href="${avatarDataUrl}" x="${leftPad + 6}" y="${topPad + 6}" width="76" height="76" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />
    `
    : `
      <defs>
        <linearGradient id="avatarFallbackGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4bb9ff"/>
          <stop offset="100%" stop-color="#2ce9b8"/>
        </linearGradient>
      </defs>
      <circle cx="${leftPad + 44}" cy="${topPad + 44}" r="40" fill="url(#avatarFallbackGrad)"/>
      <text x="${leftPad + 44}" y="${topPad + 58}" fill="#062638" text-anchor="middle" font-size="40" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
          safeDisplayName.slice(0, 1).toUpperCase() || "?",
        )}</text>
    `;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1727"/>
      <stop offset="52%" stop-color="#123049"/>
      <stop offset="100%" stop-color="#0d2f3f"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(118, 211, 255, 0.12)"/>
      <stop offset="100%" stop-color="rgba(11, 29, 48, 0.9)"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="26" fill="url(#panelGrad)" stroke="rgba(130, 188, 230, 0.34)" stroke-width="3"/>

  ${avatarMarkup}

  <text x="${leftPad + 118}" y="${topPad + 40}" fill="#edf7ff" font-size="56" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
    safeDisplayName,
  )}</text>
  <text x="${leftPad + 118}" y="${topPad + 88}" fill="#9eb8d1" font-size="22" font-family="DejaVu Sans Mono, monospace">${escapeXml(
    `(${payload.shortWallet})`,
  )}</text>

  <rect x="${netPillX}" y="${netPillY}" width="${netPillW}" height="66" rx="33" fill="${netPalette.fill}" stroke="${netPalette.stroke}" stroke-width="2.5"/>
  <text x="${netPillX + netPillW / 2}" y="${netPillY + 44}" text-anchor="middle" fill="${netPalette.text}" font-size="32" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
    netLabel,
  )}</text>

  ${statCard(panelX + 36, statY, "KEY SPEND", payload.keySpendEth, icons.keyIcon, "key")}
  ${statCard(panelX + 36 + (statW + statGap), statY, "WEEKLY CLAIMS", payload.weeklyClaimsEth)}
  ${statCard(
    panelX + 36 + (statW + statGap) * 2,
    statY,
    "JACKPOT CLAIMS",
    payload.jackpotClaimsEth,
    icons.jackpotIcon,
    "jackpot",
  )}
  ${statCard(panelX + 36 + (statW + statGap) * 3, statY, "TOTAL CLAIMS", payload.totalClaimsEth)}

  ${metaCard(panelX + 36, metaY1, `Keys bought: ${payload.keysBought}`)}
  ${metaCard(panelX + 36 + metaW + statGap, metaY1, `Purchase events: ${payload.purchaseEvents}`)}
  ${metaCard(panelX + 36, metaY2, `Weekly events: ${payload.weeklyEvents}`)}
  ${metaCard(panelX + 36 + metaW + statGap, metaY2, `Jackpot events: ${payload.jackpotEvents}`)}
</svg>
`;
};

export const renderPlayerCardImage = async (rawPayload) => {
  const payload = parseCardPayload(rawPayload);
  const icons = await loadCardIconDataUrls();

  let avatarDataUrl = "";
  if (payload.avatarUrl) {
    try {
      const avatar = await fetchAvatarImage(payload.avatarUrl);
      avatarDataUrl = `data:${avatar.contentType};base64,${avatar.body.toString("base64")}`;
    } catch {
      avatarDataUrl = "";
    }
  }

  const svg = buildPlayerCardSvg(payload, avatarDataUrl, icons);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: CARD_IMAGE_WIDTH,
    },
  });

  return resvg.render().asPng();
};
