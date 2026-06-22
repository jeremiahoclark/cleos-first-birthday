import { composeProof, loadImage } from "/compose.js";
import { initScene } from "/scene.js";
import { getQuestToast } from "/quest-toasts.js";
import { wallPostCaption } from "/wallPosts.js";

const app = document.querySelector("#app");
const gameBg = document.querySelector("#game-bg");
const STORAGE_KEY = "cleoQuestState:v2";
const DEVICE_KEY = "cleoQuestDeviceId:v1";
const HOST_PIN_KEY = "cleoHostPin:v1";

const state = loadState();
let status = null;
let timerHandle = null;
let activeQuestSlot = 1;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!parsed.slotDrafts) parsed.slotDrafts = {};
    if (!parsed.sideQuestCaptures) parsed.sideQuestCaptures = [];
    return parsed;
  }
  return {
    user: null,
    board: null,
    startedAt: null,
    submissions: [],
    feedback: [],
    slotDrafts: {},
    sideQuestCaptures: []
  };
}

function getHostPin() {
  return sessionStorage.getItem(HOST_PIN_KEY) || "";
}

function setHostPin(pin) {
  if (pin) sessionStorage.setItem(HOST_PIN_KEY, pin);
  else sessionStorage.removeItem(HOST_PIN_KEY);
}

async function refreshConnectionCount() {
  try {
    const data = await api("/api/status");
    status = data;
    const count = data.connectionCount ?? 0;
    const meter = document.querySelector(".connection-meter strong");
    if (meter) meter.textContent = String(count);
    const meterWrap = document.querySelector(".connection-meter");
    if (meterWrap) meterWrap.hidden = count < 1;
    return count;
  } catch {
    return status?.connectionCount ?? 0;
  }
}

function connectionMeterMarkup(count) {
  if (!count) return "";
  return `
    <div class="connection-meter" aria-live="polite">
      <span class="connection-meter__icon" aria-hidden="true">🤝</span>
      <span><strong>${count}</strong> new connection${count === 1 ? "" : "s"} at this party</span>
    </div>
  `;
}

function showMeetSomeonePrompt() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "meet-overlay";
    overlay.innerHTML = `
      <div class="meet-card" role="dialog" aria-labelledby="meet-title">
        <p class="kicker">Quick check-in</p>
        <h3 class="title-quest" id="meet-title">Did you meet someone new?</h3>
        <p class="lead">Every yes adds to the party connection counter.</p>
        <div class="meet-actions">
          <button class="btn btn-primary btn-full" type="button" data-met="yes">Yes!</button>
          <button class="btn btn-secondary btn-full" type="button" data-met="no">Not this time</button>
          <button class="btn btn-ghost btn-full" type="button" data-met="skip">Skip</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    async function finish(metSomeoneNew) {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 220);
      if (metSomeoneNew) {
        try {
          const result = await api("/api/connections", {
            method: "POST",
            body: JSON.stringify({ metSomeoneNew: true, userId: state.user?.id })
          });
          if (status) status.connectionCount = result.connectionCount;
        } catch {
          /* counter is nice-to-have */
        }
      }
      resolve();
    }

    overlay.querySelector('[data-met="yes"]')?.addEventListener("click", () => finish(true));
    overlay.querySelector('[data-met="no"]')?.addEventListener("click", () => finish(false));
    overlay.querySelector('[data-met="skip"]')?.addEventListener("click", () => finish(false));
  });
}

async function celebrateQuestSubmit(quest) {
  const { message, dramatic } = getQuestToast(quest.id);
  showToast(message, dramatic);
  await showMeetSomeonePrompt();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function screenEnter() {
  app.classList.remove("screen-enter");
  void app.offsetWidth;
  app.classList.add("screen-enter");
}

function topbar() {
  const dry = status?.dryRun
    ? `<span class="pill pill--dry">Beta dry run</span>`
    : `<span class="pill pill--live">Live hunt</span>`;
  const score = state.user ? `<span class="pill pill--score">${completedCount()}/10</span>` : "";
  return `<div class="hud-bar">${dry}${score}</div>`;
}

function completedCount() {
  return new Set(state.submissions.map((submission) => Number(submission.questSlot))).size;
}

function showToast(message, dramatic = false) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  if (dramatic) {
    app.classList.add("shake");
    burstConfetti();
    setTimeout(() => app.classList.remove("shake"), 520);
  }
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function burstConfetti() {
  const colors = ["#ff8fab", "#b8a9ff", "#ffc857", "#7ed4b8", "#c9b8ff"];
  for (let i = 0; i < 26; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 120}ms`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1200);
  }
}

function renderJoin() {
  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack join-hero">
      <div class="join-badge">Treasure hunt · 60 minutes</div>
      <p class="kicker">Cleo's First Birthday</p>
      <h1 class="title-display">Bubble Quest</h1>
      <p class="lead">10 photo quests around the party — meet people and help us stack memories for Cleo.</p>
      <form id="join-form" class="stack" style="text-align:left;margin-top:6px">
        <label class="field">
          <span>Your real name</span>
          <input class="input" name="realName" autocomplete="name" placeholder="Jeremiah Clark" required>
        </label>
        <label class="field">
          <span>Party nickname</span>
          <input class="input" name="gameName" autocomplete="nickname" placeholder="Uncle J" required>
        </label>
        <button class="btn btn-primary btn-full" type="submit">Start the hunt</button>
      </form>
      <div class="hud-footer">
        <button class="link-btn" type="button" data-view-wall>🪩 Party wall</button>
        <button class="link-btn" type="button" data-view-leaderboard>🏆 Leaderboard</button>
      </div>
      <p class="muted">No login — this phone remembers you.${status?.dryRun ? " Dry mode: nothing hits Cloudflare." : ""}</p>
    </section>
  `;
  screenEnter();

  document.querySelector("#join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      realName: form.get("realName"),
      gameName: form.get("gameName"),
      deviceId: getDeviceId()
    };
    const result = await api("/api/register", { method: "POST", body: JSON.stringify(payload) });
    state.user = result.user;
    state.board = result.board;
    state.startedAt = state.startedAt || Date.now();
    saveState();
    showToast(`Let's go, ${result.user.gameName}!`, true);
    renderGame();
  });
  document.querySelector("[data-view-wall]")?.addEventListener("click", () => go("party-wall"));
  document.querySelector("[data-view-leaderboard]")?.addEventListener("click", () => go("leaderboard"));
}

function gameStartedAt() {
  const at = status?.game?.startedAt;
  return at ? Date.parse(at.endsWith("Z") || at.includes("T") ? at : `${at.replace(" ", "T")}Z`) : null;
}
function gameStarted() {
  return !!status?.game?.started;
}

