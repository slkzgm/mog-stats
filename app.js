const form = document.querySelector("#wallet-form");
const walletInput = document.querySelector("#wallet-input");
const statusEl = document.querySelector("#status");
const card = document.querySelector("#stats-card");
const suggestionsEl = document.querySelector("#suggestions");
const walletView = document.querySelector("#wallet-view");
const globalView = document.querySelector("#global-view");
const walletViewBtn = document.querySelector("#view-wallet-btn");
const globalViewBtn = document.querySelector("#view-global-btn");

const walletTitle = document.querySelector("#wallet-title");
const walletSubtitle = document.querySelector("#wallet-subtitle");
const profileAvatar = document.querySelector("#profile-avatar");
const netPill = document.querySelector("#net-pill");

const keysEth = document.querySelector("#keys-eth");
const weeklyEth = document.querySelector("#weekly-eth");
const jackpotEth = document.querySelector("#jackpot-eth");
const totalEth = document.querySelector("#total-eth");

const keysCount = document.querySelector("#keys-count");
const keysEvents = document.querySelector("#keys-events");
const weeklyEvents = document.querySelector("#weekly-events");
const jackpotEvents = document.querySelector("#jackpot-events");
const copyImageBtn = document.querySelector("#copy-image-btn");
const shareStatus = document.querySelector("#share-status");
const panelGhost = document.querySelector(".panel-ghost");
const includeCurrentWeekCheckbox = document.querySelector("#include-current-week");
const projectedWeekNote = document.querySelector("#projected-week-note");
const globalStatus = document.querySelector("#global-status");
const globalCard = document.querySelector("#global-card");
const globalPlayers = document.querySelector("#g-players");
const globalKeys = document.querySelector("#g-keys");
const globalKeySpend = document.querySelector("#g-key-spend");
const globalTotalClaims = document.querySelector("#g-total-claims");
const globalWeeklyClaims = document.querySelector("#g-weekly-claims");
const globalJackpotClaims = document.querySelector("#g-jackpot-claims");
const globalNet = document.querySelector("#g-net");
const globalClaimEvents = document.querySelector("#g-claim-events");
const leaderboardCount = document.querySelector("#leaderboard-count");
const leaderboardBody = document.querySelector("#leaderboard-body");

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;
const WEI_IN_ETH = 10n ** 18n;
const SEARCH_DEBOUNCE_MS = 180;
const COPY_SOUND_URL = "/assets/copy.mp3";
const DECOR_GHOST_FALLBACK = "/assets/ghost.gif";
const DEFAULT_GLOBAL_LEADERBOARD_LIMIT = 100;

let selectedProfile = null;
let lastSearchToken = 0;
let searchDebounceHandle = null;
let currentWallet = "";
let currentCardData = null;
let copyFlashTimer = null;
let copyButtonResetTimer = null;
let copySound = null;
let decorGifOptions = [];
let selectedDecorGif = "";
let includeCurrentWeekProjected = false;
let currentView = "wallet";
let globalLoaded = false;

const withSign = (valueWei) => {
  if (valueWei > 0n) return `+${formatEth(valueWei)} ETH`;
  if (valueWei < 0n) return `${formatEth(valueWei)} ETH`;
  return "0 ETH";
};

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(valueWei, decimals = 4) {
  const negative = valueWei < 0n;
  const abs = negative ? -valueWei : valueWei;
  const scale = 10n ** BigInt(decimals);

  // Round to the nearest display unit (e.g. 0.0001 when decimals=4).
  const roundedAbs = (abs * scale + WEI_IN_ETH / 2n) / WEI_IN_ETH;
  if (roundedAbs === 0n) return "0";

  const integerPart = roundedAbs / scale;
  const fractionPart = roundedAbs % scale;
  const fractionString = fractionPart.toString().padStart(decimals, "0").replace(/0+$/, "");

  const pretty = fractionString.length ? `${integerPart.toString()}.${fractionString}` : integerPart.toString();
  return `${negative ? "-" : ""}${pretty}`;
}

