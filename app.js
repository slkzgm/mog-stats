const form = document.querySelector("#wallet-form");
const walletInput = document.querySelector("#wallet-input");
const statusEl = document.querySelector("#status");
const card = document.querySelector("#stats-card");
const suggestionsEl = document.querySelector("#suggestions");

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

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;
const WEI_IN_ETH = 10n ** 18n;
const SEARCH_DEBOUNCE_MS = 180;

let selectedProfile = null;
let lastSearchToken = 0;
let searchDebounceHandle = null;
let currentWallet = "";
let currentCardData = null;
let copyFlashTimer = null;
let copyButtonResetTimer = null;
let audioContext = null;

const withSign = (valueWei) => {
  if (valueWei > 0n) return `+${formatEth(valueWei)} ETH`;
  if (valueWei < 0n) return `${formatEth(valueWei)} ETH`;
  return "0 ETH";
};

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(valueWei, decimals = 6) {
  const negative = valueWei < 0n;
  const abs = negative ? -valueWei : valueWei;

  const integerPart = abs / WEI_IN_ETH;
  const fractionPart = abs % WEI_IN_ETH;

  const scaled = (fractionPart * 10n ** BigInt(decimals)) / WEI_IN_ETH;
  const fractionString = scaled.toString().padStart(decimals, "0").replace(/0+$/, "");

  const pretty = fractionString.length ? `${integerPart.toString()}.${fractionString}` : integerPart.toString();
  return `${negative ? "-" : ""}${pretty}`;
}

function showError(message) {
  statusEl.textContent = message;
  card.classList.add("hidden");
  currentCardData = null;
  showShareStatus("");
}

function showShareStatus(message) {
  shareStatus.textContent = message;
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  return audioContext;
}

function playCopySound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    const low = ctx.createOscillator();
    low.type = "triangle";
    low.frequency.setValueAtTime(620, now);
    low.frequency.exponentialRampToValueAtTime(790, now + 0.13);
    low.connect(gain);
    low.start(now);
    low.stop(now + 0.2);

    const high = ctx.createOscillator();
    high.type = "sine";
    high.frequency.setValueAtTime(980, now + 0.015);
    high.frequency.exponentialRampToValueAtTime(1360, now + 0.13);
    high.connect(gain);
    high.start(now + 0.015);
    high.stop(now + 0.2);
  } catch {
    // Sound is optional UX sugar.
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

function setWalletInUrl(wallet) {
  const url = new URL(window.location.href);
  url.search = "";
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

function showStats(stats, profile = null) {
  const keyPurchaseAmount = BigInt(stats.keyPurchaseAmount);
  const weeklyClaimAmount = BigInt(stats.weeklyClaimAmount);
  const jackpotClaimAmount = BigInt(stats.jackpotClaimAmount);

  const totalClaims = weeklyClaimAmount + jackpotClaimAmount;
  const net = totalClaims - keyPurchaseAmount;
  currentWallet = stats.wallet;

  setProfileIdentity(stats.wallet, profile);

  const keyPurchaseEth = formatEth(keyPurchaseAmount);
  const weeklyClaimEth = formatEth(weeklyClaimAmount);
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
  };
}

async function loadWalletStats(wallet, profile = null) {
  statusEl.textContent = "Loading...";
  card.classList.add("hidden");
  currentCardData = null;

  const response = await fetch("/api/player-stats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wallet }),
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
    effectiveProfile = await resolveProfileForWallet(wallet);
  }

  if (effectiveProfile) {
    selectedProfile = effectiveProfile;
  }

  showStats(payload.stats, effectiveProfile);
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
    await loadWalletStats(profile.address, profile);
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const wallet = walletInput.value.trim().toLowerCase();
  if (!WALLET_REGEX.test(wallet)) {
    showError("Invalid wallet format (expected: 0x + 40 hex chars).");
    return;
  }

  const profile = selectedProfile && selectedProfile.address === wallet ? selectedProfile : null;

  try {
    await loadWalletStats(wallet, profile);
    clearSuggestions();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

copyImageBtn.addEventListener("click", async () => {
  if (card.classList.contains("hidden")) return;

  setCopyButtonState("busy");
  try {
    await copyCardAsImage();
    playCopySound();
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

async function bootstrapFromQueryParam() {
  const url = new URL(window.location.href);
  const wallet = (url.searchParams.get("wallet") || "").trim().toLowerCase();
  if (!WALLET_REGEX.test(wallet)) {
    return;
  }

  walletInput.value = wallet;
  try {
    await loadWalletStats(wallet, null);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
}

bootstrapFromQueryParam();