function timeRemaining() {
  const duration = status?.event?.durationSeconds || 3600;
  const at = gameStartedAt();
  if (!at) return duration;
  const elapsed = Math.floor((Date.now() - at) / 1000);
  return Math.max(0, duration - elapsed);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

const FINAL_PUSH_SECONDS = 300; // last 5 minutes = urgency mode

function timerMarkup() {
  const remaining = timeRemaining();
  const duration = status?.event?.durationSeconds || 3600;
  const progress = (duration - remaining) / duration;
  const circumference = 2 * Math.PI * 30;
  const offset = circumference * (1 - progress);
  return `
    <section class="hunt-header" data-timer-card>
      <div>
        <p class="kicker">Playing as</p>
        <span class="team-name">${escapeHtml(state.user.gameName)}</span>
      </div>
      <div class="timer-ring" aria-label="Time remaining">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <defs>
            <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ff8fab"/>
              <stop offset="100%" stop-color="#b8a9ff"/>
            </linearGradient>
          </defs>
          <circle class="track" cx="36" cy="36" r="30"/>
          <circle class="fill" cx="36" cy="36" r="30"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            data-progress-ring/>
        </svg>
        <span class="timer-value" data-timer>${formatTime(remaining)}</span>
      </div>
      <div class="urgency-banner" data-urgency hidden></div>
      ${connectionMeterMarkup(status?.connectionCount ?? 0)}
    </section>
  `;
}

// Slots 1-10 that still have no submission, as a friendly "Quest N" list.
function unsubmittedSlots() {
  const done = new Set(state.submissions.map((s) => Number(s.questSlot)));
  return (state.board?.quests || []).filter((q) => !done.has(Number(q.slot)));
}

function isComplete(slot) {
  return state.submissions.some((submission) => Number(submission.questSlot) === Number(slot));
}

function nextOpenQuestSlot(quests) {
  return quests.find((quest) => !isComplete(quest.slot))?.slot || quests[0]?.slot || 1;
}

function progressNav(quests) {
  return `
    <div class="treasure-trail" aria-label="Treasure trail — 10 quests">
      ${quests
        .map((quest) => {
          const locked = !slotUnlocked(quest.slot);
          const label = isComplete(quest.slot)
            ? `Treasure ${quest.slot} found`
            : locked
              ? `Treasure ${quest.slot} locked`
              : `Treasure ${quest.slot}`;
          return `
            <button
              class="trail-node ${quest.slot === activeQuestSlot ? "active" : ""} ${isComplete(quest.slot) ? "done" : ""} ${locked ? "locked" : ""}"
              type="button"
              ${locked ? "disabled" : `data-jump-slot="${quest.slot}"`}
              aria-label="${label}"
              ${locked ? `title="${quest.slot === 10 ? "Opens after stage 3" : `Opens in ${formatClock(slotUnlockCountdown(quest.slot))}`}"` : ""}
            >${isComplete(quest.slot) ? "" : quest.slot}</button>
          `;
        })
        .join("")}
    </div>
  `;
}

function activeQuestView(quest, quests) {
  const complete = isComplete(quest.slot);
  const labeledSlots = hasLabeledSlots(quest);
  const requirements =
    !labeledSlots && quest.requiredFields.length
      ? `<div class="loot-list">${quest.requiredFields.map((field) => `<div class="loot-item">${escapeHtml(field)}</div>`).join("")}</div>`
      : "";
  const previous = quest.slot > 1 ? quest.slot - 1 : quests.length;
  const next = quest.slot < quests.length ? quest.slot + 1 : 1;
  return `
    <section class="panel quest-card quest-pop ${complete ? "complete" : ""}" id="quest-${quest.slot}">
      <div class="quest-meta">
        <span>Treasure ${quest.slot} / ${quests.length}</span>
        <span class="stage-tag">${escapeHtml(quest.stageName)}</span>
      </div>
      <h2 class="title-quest">${escapeHtml(quest.title)}</h2>
      <p class="quest-prompt">${escapeHtml(quest.prompt)}</p>
      ${requirements}
      <div class="quest-actions">
        ${
          complete
            ? `
            <div class="complete-badge">
              <strong>Treasure secured!</strong>
              <span>Logged for you. Keep hunting.</span>
            </div>
            <button class="btn btn-primary btn-full" data-next-open>Next treasure</button>
          `
            : labeledSlots
              ? labeledSlotsInlineMarkup(quest)
              : `<button class="btn btn-primary btn-capture btn-full" data-open-camera="${quest.slot}">${quest.mediaType === "video" ? "Record video" : "Capture proof"}</button>`
        }
        <div class="quest-nav ${labeledSlots && !complete ? "quest-nav--single" : ""}">
          <button class="btn btn-ghost" type="button" data-jump-slot="${previous}">← Prev</button>
          ${
            labeledSlots && !complete
              ? `<span class="quest-nav-hint">Tap each camera to capture</span>`
              : `<button class="btn btn-secondary" type="button" data-jump-slot="${next}">Next →</button>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderGame() {
  stopCamera();
  clearInterval(timerHandle);
  const quests = state.board.quests || status.quests;
  const current = quests.find((quest) => Number(quest.slot) === Number(activeQuestSlot));
  if (!current || isComplete(current.slot) || !slotUnlocked(current.slot)) {
    activeQuestSlot = nextUnlockedOpenSlot(quests);
  }
  const activeQuest = quests.find((quest) => Number(quest.slot) === Number(activeQuestSlot)) || quests[0];
  app.innerHTML = `
    ${topbar()}
    ${timerMarkup()}
    ${progressNav(quests)}
    ${unlockBannerMarkup()}
    ${activeQuestView(activeQuest, quests)}
    ${feedbackMarkup()}
    <div class="hud-footer">
      <button class="link-btn" data-view-wall>🪩 Wall</button>
      <button class="link-btn" data-view-leaderboard>🏆 Scores</button>
      <button class="link-btn link-btn--host" data-view-admin>Host view</button>
      <button class="link-btn" data-reset>Reset phone</button>
    </div>
  `;
  screenEnter();
  bindGameEvents();
  timerHandle = setInterval(updateTimer, 1000);
}

let announcedFinalPush = false;

function updateTimer() {
  const timer = document.querySelector("[data-timer]");
  const ring = document.querySelector("[data-progress-ring]");
  if (!timer || !ring) return;
  const remaining = timeRemaining();
  const duration = status?.event?.durationSeconds || 3600;
  const progress = (duration - remaining) / duration;
  const circumference = 2 * Math.PI * 30;
  timer.textContent = formatTime(remaining);
  ring.setAttribute("stroke-dashoffset", String(circumference * (1 - progress)));

  // Stage reveal moments: celebrate exactly when a new tier unlocks.
  const _su = stageUnlocksMap();
  const _e = elapsedSeconds();
  if (_e >= _su[2] && !announcedReveals[2]) { announcedReveals[2] = true; revealStage(2); }
  if (_e >= _su[3] && !announcedReveals[3]) { announcedReveals[3] = true; revealStage(3); }

  if (remaining <= 0) {
    clearInterval(timerHandle);
    renderEnd();
    return;
  }

  // Final 5 minutes: urgency mode. Pulse the timer card and surface the
  // quests that still have no submission so guests can scramble.
  const card = document.querySelector("[data-timer-card]");
  const banner = document.querySelector("[data-urgency]");
  if (!card || !banner) return;
  if (remaining <= FINAL_PUSH_SECONDS) {
    card.classList.add("final-push");
    const left = unsubmittedSlots();
    banner.hidden = false;
    banner.innerHTML = left.length
      ? `<strong>Final ${Math.ceil(remaining / 60)} min.</strong> Still open: ${left
          .map((q) => `Quest ${q.slot}`)
          .join(" · ")}`
      : `<strong>Final push.</strong> All 10 quests submitted — incredible.`;
    if (!announcedFinalPush) {
      announcedFinalPush = true;
      showToast("Final 5 minutes! Lock in any last quests.", true);
    }
  } else {
    card.classList.remove("final-push");
    banner.hidden = true;
  }
}

function bindGameEvents() {
  document.querySelectorAll("[data-open-camera]").forEach((button) => {
    button.addEventListener("click", () => renderCamera(Number(button.dataset.openCamera)));
  });
  document.querySelectorAll("[data-jump-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      activeQuestSlot = Number(button.dataset.jumpSlot);
      renderGame();
    });
  });
  document.querySelector("[data-next-open]")?.addEventListener("click", () => {
    activeQuestSlot = nextUnlockedOpenSlot(state.board.quests || status.quests);
    renderGame();
  });
  document.querySelector("[data-view-wall]")?.addEventListener("click", () => go("party-wall"));
  document.querySelector("[data-view-leaderboard]")?.addEventListener("click", () => go("leaderboard"));
  document.querySelector("[data-view-admin]")?.addEventListener("click", renderAdmin);
  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, loadState());
    renderJoin();
  });
  bindFeedback();
  const activeQuest = state.board?.quests?.find((quest) => Number(quest.slot) === Number(activeQuestSlot));
  if (activeQuest && hasLabeledSlots(activeQuest) && !isComplete(activeQuest.slot)) {
    bindInlineLabeledSlots(activeQuest);
  }
  refreshConnectionCount();
}

let cameraStream = null;
let cameraFacingMode = "user";

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