function formatInt(value) {
  try {
    return BigInt(String(value ?? "0")).toLocaleString("en-US");
  } catch {
    return "0";
  }
}

function parseWei(value) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setCurrentView(view, options = {}) {
  const next = view === "global" ? "global" : "wallet";
  currentView = next;
  const isGlobal = next === "global";

  walletView.classList.toggle("hidden", isGlobal);
  globalView.classList.toggle("hidden", !isGlobal);
  walletViewBtn.classList.toggle("is-active", !isGlobal);
  globalViewBtn.classList.toggle("is-active", isGlobal);
  if (isGlobal) {
    statusEl.textContent = "";
    clearSuggestions();
  } else {
    globalStatus.textContent = "";
  }

  const shouldSyncUrl = options.syncUrl !== false;
  if (shouldSyncUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    if (next !== "wallet") {
      url.searchParams.delete("wallet");
    } else if (WALLET_REGEX.test(currentWallet)) {
      url.searchParams.set("wallet", currentWallet);
    } else {
      url.searchParams.delete("wallet");
    }
    window.history.replaceState({}, "", url.toString());
  }
}

function showError(message) {
  statusEl.textContent = message;
  card.classList.add("hidden");
  currentCardData = null;
  projectedWeekNote.textContent = "";
  projectedWeekNote.classList.add("hidden");
  showShareStatus("");
}

function showShareStatus(message) {
  shareStatus.textContent = message;
}

function showGlobalError(message) {
  globalStatus.textContent = message;
  globalCard.classList.add("hidden");
}

function renderLeaderboardRows(rows) {
  if (!rows.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="5">No player rows available yet.</td></tr>`;
    leaderboardCount.textContent = "0 rows";
    return;
  }

  leaderboardBody.innerHTML = rows
    .map((row, index) => {
      const wallet = (row.wallet || "").toLowerCase();
      const net = parseWei(row.netProfitAmount);
      const totalClaims = parseWei(row.totalClaimAmount);
      const keySpend = parseWei(row.keyPurchaseAmount);
      const walletLabel = WALLET_REGEX.test(wallet) ? shortAddress(wallet) : wallet;
      const profileName = typeof row.profileName === "string" ? row.profileName.trim() : "";
      const profileImage = typeof row.profileImageUrl === "string" ? row.profileImageUrl.trim() : "";
      const displayName = profileName || walletLabel;
      const displayNameSafe = escapeHtml(displayName.length > 22 ? `${displayName.slice(0, 21)}...` : displayName);
      const walletLabelSafe = escapeHtml(walletLabel);
      const walletSafe = escapeHtml(wallet);
      const avatarFallback = escapeHtml((displayName.charAt(0) || "?").toUpperCase());
      const avatarMarkup = profileImage
        ? `<img class="leaderboard-avatar" src="${escapeHtml(profileImage)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
        : `<span class="leaderboard-avatar leaderboard-avatar-fallback">${avatarFallback}</span>`;
      const subtitleMarkup = profileName
        ? `<span class="leaderboard-player-address">${walletLabelSafe}</span>`
        : "";

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <button class="leaderboard-wallet-btn" type="button" data-wallet="${walletSafe}">
              <span class="leaderboard-player">
                ${avatarMarkup}
                <span class="leaderboard-player-meta">
                  <span class="leaderboard-player-name">${displayNameSafe}</span>
                  ${subtitleMarkup}
                </span>
              </span>
            </button>
          </td>
          <td>${withSign(net)}</td>
          <td>${formatEth(totalClaims)} ETH</td>
          <td>${formatEth(keySpend)} ETH</td>
        </tr>
      `;
    })
    .join("");

  leaderboardCount.textContent = `${rows.length} rows`;
}

function renderGlobalStats(payload) {
  const global = payload?.global;
  if (!global) {
    showGlobalError("Global stats are not available yet.");
    return;
  }

  const keySpendWei = parseWei(global.keyPurchaseAmount);
  const totalClaimsWei = parseWei(global.totalClaimAmount);
  const weeklyClaimsWei = parseWei(global.weeklyClaimAmount);
  const jackpotClaimsWei = parseWei(global.jackpotClaimAmount);
  const netWei = parseWei(global.netProfitAmount);

  globalPlayers.textContent = formatInt(global.totalUniquePlayers);
  globalKeys.textContent = formatInt(global.keysPurchased);
  globalKeySpend.textContent = `${formatEth(keySpendWei)} ETH`;
  globalTotalClaims.textContent = `${formatEth(totalClaimsWei)} ETH`;
  globalWeeklyClaims.textContent = `${formatEth(weeklyClaimsWei)} ETH`;
  globalJackpotClaims.textContent = `${formatEth(jackpotClaimsWei)} ETH`;
  globalClaimEvents.textContent = formatInt(parseWei(global.weeklyClaimEvents) + parseWei(global.jackpotClaimEvents));
  globalNet.textContent = `${withSign(netWei)}`;
  globalNet.classList.remove("positive", "negative");
  if (netWei > 0n) globalNet.classList.add("positive");
  if (netWei < 0n) globalNet.classList.add("negative");

  renderLeaderboardRows(payload.leaderboard || []);
  globalStatus.textContent = "";
  globalCard.classList.remove("hidden");
}

async function loadGlobalStats(force = false) {
  if (globalLoaded && !force) return;

  globalStatus.textContent = "Loading global stats...";
  globalCard.classList.add("hidden");
  const response = await fetch(`/api/global-stats?limit=${DEFAULT_GLOBAL_LEADERBOARD_LIMIT}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Global stats API error");
  }

  const hasGlobal = Boolean(payload?.global);
  renderGlobalStats(payload);
  globalLoaded = hasGlobal;
}