async function startCameraFeed(feed, facingMode = cameraFacingMode) {
  stopCamera();
  cameraFacingMode = facingMode;
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: cameraFacingMode } },
    audio: false
  });
  feed.srcObject = cameraStream;
  return cameraStream;
}

async function flipCameraFeed(feed) {
  const next = cameraFacingMode === "user" ? "environment" : "user";
  await startCameraFeed(feed, next);
}

function captureFrameFromFeed(feed) {
  const canvas = document.createElement("canvas");
  canvas.width = feed.videoWidth || 1080;
  canvas.height = feed.videoHeight || 1440;
  canvas.getContext("2d").drawImage(feed, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function setCameraLiveUi({ feed, frame, camBtn, flipBtn, live }) {
  if (live) {
    feed.hidden = false;
    frame.classList.add("capture-frame--live");
    camBtn.classList.add("cam-big--live");
    camBtn.innerHTML = "";
    camBtn.setAttribute("aria-label", "Take photo");
    flipBtn?.removeAttribute("hidden");
  } else {
    feed.hidden = true;
    frame.classList.remove("capture-frame--live");
    camBtn.classList.remove("cam-big--live");
    camBtn.innerHTML = CAMERA_ICON;
    camBtn.setAttribute("aria-label", "Open camera");
    flipBtn?.setAttribute("hidden", "");
  }
}

const CAMERA_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const FLIP_CAMERA_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h6l2-3h2l2 3h6v12H3V7z"/><path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M16 11h4M18 9v4"/></svg>`;

function compactField(label, name, placeholder = "", required = true) {
  return `
    <label class="field-compact">
      <span class="field-ask">${escapeHtml(label)}</span>
      <input class="input-compact" name="${name}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""}>
    </label>
  `;
}

function hasLabeledSlots(quest) {
  return Array.isArray(quest.photoSlots) && quest.photoSlots.length > 0;
}

function getSlotDraft(questSlot, length) {
  const key = String(questSlot);
  if (!state.slotDrafts) state.slotDrafts = {};
  if (!state.slotDrafts[key] || state.slotDrafts[key].length !== length) {
    state.slotDrafts[key] = Array(length).fill(null);
  }
  return state.slotDrafts[key];
}

function labeledSlotsInlineMarkup(quest) {
  const draft = getSlotDraft(quest.slot, quest.photoSlots.length);
  const allFilled = draft.every(Boolean);
  return `
    <div class="labeled-slots labeled-slots--inline" data-labeled-quest="${quest.slot}">
      ${quest.photoSlots
        .map((label, index) => {
          const filled = draft[index];
          return `
            <div class="labeled-slot ${filled ? "filled" : ""}" data-slot="${index}">
              ${
                filled
                  ? `
                <div class="slot-thumb slot-thumb--filled" aria-label="${escapeHtml(label)}">
                  <img src="${filled}" alt="">
                  <button type="button" class="slot-clear" data-clear-slot="${index}" aria-label="Remove photo">×</button>
                </div>
              `
                  : `
                <button type="button" class="slot-thumb slot-thumb--camera" data-slot-cam="${index}" aria-label="Capture ${escapeHtml(label)}">
                  <span class="slot-cam-icon">${CAMERA_ICON}</span>
                </button>
              `
              }
              <span class="slot-label">${escapeHtml(label)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
    <button class="btn btn-primary btn-full" type="button" data-submit-labeled="${quest.slot}" ${allFilled ? "" : "disabled"}>
      Submit all
    </button>
  `;
}

function openLabeledSlotCamera(quest, slotIndex, onCapture) {
  const label = quest.photoSlots[slotIndex];
  stopCamera();
  const overlay = document.createElement("div");
  overlay.className = "pw-modal slot-cam-modal";
  overlay.innerHTML = `
    <div class="pw-modal__card slot-cam-card" role="dialog" aria-label="Capture ${escapeHtml(label)}">
      <button class="pw-modal__close" type="button" data-slot-cam-close aria-label="Close">×</button>
      <p class="kicker">Field capture</p>
      <h3 class="title-quest slot-cam-title">${escapeHtml(label)}</h3>
      <div class="capture-frame capture-frame--live slot-cam-frame" data-capture-frame>
        <video class="cam-feed" data-feed playsinline autoplay muted></video>
        <button type="button" class="cam-flip" data-cam-flip aria-label="Switch camera">${FLIP_CAMERA_ICON}</button>
        <button type="button" class="cam-big cam-big--live" data-slot-snap aria-label="Take photo"></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const feed = overlay.querySelector("[data-feed]");
  const close = () => {
    stopCamera();
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.querySelector("[data-slot-cam-close]").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelector("[data-cam-flip]")?.addEventListener("click", async () => {
    try {
      await flipCameraFeed(feed);
    } catch {
      showToast("Couldn't switch camera.");
    }
  });

  overlay.querySelector("[data-slot-snap]")?.addEventListener("click", () => {
    onCapture(captureFrameFromFeed(feed));
    close();
  });

  startCameraFeed(feed, "user").catch(() => {
    showToast("Camera unavailable.");
    close();
  });
}

function bindInlineLabeledSlots(quest) {
  const draft = getSlotDraft(quest.slot, quest.photoSlots.length);

  document.querySelectorAll("[data-slot-cam]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.slotCam);
      openLabeledSlotCamera(quest, index, (dataUrl) => {
        draft[index] = dataUrl;
        saveState();
        renderGame();
      });
    });
  });

  document.querySelectorAll("[data-clear-slot]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      draft[Number(button.dataset.clearSlot)] = null;
      saveState();
      renderGame();
    });
  });

  document.querySelector(`[data-submit-labeled="${quest.slot}"]`)?.addEventListener("click", () => {
    submitLabeledQuest(quest);
  });
}

async function submitLabeledQuest(quest) {
  const shots = getSlotDraft(quest.slot, quest.photoSlots.length);
  if (!shots.every(Boolean)) {
    showToast("Add a photo for every slot.");
    return;
  }

  const images = await Promise.all(shots.map(loadImage));
  const composed = composeProof({
    mode: "collage",
    images,
    caption: "",
    title: quest.title,
    reference: quest.prompt
  });

  const requiredFields = {};
  quest.photoSlots.forEach((label) => {
    requiredFields[label] = label;
  });

  const slotImages = await Promise.all(shots.map((shot) => uploadableDataUrl(shot)));
  const mediaDataUrl = await uploadableDataUrl(composed.dataUrl);

  const payload = {
    userId: state.user.id,
    boardId: state.board.id,
    questSlot: quest.slot,
    questId: quest.id,
    caption: "",
    requiredFields,
    compositionMode: "collage",
    mediaName: `${quest.id}.jpg`,
    mediaDataUrl,
    slotImages,
    slotLabels: quest.photoSlots
  };

  const result = await api("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
  delete state.slotDrafts[String(quest.slot)];
  state.submissions = state.submissions.filter((submission) => Number(submission.questSlot) !== Number(quest.slot));
  const { mediaDataUrl: _omit, slotImages: _slots, ...lean } = result.submission;
  state.submissions.push(lean);
  activeQuestSlot = nextUnlockedOpenSlot(state.board.quests || status.quests);
  saveState();
  await celebrateQuestSubmit(quest);
  maybeRevealFinal();
  renderGame();
}

function renderCamera(slot) {
  const quest = state.board.quests.find((item) => Number(item.slot) === Number(slot));
  const isVideoQuest = quest.mediaType === "video";
  const allowMultiple = quest.composition === "collage";
  const shots = [];
  let composed = null;
  let videoDataUrl = "";

  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack capture-screen">
      <button class="btn btn-ghost" type="button" data-back>← Back</button>
      <p class="kicker">Treasure ${quest.slot}</p>
      <h2 class="title-quest">${escapeHtml(quest.title)}</h2>
      <p class="lead">${escapeHtml(quest.prompt)}</p>

      <form id="submission-form" class="stack">
        ${
          isVideoQuest
            ? `
          <div class="capture-hero">
            <div class="capture-frame">
              <button type="button" class="cam-big" data-video-cam aria-label="Record video">${CAMERA_ICON}</button>
              <video class="preview show" data-video-preview controls playsinline hidden></video>
            </div>
            <label class="upload-plus" aria-label="Upload video">
              <input type="file" name="media" accept="video/*">
              <span>+</span>
            </label>
            <input type="file" data-video-capture accept="video/*" capture="user" hidden>
          </div>
        `
            : `
          <div class="capture-hero">
            <div class="capture-frame" data-capture-frame>
              <video class="cam-feed" data-feed playsinline autoplay muted hidden></video>
              <button type="button" class="cam-flip" data-cam-flip hidden aria-label="Switch camera">${FLIP_CAMERA_ICON}</button>
              <button type="button" class="cam-big" data-cam-btn aria-label="Open camera">${CAMERA_ICON}</button>
            </div>
            <label class="upload-plus" aria-label="Upload photo">
              <input type="file" name="upload" accept="image/*" ${allowMultiple ? "multiple" : ""}>
              <span>+</span>
            </label>
            <div class="thumb-row" data-thumbs></div>
          </div>
          <select name="compositionMode" hidden aria-hidden="true">
            <option value="${quest.composition}" selected>${escapeHtml(layoutLabel(quest.composition))}</option>
          </select>
          <img data-composed alt="" hidden>
        `
        }

        <div class="capture-fields">
          ${compactField("Caption", "caption", "Who's in this?")}
          ${quest.requiredFields.map((field, index) => compactField(field, `required-${index}`)).join("")}
        </div>

        <button class="btn btn-primary btn-full" type="submit" data-submit ${isVideoQuest ? "disabled" : "disabled"}>Lock in treasure</button>
      </form>
    </section>
  `;
  screenEnter();

  const back = () => {
    stopCamera();
    renderGame();
  };
  document.querySelector("[data-back]").addEventListener("click", back);

  const submitBtn = document.querySelector("[data-submit]");
  const compositionSelect = document.querySelector("[name='compositionMode']");
  const captionEl = document.querySelector("[name='caption']");

  async function rebuildPreview() {
    if (isVideoQuest) return;
    if (!shots.length) {
      composed = null;
      submitBtn.disabled = true;
      return;
    }
    const images = await Promise.all(shots.map(loadImage));
    composed = composeProof({
      mode: compositionSelect?.value || quest.composition,
      images,
      caption: captionEl.value,
      title: quest.title,
      reference: quest.prompt
    });
    submitBtn.disabled = false;
  }

  function addShot(dataUrl) {
    if (!allowMultiple) shots.length = 0;
    shots.push(dataUrl);
    renderThumbs();
    rebuildPreview();
  }

  function renderThumbs() {
    const row = document.querySelector("[data-thumbs]");
    if (!row) return;
    row.innerHTML = shots
      .map(
        (src, i) =>
          `<div class="thumb"><img src="${src}" alt="shot ${i + 1}"><button type="button" data-remove="${i}">×</button></div>`
      )
      .join("");
    row.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        shots.splice(Number(btn.dataset.remove), 1);
        renderThumbs();
        rebuildPreview();
      });
    });
  }

  if (isVideoQuest) {
    const fileInput = document.querySelector("[name='media']");
    const captureInput = document.querySelector("[data-video-capture]");
    const videoPreview = document.querySelector("[data-video-preview]");
    const videoCam = document.querySelector("[data-video-cam]");

    async function onVideoFile(file) {
      if (!file) return;
      videoPreview.src = URL.createObjectURL(file);
      videoPreview.hidden = false;
      videoDataUrl = file.size < 4_000_000 ? await fileToDataUrl(file) : "";
      submitBtn.disabled = false;
    }

    videoCam.addEventListener("click", () => captureInput.click());
    captureInput.addEventListener("change", async () => onVideoFile(captureInput.files?.[0]));
    fileInput.addEventListener("change", async () => onVideoFile(fileInput.files?.[0]));
  } else {
    captionEl.addEventListener("input", rebuildPreview);

    const uploadInput = document.querySelector("[name='upload']");
    uploadInput.addEventListener("change", async () => {
      for (const file of [...(uploadInput.files || [])]) {
        if (file.type.startsWith("image/")) addShot(await fileToDataUrl(file));
      }
    });

    const feed = document.querySelector("[data-feed]");
    const frame = document.querySelector("[data-capture-frame]");
    const camBtn = document.querySelector("[data-cam-btn]");
    const flipBtn = document.querySelector("[data-cam-flip]");

    flipBtn?.addEventListener("click", async () => {
      if (!cameraStream) return;
      try {
        await flipCameraFeed(feed);
      } catch {
        showToast("Couldn't switch camera.");
      }
    });

    camBtn.addEventListener("click", async () => {
      if (cameraStream) {
        addShot(captureFrameFromFeed(feed));
        stopCamera();
        setCameraLiveUi({ feed, frame, camBtn, flipBtn, live: false });
        camBtn.setAttribute("aria-label", "Retake photo");
        return;
      }

      try {
        await startCameraFeed(feed, "user");
        setCameraLiveUi({ feed, frame, camBtn, flipBtn, live: true });
      } catch {
        showToast("Camera unavailable — tap + to upload.");
      }
    });
  }

  document.querySelector("#submission-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requiredFields = {};
    quest.requiredFields.forEach((field, index) => {
      requiredFields[field] = form.get(`required-${index}`);
    });

    let mediaDataUrl = "";
    let compositionMode = "plain";
    if (isVideoQuest) {
      mediaDataUrl = videoDataUrl;
    } else {
      if (!composed) {
        showToast("Capture or upload a photo first.");
        return;
      }
      // keep the data URL small enough for a demo payload
      mediaDataUrl = await uploadableDataUrl(composed.dataUrl);
      compositionMode = compositionSelect?.value || quest.composition;
    }

    const payload = {
      userId: state.user.id,
      boardId: state.board.id,
      questSlot: quest.slot,
      questId: quest.id,
      caption: form.get("caption"),
      requiredFields,
      compositionMode,
      mediaName: isVideoQuest ? "video" : `${quest.id}.jpg`,
      mediaDataUrl
    };
    const result = await api("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
    stopCamera();
    state.submissions = state.submissions.filter((submission) => Number(submission.questSlot) !== Number(quest.slot));
    // Persist metadata only — composed data URLs are too large for localStorage.
    const { mediaDataUrl: _omit, ...lean } = result.submission;
    state.submissions.push(lean);
    activeQuestSlot = nextUnlockedOpenSlot(state.board.quests || status.quests);
    saveState();
    await celebrateQuestSubmit(quest);
    maybeRevealFinal();
    renderGame();
  });
}