function pickRandomItem(items) {
  if (!items.length) return "";
  if (window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return items[buf[0] % items.length];
  }
  return items[Math.floor(Math.random() * items.length)];
}

async function loadDecorGifOptions() {
  let list = [];
  try {
    const response = await fetch("/api/decor-gifs");
    const payload = await response.json();
    if (response.ok) {
      list = (payload.gifs || []).filter(
        (value) =>
          typeof value === "string" &&
          value.startsWith("/assets/") &&
          value.toLowerCase().endsWith(".gif") &&
          !value.includes(".."),
      );
    }
  } catch {
    // fallback handled below
  }

  const deduped = [...new Set(list)];
  if (!deduped.includes(DECOR_GHOST_FALLBACK)) {
    deduped.push(DECOR_GHOST_FALLBACK);
  }
  decorGifOptions = deduped;
}

function applyRandomDecorGif() {
  const nextGif = pickRandomItem(decorGifOptions) || DECOR_GHOST_FALLBACK;
  selectedDecorGif = nextGif;
  if (!panelGhost) {
    return;
  }

  panelGhost.classList.add("hidden");
  panelGhost.src = nextGif;

  const cleanup = () => {
    panelGhost.removeEventListener("load", reveal);
    panelGhost.removeEventListener("error", fail);
  };

  const reveal = () => {
    cleanup();
    panelGhost.classList.remove("hidden");
  };

  const fail = () => {
    cleanup();
    if (selectedDecorGif !== DECOR_GHOST_FALLBACK) {
      selectedDecorGif = DECOR_GHOST_FALLBACK;
      panelGhost.src = DECOR_GHOST_FALLBACK;
      panelGhost.addEventListener("load", reveal, { once: true });
      panelGhost.addEventListener("error", reveal, { once: true });
      return;
    }
    panelGhost.classList.remove("hidden");
  };

  panelGhost.addEventListener("load", reveal, { once: true });
  panelGhost.addEventListener("error", fail, { once: true });

  if (panelGhost.complete && panelGhost.naturalWidth > 0) {
    reveal();
  }
}

function getCopySound() {
  if (copySound) return copySound;
  copySound = new Audio(COPY_SOUND_URL);
  copySound.preload = "auto";
  copySound.volume = 0.72;
  return copySound;
}

async function primeCopySound() {
  const sound = getCopySound();
  if (sound.dataset.primed === "1") return;

  const previousMuted = sound.muted;
  const previousVolume = sound.volume;
  sound.muted = true;
  sound.volume = 0;

  try {
    await sound.play();
  } catch {
    // Some browsers may still block. Keep going.
  } finally {
    sound.pause();
    sound.currentTime = 0;
    sound.muted = previousMuted;
    sound.volume = previousVolume;
    sound.dataset.primed = "1";
  }
}

async function playCopySound() {
  const sound = getCopySound();
  try {
    sound.currentTime = 0;
    await sound.play();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      showShareStatus("Card image copied. Sound is blocked until browser media is enabled.");
      return false;
    }
    showShareStatus("Card image copied. Could not play sound.");
    return false;
  }
}

function setCopyButtonState(mode) {
  if (mode === "busy") {
    copyImageBtn.disabled = true;
    copyImageBtn.classList.remove("is-done");
    copyImageBtn.classList.add("is-busy");
    copyImageBtn.textContent = "Copying...";
    return;
  }

  if (mode === "done") {
    copyImageBtn.disabled = false;
    copyImageBtn.classList.remove("is-busy");
    copyImageBtn.classList.add("is-done");
    copyImageBtn.textContent = "Copied";
    return;
  }

  copyImageBtn.disabled = false;
  copyImageBtn.classList.remove("is-busy", "is-done");
  copyImageBtn.textContent = "Copy as Image";
}

function flashCopyFeedback() {
  if (copyFlashTimer) clearTimeout(copyFlashTimer);
  card.classList.remove("copy-success");
  void card.offsetWidth;
  card.classList.add("copy-success");
  copyFlashTimer = setTimeout(() => {
    card.classList.remove("copy-success");
  }, 700);
}

function clearSuggestions() {
  suggestionsEl.innerHTML = "";
  suggestionsEl.classList.add("hidden");
}