function layoutLabel(mode) {
  return (
    {
      caption: "Caption at bottom",
      "side-by-side": "Side-by-side reference",
      collage: "Collage / set",
      plain: "Plain proof"
    }[mode] || mode
  );
}

async function compressDataUrl(dataUrl, maxBytes = 1_300_000) {
  if (!dataUrl || dataUrl.length <= maxBytes) return dataUrl;
  const img = await loadImage(dataUrl);
  let width = img.width;
  let height = img.height;
  const maxDim = 1600;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  for (let quality = 0.85; quality >= 0.45; quality -= 0.1) {
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= maxBytes) return out;
  }
  return canvas.toDataURL("image/jpeg", 0.45);
}

async function uploadableDataUrl(dataUrl) {
  const compressed = await compressDataUrl(dataUrl);
  return compressed.length < 1_400_000 ? compressed : "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function feedbackMarkup() {
  const localFeedback = state.feedback
    .map((item) => `<div class="mini-card"><strong>${escapeHtml(item.category)}</strong><p>${escapeHtml(item.message)}</p></div>`)
    .join("");
  return `
    <details class="feedback-drawer">
      <summary>Beta notes (${state.feedback.length})</summary>
      <div class="feedback-body">
        <form id="feedback-form" class="stack">
          <select class="select" name="category">
            <option value="Prompt idea">Prompt idea</option>
            <option value="UI feedback">UI feedback</option>
            <option value="Bug">Bug</option>
            <option value="Party idea">Party idea</option>
          </select>
          <textarea class="textarea" name="message" placeholder="Quick note for the host…" required></textarea>
          <button class="btn btn-secondary btn-full" type="submit">Send note</button>
        </form>
        ${localFeedback ? `<div class="stack">${localFeedback}</div>` : ""}
      </div>
    </details>
  `;
}

function bindFeedback() {
  document.querySelector("#feedback-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      userId: state.user?.id,
      category: form.get("category"),
      message: form.get("message")
    };
    const result = await api("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
    state.feedback.unshift(result.feedback);
    saveState();
    showToast("Feedback captured for this beta session.");
    renderGame();
  });
}

function renderEnd() {
  stopCamera();
  clearInterval(timerHandle);
  const score = completedCount();
  const headline =
    score === 10
      ? "A perfect run."
      : score >= 7
        ? "Huge round."
        : score >= 4
          ? "Solid hustle."
          : "Every quest counts.";
  // Subjective awards are celebratory only — they never change the score (per plan).
  const awards = [
    { emoji: "📸", title: "Best Photo", note: "Host picks at the party" },
    { emoji: "🤝", title: "Best New Friendship", note: "Host picks at the party" },
    { emoji: "💌", title: "Sweetest Message", note: "Host picks at the party" },
    { emoji: "🎉", title: "Most Chaotic Group Shot", note: "Host picks at the party" }
  ];
  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack end-screen">
      <p class="kicker">Time's up · ${escapeHtml(state.user.gameName)}</p>
      <h1 class="title-display">${headline}</h1>
      <div class="final-score" aria-label="Final score">
        <span class="final-score-num">${score}</span><span class="final-score-den">/ 10</span>
      </div>
      <p class="lead">Treasures you found. Host confirms highlights.</p>
      <div class="award-grid">
        ${awards
          .map(
            (a) => `<div class="award-card"><span class="award-emoji">${a.emoji}</span><strong>${escapeHtml(
              a.title
            )}</strong><span class="muted">${escapeHtml(a.note)}</span></div>`
          )
          .join("")}
      </div>
      <button class="btn btn-primary btn-full" data-view-admin>Host scoreboard</button>
      <button class="btn btn-ghost btn-full" data-replay>Back to map</button>
    </section>
  `;
  screenEnter();
  burstConfetti();
  setTimeout(burstConfetti, 350);
  document.querySelector("[data-view-admin]").addEventListener("click", renderAdmin);
  document.querySelector("[data-replay]").addEventListener("click", renderGame);
}

async function renderAdmin() {
  const hostPin = getHostPin();
  if (!hostPin) {
    app.innerHTML = `
      ${topbar()}
      <section class="panel panel-pad stack">
        <button class="btn btn-ghost" type="button" data-back>← Back</button>
        <p class="kicker">Host view</p>
        <h2 class="title-quest">Host unlock</h2>
        <p class="lead">Enter the host pin to start the hunt, see guests, and capture the cake moment.</p>
        <form id="host-pin-form" class="stack">
          <label class="field">
            <span>Host pin</span>
            <input class="input" name="hostPin" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" required>
          </label>
          <button class="btn btn-primary btn-full" type="submit">Unlock host tools</button>
        </form>
      </section>
    `;
    screenEnter();
    document.querySelector("[data-back]")?.addEventListener("click", renderGame);
    document.querySelector("#host-pin-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pin = new FormData(event.currentTarget).get("hostPin");
      setHostPin(String(pin));
      renderAdmin();
    });
    return;
  }

  await refreshStatus();

  let admin = { dryRun: true, guests: [], submissions: [] };
  let sideQuests = [];
  try {
    [admin, { sideQuests }] = await Promise.all([api("/api/admin"), api("/api/host/side-quests")]);
  } catch {
    /* host tools still work locally in dry mode */
  }

  const guests = admin.guests || [];
  const started = gameStarted();
  const connectionCount = status?.connectionCount ?? 0;
  const localSide = (state.sideQuestCaptures || [])
    .map(
      (item) =>
        `<div class="mini-card"><strong>${escapeHtml(item.caption || item.questId)}</strong><p class="muted">${escapeHtml(item.createdAt || "")}</p></div>`
    )
    .join("");

  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack host-panel">
      <button class="btn btn-ghost" type="button" data-back>← Back</button>
      <p class="kicker">Host view</p>
      <h2 class="title-quest">Party HQ</h2>
      <p class="lead">${hostStatusLead(admin, guests.length)}</p>

      ${admin.dryRun ? `<p class="pill pill--dry host-pill">Dry mode — writes blocked on worker</p>` : ""}

      ${connectionMeterMarkup(connectionCount)}

      ${
        started
          ? `<div class="host-live-banner"><span class="pw-live-dot" aria-hidden="true"></span><span>Hunt is live · ${formatClock(timeRemaining())} left</span></div>`
          : `<button class="btn btn-start-hunt" type="button" data-host-start>Start the hunt</button>`
      }

      <div class="host-section">
        <h3 class="host-section__title">Guests</h3>
        ${hostGuestListMarkup(guests, admin.dryRun)}
      </div>

      <div class="host-section">
        <h3 class="host-section__title">Cake moment</h3>
        <p class="muted">Host-only capture — saved to the archive, not scored.</p>
        <div class="side-quest-grid">
          ${(sideQuests || [])
            .map(
              (quest) => `
                <button class="side-quest-btn side-quest-btn--solo" type="button" data-side-quest="${escapeHtml(quest.id)}">
                  <strong>${escapeHtml(quest.title)}</strong>
                  <span>${escapeHtml(quest.prompt)}</span>
                </button>
              `
            )
            .join("")}
        </div>
      </div>

      ${localSide ? `<div class="stack"><p class="kicker">Your side captures</p>${localSide}</div>` : ""}

      <button class="btn btn-ghost btn-full" type="button" data-host-lock>Lock host tools</button>
    </section>
  `;
  screenEnter();
  document.querySelector("[data-back]")?.addEventListener("click", renderGame);
  document.querySelector("[data-host-lock]")?.addEventListener("click", () => {
    setHostPin("");
    renderAdmin();
  });
  document.querySelector("[data-host-start]")?.addEventListener("click", async () => {
    try {
      const result = await api("/api/host/start", {
        method: "POST",
        body: JSON.stringify({ hostPin: getHostPin() })
      });
      status = { ...status, game: result.game };
      showToast("Hunt started — guests can play!", true);
      renderAdmin();
    } catch (error) {
      showToast(error.message || "Could not start the hunt.");
    }
  });
  document.querySelectorAll("[data-side-quest]").forEach((button) => {
    button.addEventListener("click", () => renderHostSideQuest(button.dataset.sideQuest, sideQuests));
  });
}

function hostStatusLead(admin, guestCount) {
  if (admin.dryRun) {
    return "Practice mode. Guest list and submissions appear once the worker runs live (DRY_RUN and BETA_MODE both false).";
  }
  if (!guestCount) return "No guests joined yet — share the link, then hit Start when you're ready.";
  return `${guestCount} guest${guestCount === 1 ? "" : "s"} on the board.`;
}