function renderSuggestions(users) {
  if (!users.length) {
    clearSuggestions();
    return;
  }

  suggestionsEl.innerHTML = users
    .map((user) => {
      const escapedName = (user.name || "Unnamed").replace(/"/g, "&quot;");
      const escapedAddress = user.address.replace(/"/g, "&quot;");
      const escapedImage = (user.image || "").replace(/"/g, "&quot;");
      return `
        <button
          class="suggestion-item"
          type="button"
          data-name="${escapedName}"
          data-address="${escapedAddress}"
          data-image="${escapedImage}"
          role="option"
        >
          <img class="suggestion-avatar" src="${escapedImage}" alt="${escapedName}" onerror="this.style.visibility='hidden'" />
          <span class="suggestion-main">
            <span class="suggestion-name">${escapedName}</span>
            <span class="suggestion-address">${escapedAddress}</span>
          </span>
        </button>
      `;
    })
    .join("");
  suggestionsEl.classList.remove("hidden");
}

async function searchProfiles(query) {
  const token = ++lastSearchToken;
  const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
  const payload = await response.json();

  if (token !== lastSearchToken) {
    return;
  }

  if (!response.ok) {
    throw new Error(payload.error || "Search API error");
  }

  renderSuggestions(payload.users || []);
  statusEl.textContent = "";
}

function setProfileIdentity(wallet, profile) {
  const profileName = profile?.name?.trim() || "";
  const displayName = profileName || shortAddress(wallet);
  const avatar = profile?.image?.trim();

  walletTitle.textContent = `${displayName}`;
  walletSubtitle.textContent = profileName ? `(${shortAddress(wallet)})` : "";

  if (avatar) {
    profileAvatar.src = `/api/avatar?url=${encodeURIComponent(avatar)}`;
    profileAvatar.classList.remove("hidden");
  } else {
    profileAvatar.removeAttribute("src");
    profileAvatar.classList.add("hidden");
  }
}

async function resolveProfileForWallet(wallet) {
  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(wallet)}`);
    if (!response.ok) return null;

    const payload = await response.json();
    const exact = (payload.users || []).find((user) => (user.address || "").toLowerCase() === wallet);
    if (!exact) return null;

    return {
      name: exact.name || "",
      address: wallet,
      image: exact.image || "",
      verification: exact.verification || null,
    };
  } catch {
    return null;
  }
}

function resolveIndexedProfile(stats) {
  const name = typeof stats?.profileName === "string" ? stats.profileName.trim() : "";
  const image = typeof stats?.profileImageUrl === "string" ? stats.profileImageUrl.trim() : "";
  const verification = typeof stats?.profileVerification === "string" ? stats.profileVerification.trim() : "";

  if (!name && !image) return null;
  return {
    name,
    address: stats.wallet,
    image,
    verification: verification || null,
  };
}

function setWalletInUrl(wallet) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "wallet");
  url.searchParams.set("wallet", wallet);
  window.history.replaceState({}, "", url.toString());
}

function getShareFileName() {
  const fallback = "wallet";
  if (!WALLET_REGEX.test(currentWallet)) {
    return `mog-wallet-${fallback}.png`;
  }

  return `mog-wallet-${currentWallet.slice(2, 10)}.png`;
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

async function copyCardAsImage() {
  if (!currentCardData) {
    throw new Error("No card data available");
  }

  const response = await fetch("/api/player-card-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(currentCardData),
  });

  if (!response.ok) {
    let message = "Could not render image";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const blob = await response.blob();

  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
    showShareStatus("Card image copied to clipboard.");
    return "clipboard";
  }

  downloadBlob(blob, getShareFileName());
  showShareStatus("Clipboard image is not supported here. PNG downloaded instead.");
  return "download";
}

function showStats(stats, profile = null, currentWeekProjected = null, includeProjection = false, projectionError = "") {
  const keyPurchaseAmount = BigInt(stats.keyPurchaseAmount);
  const weeklyClaimAmount = BigInt(stats.weeklyClaimAmount);
  const jackpotClaimAmount = BigInt(stats.jackpotClaimAmount);
  const projectedWeekPayoutWei =
    includeProjection && currentWeekProjected?.projectedPayoutWei ? BigInt(currentWeekProjected.projectedPayoutWei) : 0n;

  const weeklyClaimAmountWithProjection = weeklyClaimAmount + projectedWeekPayoutWei;
  const totalClaims = weeklyClaimAmountWithProjection + jackpotClaimAmount;
  const net = totalClaims - keyPurchaseAmount;
  currentWallet = stats.wallet;

  setProfileIdentity(stats.wallet, profile);

  const keyPurchaseEth = formatEth(keyPurchaseAmount);
  const weeklyClaimEth = formatEth(weeklyClaimAmountWithProjection);
  const jackpotClaimEth = formatEth(jackpotClaimAmount);
  const totalClaimsEth = formatEth(totalClaims);
  const netText = withSign(net);
  const shortWalletValue = shortAddress(stats.wallet);
  const profileName = profile?.name?.trim() || "";
  const displayName = profileName || shortWalletValue;
  const avatarUrl = profile?.image?.trim() || "";

  keysEth.textContent = `${keyPurchaseEth} ETH`;

  weeklyEth.textContent = `${weeklyClaimEth} ETH`;

  jackpotEth.textContent = `${jackpotClaimEth} ETH`;

  totalEth.textContent = `${totalClaimsEth} ETH`;

  netPill.classList.remove("net-positive", "net-negative");
  if (net > 0n) netPill.classList.add("net-positive");
  if (net < 0n) netPill.classList.add("net-negative");
  netPill.textContent = `Net ${netText}`;

  const keysPurchased = BigInt(stats.keysPurchased).toString();
  const keyPurchaseEvents = BigInt(stats.keyPurchaseEvents).toString();
  const weeklyClaimEvents = BigInt(stats.weeklyClaimEvents).toString();
  const jackpotClaimEvents = BigInt(stats.jackpotClaimEvents).toString();

  keysCount.textContent = `Keys bought: ${keysPurchased}`;
  keysEvents.textContent = `Purchase events: ${keyPurchaseEvents}`;
  weeklyEvents.textContent = `Weekly events: ${weeklyClaimEvents}`;
  jackpotEvents.textContent = `Jackpot events: ${jackpotClaimEvents}`;

  if (includeProjection) {
    const weekNumber = currentWeekProjected?.weekNumber ?? "?";
    const projectedEth = formatEth(projectedWeekPayoutWei);
    if (projectionError && !currentWeekProjected) {
      projectedWeekNote.textContent = "Projected current week payout is unavailable right now.";
    } else {
      projectedWeekNote.textContent = `Projected current week payout (Week ${weekNumber}): +${projectedEth} ETH`;
    }
    projectedWeekNote.classList.remove("hidden");
  } else {
    projectedWeekNote.textContent = "";
    projectedWeekNote.classList.add("hidden");
  }

  statusEl.textContent = "";
  card.classList.remove("hidden");
  setWalletInUrl(stats.wallet);
  showShareStatus("");
  currentCardData = {
    wallet: stats.wallet,
    displayName,
    shortWallet: shortWalletValue,
    avatarUrl,
    keySpendEth: keyPurchaseEth,
    weeklyClaimsEth: weeklyClaimEth,
    jackpotClaimsEth: jackpotClaimEth,
    totalClaimsEth,
    netEth: netText.replace(" ETH", ""),
    keysBought: keysPurchased,
    purchaseEvents: keyPurchaseEvents,
    weeklyEvents: weeklyClaimEvents,
    jackpotEvents: jackpotClaimEvents,
    decorGif: selectedDecorGif || DECOR_GHOST_FALLBACK,
  };
}

async function loadWalletStats(wallet, profile = null, options = {}) {
  const includeProjection = Boolean(options.includeCurrentWeekProjected ?? includeCurrentWeekProjected);
  statusEl.textContent = "Loading...";
  card.classList.add("hidden");
  currentCardData = null;

  const response = await fetch("/api/player-stats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wallet, includeCurrentWeekProjected: includeProjection }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "API error");
  }

  if (!payload.stats) {
    showError("No data found for this wallet (no indexed events yet).");
    return;
  }

  let effectiveProfile = profile;
  if (!effectiveProfile) {
    effectiveProfile = resolveIndexedProfile(payload.stats);
  }
  if (!effectiveProfile) {
    effectiveProfile = await resolveProfileForWallet(wallet);
  }

  if (effectiveProfile) {
    selectedProfile = effectiveProfile;
  }

  showStats(
    payload.stats,
    effectiveProfile,
    payload.currentWeekProjected || null,
    includeProjection,
    payload.currentWeekProjectedError || "",
  );
}

async function openWalletView(wallet, profile = null, options = {}) {
  setCurrentView("wallet");
  await loadWalletStats(wallet, profile, options);
}

suggestionsEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".suggestion-item");
  if (!button) return;

  const profile = {
    name: button.dataset.name || "",
    address: (button.dataset.address || "").toLowerCase(),
    image: button.dataset.image || "",
  };

  selectedProfile = profile;
  walletInput.value = profile.address;
  clearSuggestions();

  try {
    await openWalletView(profile.address, profile);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

walletInput.addEventListener("input", () => {
  const value = walletInput.value.trim();
  const lowered = value.toLowerCase();

  if (!selectedProfile || selectedProfile.address !== lowered) {
    selectedProfile = null;
  }

  if (searchDebounceHandle) {
    clearTimeout(searchDebounceHandle);
  }

  if (!value || WALLET_REGEX.test(lowered)) {
    clearSuggestions();
    return;
  }

  searchDebounceHandle = setTimeout(async () => {
    try {
      await searchProfiles(value);
    } catch (error) {
      clearSuggestions();
      statusEl.textContent = error instanceof Error ? error.message : "Search failed";
    }
  }, SEARCH_DEBOUNCE_MS);
});

document.addEventListener("click", (event) => {
  if (!form.contains(event.target)) {
    clearSuggestions();
  }
});

async function resolveWalletOrUsername(rawInput) {
  const input = rawInput.trim();
  const lowered = input.toLowerCase();
  if (!input) {
    throw new Error("Enter an Abstract username or wallet address.");
  }

  if (WALLET_REGEX.test(lowered)) {
    const profile = selectedProfile && selectedProfile.address === lowered ? selectedProfile : null;
    return { wallet: lowered, profile };
  }

  const response = await fetch(`/api/search?query=${encodeURIComponent(input)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Search API error");
  }

  const users = payload.users || [];
  if (!users.length) {
    throw new Error("No profile found for this username.");
  }

  const exactName = users.find((user) => (user.name || "").trim().toLowerCase() === lowered);
  const match = exactName || users[0];
  return {
    wallet: (match.address || "").toLowerCase(),
    profile: {
      name: match.name || "",
      address: (match.address || "").toLowerCase(),
      image: match.image || "",
      verification: match.verification || null,
    },
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const { wallet, profile } = await resolveWalletOrUsername(walletInput.value);
    if (profile?.name) {
      selectedProfile = profile;
    }
    await openWalletView(wallet, profile);
    walletInput.value = wallet;
    clearSuggestions();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

copyImageBtn.addEventListener("click", async () => {
  if (card.classList.contains("hidden")) return;

  setCopyButtonState("busy");
  try {
    await primeCopySound();
    await copyCardAsImage();
    await playCopySound();
    flashCopyFeedback();
    setCopyButtonState("done");
    if (copyButtonResetTimer) clearTimeout(copyButtonResetTimer);
    copyButtonResetTimer = setTimeout(() => {
      setCopyButtonState("idle");
    }, 1300);
  } catch {
    showShareStatus("Could not copy card image.");
    setCopyButtonState("idle");
  }
});

includeCurrentWeekCheckbox.addEventListener("change", async () => {
  includeCurrentWeekProjected = includeCurrentWeekCheckbox.checked;

  if (!currentWallet || card.classList.contains("hidden")) return;

  try {
    const profile = selectedProfile && selectedProfile.address === currentWallet ? selectedProfile : null;
    await openWalletView(currentWallet, profile, { includeCurrentWeekProjected });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

walletViewBtn.addEventListener("click", () => {
  setCurrentView("wallet");
});

globalViewBtn.addEventListener("click", async () => {
  setCurrentView("global");
  try {
    await loadGlobalStats(true);
  } catch (error) {
    showGlobalError(error instanceof Error ? error.message : "Global stats unavailable");
  }
});

leaderboardBody.addEventListener("click", async (event) => {
  const walletButton = event.target.closest(".leaderboard-wallet-btn");
  if (!walletButton) return;

  const wallet = (walletButton.dataset.wallet || "").toLowerCase();
  if (!WALLET_REGEX.test(wallet)) return;

  walletInput.value = wallet;
  clearSuggestions();

  try {
    await openWalletView(wallet);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

async function bootstrapFromQueryParam() {
  const url = new URL(window.location.href);
  const view = (url.searchParams.get("view") || "wallet").trim().toLowerCase();
  if (view === "global") {
    setCurrentView("global", { syncUrl: false });
    try {
      await loadGlobalStats();
    } catch (error) {
      showGlobalError(error instanceof Error ? error.message : "Global stats unavailable");
    }
    return;
  }

  setCurrentView("wallet", { syncUrl: false });
  const wallet = (url.searchParams.get("wallet") || "").trim().toLowerCase();
  if (!WALLET_REGEX.test(wallet)) {
    return;
  }

  walletInput.value = wallet;
  try {
    await openWalletView(wallet, null);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
}

async function initializePage() {
  includeCurrentWeekProjected = Boolean(includeCurrentWeekCheckbox.checked);
  await loadDecorGifOptions();
  applyRandomDecorGif();
  await bootstrapFromQueryParam();
}

initializePage();