function hostGuestListMarkup(guests, dryRun) {
  if (dryRun) {
    return `<p class="muted host-guest-empty">Guest names show up here in the live worker after people register.</p>`;
  }
  if (!guests.length) {
    return `<p class="muted host-guest-empty">Waiting for the first guest to join…</p>`;
  }
  return `
    <div class="host-guest-list">
      ${guests
        .map(
          (guest) => `
            <div class="host-guest-row">
              <span class="host-guest-name">${escapeHtml(guest.game_name || guest.real_name || "Guest")}</span>
              <span class="host-guest-score">${Number(guest.score || 0)}/10</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderHostSideQuest(sideQuestId, sideQuests) {
  const quest = sideQuests.find((item) => item.id === sideQuestId);
  if (!quest) return;

  let shot = null;
  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack capture-screen">
      <button class="btn btn-ghost" type="button" data-back>← Host HQ</button>
      <p class="kicker">Host side quest</p>
      <h2 class="title-quest">${escapeHtml(quest.title)}</h2>
      <p class="lead">${escapeHtml(quest.prompt)}</p>
      <div class="capture-hero">
        <div class="capture-frame" data-capture-frame>
          <video class="cam-feed" data-feed playsinline autoplay muted hidden></video>
          <button type="button" class="cam-flip" data-cam-flip hidden aria-label="Switch camera">${FLIP_CAMERA_ICON}</button>
          <button type="button" class="cam-big" data-cam-btn aria-label="Open camera">${CAMERA_ICON}</button>
        </div>
        <label class="upload-plus" aria-label="Upload photo">
          <input type="file" data-host-upload accept="image/*">
          <span>+</span>
        </label>
      </div>
      <label class="field">
        <span>Caption (optional)</span>
        <input class="input" name="caption" placeholder="${escapeHtml(quest.title)}">
      </label>
      <button class="btn btn-primary btn-full" type="button" data-host-submit disabled>Save side quest</button>
    </section>
  `;
  screenEnter();

  const submitBtn = document.querySelector("[data-host-submit]");
  const captionEl = document.querySelector("[name='caption']");
  const feed = document.querySelector("[data-feed]");
  const frame = document.querySelector("[data-capture-frame]");
  const camBtn = document.querySelector("[data-cam-btn]");
  const flipBtn = document.querySelector("[data-cam-flip]");

  function enableSubmit() {
    submitBtn.disabled = !shot;
  }

  async function setShot(dataUrl) {
    shot = dataUrl;
    enableSubmit();
  }

  document.querySelector("[data-back]")?.addEventListener("click", () => {
    stopCamera();
    renderAdmin();
  });

  document.querySelector("[data-host-upload]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (file?.type.startsWith("image/")) setShot(await fileToDataUrl(file));
  });

  flipBtn?.addEventListener("click", async () => {
    if (!cameraStream) return;
    try {
      await flipCameraFeed(feed);
    } catch {
      showToast("Couldn't switch camera.");
    }
  });

  camBtn?.addEventListener("click", async () => {
    if (cameraStream) {
      await setShot(captureFrameFromFeed(feed));
      stopCamera();
      setCameraLiveUi({ feed, frame, camBtn, flipBtn, live: false });
      return;
    }
    try {
      await startCameraFeed(feed, "user");
      setCameraLiveUi({ feed, frame, camBtn, flipBtn, live: true });
    } catch {
      showToast("Camera unavailable — tap + to upload.");
    }
  });

  submitBtn?.addEventListener("click", async () => {
    if (!shot) return;
    const payload = {
      hostPin: getHostPin(),
      userId: state.user?.id,
      sideQuestId: quest.id,
      caption: captionEl?.value || quest.title,
      mediaDataUrl: await uploadableDataUrl(shot)
    };
    try {
      const result = await api("/api/host/side-quest", { method: "POST", body: JSON.stringify(payload) });
      if (!state.sideQuestCaptures) state.sideQuestCaptures = [];
      const { mediaDataUrl: _omit, ...lean } = result.submission;
      state.sideQuestCaptures.unshift(lean);
      saveState();
      showToast(`Side quest saved: ${quest.title}`, true);
      stopCamera();
      renderAdmin();
    } catch (error) {
      showToast(error.message || "Could not save side quest.");
    }
  });
}

// ---------------------------------------------------------------------------
// Party Wall (live feed) + Leaderboard + staggered quest unlocks
// ---------------------------------------------------------------------------

const PARTY_POLL_MS = 5000;
const WALL_NAME_KEY = "cleoWallName:v1";
let wallSeen = new Set();
let wallPostsCache = [];
let wallPoll = null;
let wallViewerName = "";
let leaderboardPoll = null;
let announcedReveals = { 2: false, 3: false, final: false };

// ---------- Router ----------
function currentHashView() {
  const h = (location.hash || "").replace(/^#/, "");
  return h === "party-wall" || h === "leaderboard" ? h : "game";
}
function go(view) {
  if (view === "game") {
    history.pushState(null, "", location.pathname);
    routeFromHash();
  } else {
    location.hash = view;
  }
}
function routeFromHash() {
  const view = currentHashView();
  clearInterval(wallPoll);
  wallPoll = null;
  clearInterval(leaderboardPoll);
  leaderboardPoll = null;
  clearInterval(waitingPoll);
  waitingPoll = null;
  app.classList.remove("party-wide");
  stopCamera();
  if (view === "party-wall") { renderPartyWall(); return; }
  if (view === "leaderboard") { renderLeaderboard(); return; }
  if (!state.user || !state.board) renderJoin();
  else if (!gameStarted()) renderWaiting();
  else renderGame();
}
window.addEventListener("hashchange", routeFromHash);

async function refreshStatus() {
  try {
    status = await api("/api/status");
  } catch {
    /* keep last known status */
  }
  return status;
}

// ---------- Waiting screen (host hasn't started the game yet) ----------
let waitingPoll = null;
function renderWaiting() {
  clearInterval(waitingPoll);
  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack end-screen">
      <div class="join-badge">Treasure hunt · 60 minutes</div>
      <p class="kicker">Cleo's First Birthday</p>
      <h1 class="title-display">On standby…</h1>
      <p class="lead">The host hasn't kicked off the hunt yet. Quests open the moment the game starts — hang tight!</p>
      <div class="loader-ring" aria-hidden="true"></div>
      <button class="btn btn-secondary btn-full" type="button" data-view-wall>🪩 Peek the party wall</button>
      <button class="btn btn-ghost btn-full" type="button" data-reset>Reset phone</button>
    </section>
  `;
  screenEnter();
  document.querySelector("[data-view-wall]")?.addEventListener("click", () => go("party-wall"));
  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, loadState());
    clearInterval(waitingPoll);
    renderJoin();
  });
  waitingPoll = setInterval(async () => {
    await refreshStatus();
    if (gameStarted()) {
      clearInterval(waitingPoll);
      renderGame();
    }
  }, 3000);
}

// ---------- Unlock helpers ----------
function stageForSlotFn(slot) {
  if (slot <= 3) return 1;
  if (slot <= 6) return 2;
  if (slot <= 9) return 3;
  return 4;
}
function stageUnlocksMap() {
  const su = status?.stageUnlocks || {};
  return { 1: 0, 2: Number(su[2] ?? 1200), 3: Number(su[3] ?? 2100) };
}
function elapsedSeconds() {
  const at = gameStartedAt();
  return at ? Math.floor((Date.now() - at) / 1000) : 0;
}
function stage3ClearedState() {
  const done = new Set(state.submissions.map((s) => Number(s.questSlot)));
  return [7, 8, 9].every((s) => done.has(s));
}
function dryRunMode() {
  return !!status?.dryRun;
}
function slotUnlocked(slot) {
  if (dryRunMode()) return true;
  const stage = stageForSlotFn(slot);
  if (stage === 1) return true;
  const e = elapsedSeconds();
  const su = stageUnlocksMap();
  if (stage === 2) return e >= su[2];
  if (stage === 3) return e >= su[3];
  return stage3ClearedState(); // slot 10: gated on clearing stage 3
}
function slotUnlockCountdown(slot) {
  const su = stageUnlocksMap();
  const stage = stageForSlotFn(slot);
  if (stage === 2) return Math.max(0, su[2] - elapsedSeconds());
  if (stage === 3) return Math.max(0, su[3] - elapsedSeconds());
  return 0;
}
function nextUnlockedOpenSlot(quests) {
  const open = quests.filter((q) => !isComplete(q.slot) && slotUnlocked(q.slot));
  if (open.length) return open[0].slot;
  const unlocked = quests.find((q) => slotUnlocked(q.slot));
  return unlocked?.slot || quests[0]?.slot || 1;
}
function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m === 0 ? `${sec}s` : `${m}m ${sec.toString().padStart(2, "0")}s`;
}

// Reveal "moments" when a stage unlocks or the final treasure opens up.
function nextUnlockBanner() {
  if (dryRunMode()) return null;
  const su = stageUnlocksMap();
  const e = elapsedSeconds();
  if (e < su[2]) return { label: "Stage 2 · treasures 4–6", at: su[2] };
  if (e < su[3]) return { label: "Stage 3 · treasures 7–9", at: su[3] };
  if (!stage3ClearedState()) return { label: "The final treasure", at: null };
  return null;
}
function unlockBannerMarkup() {
  const u = nextUnlockBanner();
  if (!u) return "";
  const when = u.at ? `in ${formatClock(Math.max(0, u.at - elapsedSeconds()))}` : "after clearing stage 3";
  return `<div class="unlock-banner">⏳ <strong>${u.label}</strong> opens ${when}.</div>`;
}
function revealStage(stage) {
  const labels = { 2: "Stage 2 just unlocked — treasures 4–6 are live!", 3: "Stage 3 unlocked — the hard-mode set (7–9) is go." };
  showToast(labels[stage] || "New stage unlocked!", true);
}
function maybeRevealFinal() {
  if (announcedReveals.final) return;
  if (stage3ClearedState()) {
    announcedReveals.final = true;
    showToast("Final treasure unlocked — the Future Advice Council awaits.", true);
  }
}

// ---------- Party Wall ----------
function partyViewerName() {
  return state.user?.gameName || localStorage.getItem(WALL_NAME_KEY) || "";
}
function ensureWallName() {
  let name = partyViewerName();
  if (name) return name;
  name = (window.prompt("What's your party nickname?", "") || "").trim();
  if (name) localStorage.setItem(WALL_NAME_KEY, name);
  return name || "";
}

async function renderPartyWall() {
  clearInterval(wallPoll);
  app.classList.add("party-wide");
  wallSeen = new Set();
  wallViewerName = partyViewerName();
  app.innerHTML = `
    <section class="party-view">
    <header class="pw-header">
      <button class="btn btn-ghost" type="button" data-pw-back>← Back</button>
      <div>
        <p class="kicker">Live feed</p>
        <h2 class="title-quest">Party Wall</h2>
      </div>
      <span class="pw-live-dot" aria-hidden="true"></span>
    </header>
    <p class="muted pw-sub">Fresh from the hunt. New photos land here in real time — perfect on the TV.</p>
    <div class="pw-grid" data-pw-grid>
      <div class="pw-empty muted">Loading the feed…</div>
    </div>
    </section>
  `;
  screenEnter();
  document.querySelector("[data-pw-back]")?.addEventListener("click", () => go("game"));
  await pollPartyWall();
  wallPoll = setInterval(pollPartyWall, PARTY_POLL_MS);
}

async function pollPartyWall() {
  let data;
  try {
    data = await api(`/api/party-wall?userName=${encodeURIComponent(wallViewerName)}`);
  } catch {
    return;
  }
  const posts = data.posts || [];
  wallPostsCache = posts;
  const grid = document.querySelector("[data-pw-grid]");
  if (!grid) return;
  if (!posts.length) {
    grid.innerHTML = `<div class="pw-empty muted">No photos yet. The first submissions appear here automatically.</div>`;
    return;
  }

  if (!grid.querySelector("[data-pw-id]")) {
    grid.innerHTML = posts.map((post) => wallCardMarkup(post, wallSeen.has(post.id))).join("");
    for (const post of posts) wallSeen.add(post.id);
    bindWallCards();
    return;
  }

  for (const post of posts) {
    let card = grid.querySelector(`[data-pw-id="${CSS.escape(post.id)}"]`);
    if (card) {
      syncWallCard(card, post);
    } else {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = wallCardMarkup(post, wallSeen.has(post.id));
      card = wrapper.firstElementChild;
      grid.insertBefore(card, grid.firstChild);
    }
    wallSeen.add(post.id);
  }
  bindWallCards();
}

function syncWallCard(card, post) {
  const caption = wallPostCaption(post);
  const textEl = card.querySelector(".pw-card__text");
  if (caption) {
    if (textEl) textEl.textContent = caption;
    else {
      const body = card.querySelector(".pw-card__body");
      const questEl = body?.querySelector(".pw-card__quest");
      const p = document.createElement("p");
      p.className = "pw-card__text";
      p.textContent = caption;
      if (questEl?.nextSibling) questEl.after(p);
      else body?.prepend(p);
    }
  } else if (textEl) {
    textEl.remove();
  }

  const likeBtn = card.querySelector("[data-pw-like]");
  if (likeBtn) {
    likeBtn.classList.toggle("is-liked", Boolean(post.likedByMe));
    likeBtn.setAttribute("aria-pressed", post.likedByMe ? "true" : "false");
    const likeSpan = likeBtn.querySelector("span");
    if (likeSpan) likeSpan.textContent = String(post.likeCount || 0);
  }
  const commentBtn = card.querySelector("[data-pw-comments]");
  if (commentBtn) {
    const commentSpan = commentBtn.querySelector("span");
    if (commentSpan) commentSpan.textContent = String(post.commentCount || 0);
  }

  const media = wallImagesMarkup(post);
  const mediaWrap = card.querySelector(".pw-card__media");
  if (mediaWrap && mediaWrap.innerHTML !== media) mediaWrap.innerHTML = media;
}

function wallImagesMarkup(post) {
  const urls = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
  const labels = post.slotLabels || [];
  if (!urls.length) {
    return `<div class="pw-card__img pw-card__img--placeholder">🫧</div>`;
  }
  if (urls.length === 1) {
    return `<img class="pw-card__img" src="${escapeHtml(urls[0])}" alt="${escapeHtml(post.questTitle || "party photo")}" loading="lazy" decoding="async">`;
  }
  return `
    <div class="pw-card__gallery">
      ${urls
        .map(
          (url, index) => `
            <figure class="pw-card__shot">
              <img class="pw-card__img" src="${escapeHtml(url)}" alt="${escapeHtml(labels[index] || post.questTitle || "party photo")}" loading="lazy" decoding="async">
              ${labels[index] ? `<figcaption class="pw-card__shot-label">${escapeHtml(labels[index])}</figcaption>` : ""}
            </figure>`
        )
        .join("")}
    </div>
  `;
}

function wallPostText(post) {
  return wallPostCaption(post);
}

function wallCardMarkup(post, seen) {
  const text = wallPostText(post);
  const initial = (post.userName || "?").trim().charAt(0).toUpperCase();
  return `
    <article class="pw-card ${seen ? "" : "pw-card--new"}" data-pw-id="${escapeHtml(post.id)}">
      <div class="pw-card__media">${wallImagesMarkup(post)}</div>
      <div class="pw-card__body">
        ${post.questTitle ? `<p class="pw-card__quest">${escapeHtml(post.questTitle)}</p>` : ""}
        ${text ? `<p class="pw-card__text">${escapeHtml(text)}</p>` : ""}
        <div class="pw-card__foot">
          <span class="pw-user"><span class="pw-avatar">${escapeHtml(initial)}</span>${escapeHtml(post.userName || "Guest")}</span>
          <div class="pw-actions">
            <button class="pw-chip ${post.likedByMe ? "is-liked" : ""}" type="button" data-pw-like="${escapeHtml(post.id)}" aria-pressed="${post.likedByMe ? "true" : "false"}">♥ <span>${post.likeCount || 0}</span></button>
            <button class="pw-chip" type="button" data-pw-comments="${escapeHtml(post.id)}">💬 <span>${post.commentCount || 0}</span></button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function bindWallCards() {
  document.querySelectorAll("[data-pw-like]:not([data-bound])").forEach((btn) => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => toggleWallLike(btn.dataset.pwLike, btn));
  });
  document.querySelectorAll("[data-pw-comments]:not([data-bound])").forEach((btn) => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => openWallComments(btn.dataset.pwComments));
  });
}

async function toggleWallLike(id, btn) {
  const name = ensureWallName();
  if (!name) return;
  const span = btn.querySelector("span");
  const liked = btn.classList.contains("is-liked");
  btn.classList.toggle("is-liked", !liked);
  btn.setAttribute("aria-pressed", String(!liked));
  span.textContent = String(Math.max(0, Number(span.textContent || 0) + (liked ? -1 : 1)));
  try {
    const res = await api("/api/likes", { method: "POST", body: JSON.stringify({ submissionId: id, userName: name }) });
    btn.classList.toggle("is-liked", res.liked);
    btn.setAttribute("aria-pressed", String(res.liked));
    span.textContent = String(res.likeCount);
  } catch {
    btn.classList.toggle("is-liked", liked);
    span.textContent = String(Math.max(0, Number(span.textContent || 0) + (liked ? 1 : -1)));
  }
}

function openWallComments(id) {
  const post = wallPostsCache.find((p) => p.id === id);
  if (!post) return;
  const overlay = document.createElement("div");
  overlay.className = "pw-modal";
  overlay.innerHTML = `
    <div class="pw-modal__card" role="dialog" aria-label="Comments">
      <button class="pw-modal__close" type="button" data-pw-close aria-label="Close">×</button>
      ${post.imageUrls?.length || post.imageUrl ? `<div class="pw-modal__media">${wallImagesMarkup(post)}</div>` : ""}
      <div class="pw-modal__body">
        ${post.questTitle ? `<p class="pw-card__quest">${escapeHtml(post.questTitle)}</p>` : ""}
        ${wallPostText(post) ? `<p class="pw-card__text">${escapeHtml(wallPostText(post))}</p>` : ""}
        <p class="pw-user"><span class="pw-avatar">${escapeHtml((post.userName || "?").charAt(0).toUpperCase())}</span>${escapeHtml(post.userName || "Guest")}</p>
        <div class="pw-comments" data-pw-comment-list>
          ${(post.comments || [])
            .map(
              (c) => `<div class="pw-comment"><span class="pw-avatar sm">${escapeHtml((c.userName || "?").charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(c.userName || "Guest")}</strong><p>${escapeHtml(c.body)}</p></div></div>`
            )
            .join("") || `<p class="muted">No comments yet.</p>`}
        </div>
        <form class="pw-comment-form" data-pw-comment-form>
          <input class="input-compact" name="body" placeholder="Add a comment…" required maxlength="1000">
          <button class="btn btn-primary" type="submit">Post</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector("[data-pw-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-pw-comment-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = (form.get("body") || "").trim();
    if (!body) return;
    const name = ensureWallName();
    if (!name) return;
    try {
      const res = await api("/api/comments", { method: "POST", body: JSON.stringify({ submissionId: id, userName: name, body }) });
      const list = overlay.querySelector("[data-pw-comment-list]");
      const empty = list.querySelector(".muted");
      if (empty) list.innerHTML = "";
      const node = document.createElement("div");
      node.className = "pw-comment";
      node.innerHTML = `<span class="pw-avatar sm">${escapeHtml((res.comment.userName || "?").charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(res.comment.userName)}</strong><p>${escapeHtml(res.comment.body)}</p></div>`;
      list.appendChild(node);
      form.reset();
      const chip = document.querySelector(`[data-pw-comments="${id}"] span`);
      if (chip) chip.textContent = String((Number(chip.textContent) || 0) + 1);
    } catch {
      showToast("Comment didn't post — try again.");
    }
  });
}

// ---------- Leaderboard ----------
async function renderLeaderboard() {
  app.classList.remove("party-wide");
  let data;
  try {
    data = await api("/api/leaderboard");
  } catch {
    data = { ranked: [], others: [] };
  }
  const ranked = data.ranked || [];
  const others = data.others || [];
  app.innerHTML = `
    <section class="party-view">
    <header class="pw-header">
      <button class="btn btn-ghost" type="button" data-lb-back>← Back</button>
      <div>
        <p class="kicker">Standings</p>
        <h2 class="title-quest">Leaderboard</h2>
      </div>
    </header>
    <p class="muted pw-sub">Ranked by active questing time across stages. Mingling between unlocks is free — grinding doesn't pay.</p>
    ${data.sample ? `<p class="pill pill--dry lb-sample">Sample data — clears when guests start playing</p>` : ""}
    <section class="lb-block">
      <h3 class="lb-section">🏆 Top 10</h3>
      <div class="lb-list">
      ${ranked.length ? ranked.map((entry) => rankRowMarkup(entry)).join("") : `<p class="muted lb-empty">No finishers yet. Be the first to clear all 10.</p>`}
      </div>
    </section>
    ${others.length ? `
      <section class="lb-block">
        <h3 class="lb-section">Everyone else</h3>
        <div class="lb-list">
        ${others.map((entry) => otherRowMarkup(entry)).join("")}
        </div>
      </section>` : ""}
    </section>
  `;
  screenEnter();
  document.querySelector("[data-lb-back]")?.addEventListener("click", () => go("game"));
  const all = [...ranked, ...others];
  document.querySelectorAll("[data-lb-user]").forEach((row) => {
    row.addEventListener("click", () => {
      const entry = all.find((e) => (e.userId || "") === row.dataset.lbUser);
      if (entry) openPlayerSubmissions(entry);
    });
  });
}

function rankRowMarkup(entry) {
  const total = entry.totalActiveSeconds ?? 0;
  const breakdown = (entry.stages || [])
    .map((s, i) => (s == null ? null : `<span class="lb-stage">S${i + 1} ${formatClock(s)}</span>`))
    .filter(Boolean)
    .join("");
  return `
    <button class="lb-row lb-row--ranked" type="button" data-lb-user="${escapeHtml(entry.userId || "")}">
      <span class="lb-rank">${entry.rank}</span>
      <span class="lb-name">${escapeHtml(entry.gameName)}</span>
      <span class="lb-time">${formatClock(total)}</span>
      <span class="lb-score">${entry.score}/10</span>
      <span class="lb-stages">${breakdown}</span>
    </button>
  `;
}

function otherRowMarkup(entry) {
  return `
    <button class="lb-row" type="button" data-lb-user="${escapeHtml(entry.userId || "")}">
      <span class="lb-name">${escapeHtml(entry.gameName)}</span>
      <span class="lb-score">${entry.score}/10 treasures</span>
    </button>
  `;
}

function openPlayerSubmissions(entry) {
  const overlay = document.createElement("div");
  overlay.className = "pw-modal";
  const subs = entry.submissions || [];
  overlay.innerHTML = `
    <div class="pw-modal__card pw-modal__card--wide" role="dialog" aria-label="${escapeHtml(entry.gameName)} submissions">
      <button class="pw-modal__close" type="button" data-pw-close aria-label="Close">×</button>
      <p class="kicker">${escapeHtml(entry.gameName)}</p>
      <h3 class="title-quest">${entry.finishedAll ? `${formatClock(entry.totalActiveSeconds || 0)} active` : `${entry.score}/10 treasures`}</h3>
      <div class="lb-submissions">
        ${subs.length
          ? subs.map((s) => `
              <div class="lb-sub">
                ${s.imageUrl ? `<img class="lb-sub__img" src="${escapeHtml(s.imageUrl)}" alt="" loading="lazy">` : `<div class="lb-sub__img pw-card__img--placeholder">🫧</div>`}
                <div class="lb-sub__meta">
                  <strong>Q${s.questSlot} · ${escapeHtml(s.questTitle || "")}</strong>
                  ${s.caption ? `<p>${escapeHtml(s.caption)}</p>` : ""}
                  ${Object.values(s.requiredFields || {})
                    .filter((v) => v && !String(v).startsWith("events/"))
                    .map((v) => `<span class="lb-tag">${escapeHtml(v)}</span>`)
                    .join("")}
                </div>
              </div>`).join("")
          : `<p class="muted">No viewable submissions yet.</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector("[data-pw-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

async function boot() {
  initScene(gameBg);
  status = await api("/api/status");
  routeFromHash();
}

boot().catch((error) => {
  app.innerHTML = `<section class="panel panel-pad"><h2 class="title-quest">Could not load</h2><p class="lead">${escapeHtml(error.message)}</p></section>`;
});
