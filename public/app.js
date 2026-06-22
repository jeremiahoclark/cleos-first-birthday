import { composeProof, loadImage } from "/compose.js";
import { initScene } from "/scene.js";
import { getQuestToast } from "/quest-toasts.js";

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
      <p class="lead">Chase 10 photo treasures solo, meet everyone, and fill Cleo's birthday archive.</p>
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
}

function timeRemaining() {
  const duration = status?.event?.durationSeconds || 3600;
  if (!state.startedAt) return duration;
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
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
        .map(
          (quest) => `
            <button
              class="trail-node ${quest.slot === activeQuestSlot ? "active" : ""} ${isComplete(quest.slot) ? "done" : ""}"
              type="button"
              data-jump-slot="${quest.slot}"
              aria-label="Treasure ${quest.slot}${isComplete(quest.slot) ? " found" : ""}"
            >${isComplete(quest.slot) ? "" : quest.slot}</button>
          `
        )
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
              : `<button class="btn btn-primary btn-capture btn-full" data-open-camera="${quest.slot}">Capture proof</button>`
        }
        <div class="quest-nav ${labeledSlots && !complete ? "quest-nav--single" : ""}">
          <button class="btn btn-ghost" type="button" data-jump-slot="${previous}">← Prev</button>
          ${
            labeledSlots && !complete
              ? `<span class="quest-nav-hint">Tap each + to add a photo</span>`
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
  if (!quests.some((quest) => Number(quest.slot) === Number(activeQuestSlot))) {
    activeQuestSlot = nextOpenQuestSlot(quests);
  }
  const activeQuest = quests.find((quest) => Number(quest.slot) === Number(activeQuestSlot)) || quests[0];
  app.innerHTML = `
    ${topbar()}
    ${timerMarkup()}
    ${progressNav(quests)}
    ${activeQuestView(activeQuest, quests)}
    ${feedbackMarkup()}
    <div class="hud-footer">
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
    activeQuestSlot = nextOpenQuestSlot(state.board.quests || status.quests);
    renderGame();
  });
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

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

const CAMERA_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

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
              <label class="slot-thumb" aria-label="${escapeHtml(label)}">
                <input type="file" class="slot-file" accept="image/*" capture="environment" data-slot-file="${index}">
                ${
                  filled
                    ? `<img src="${filled}" alt=""><button type="button" class="slot-clear" data-clear-slot="${index}" aria-label="Remove photo">×</button>`
                    : `<span class="slot-plus">+</span>`
                }
              </label>
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

function bindInlineLabeledSlots(quest) {
  const draft = getSlotDraft(quest.slot, quest.photoSlots.length);

  document.querySelectorAll("[data-slot-file]").forEach((input) => {
    input.addEventListener("change", async () => {
      const index = Number(input.dataset.slotFile);
      const file = input.files?.[0];
      if (!file?.type.startsWith("image/")) return;
      draft[index] = await fileToDataUrl(file);
      saveState();
      renderGame();
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

  const slotImages = shots.map((shot) => (shot.length < 1_400_000 ? shot : ""));
  const mediaDataUrl = composed.dataUrl.length < 1_400_000 ? composed.dataUrl : "";

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
  activeQuestSlot = nextOpenQuestSlot(state.board.quests || status.quests);
  saveState();
  await celebrateQuestSubmit(quest);
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
            <input type="file" data-video-capture accept="video/*" capture="environment" hidden>
          </div>
        `
            : `
          <div class="capture-hero">
            <div class="capture-frame" data-capture-frame>
              <video class="cam-feed" data-feed playsinline autoplay muted hidden></video>
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

    camBtn.addEventListener("click", async () => {
      if (cameraStream) {
        const canvas = document.createElement("canvas");
        canvas.width = feed.videoWidth || 1080;
        canvas.height = feed.videoHeight || 1440;
        canvas.getContext("2d").drawImage(feed, 0, 0, canvas.width, canvas.height);
        addShot(canvas.toDataURL("image/jpeg", 0.85));
        stopCamera();
        feed.hidden = true;
        frame.classList.remove("capture-frame--live");
        camBtn.classList.remove("cam-big--live");
        camBtn.innerHTML = CAMERA_ICON;
        camBtn.setAttribute("aria-label", "Retake photo");
        return;
      }

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        feed.srcObject = cameraStream;
        feed.hidden = false;
        frame.classList.add("capture-frame--live");
        camBtn.classList.add("cam-big--live");
        camBtn.innerHTML = "";
        camBtn.setAttribute("aria-label", "Take photo");
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
      mediaDataUrl = composed.dataUrl.length < 1_400_000 ? composed.dataUrl : "";
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
    activeQuestSlot = nextOpenQuestSlot(state.board.quests || status.quests);
    saveState();
    await celebrateQuestSubmit(quest);
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
        <p class="lead">Enter the host pin to capture side quests and see the guest board.</p>
        <form id="host-pin-form" class="stack">
          <label class="field">
            <span>Host pin</span>
            <input class="input" name="hostPin" type="password" inputmode="numeric" autocomplete="off" required>
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

  let admin = { dryRun: true, guests: [], submissions: [] };
  let sideQuests = [];
  try {
    [admin, { sideQuests }] = await Promise.all([api("/api/admin"), api("/api/host/side-quests")]);
  } catch {
    /* host tools still work locally in dry mode */
  }

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
      <p class="lead">${admin.dryRun ? "Dry mode — guest list empty until live." : `${admin.guests?.length || 0} guest(s) playing.`}</p>

      ${connectionMeterMarkup(connectionCount)}

      <div class="panel panel-pad">
        <p class="kicker">Your hunt</p>
        <span class="team-name">${escapeHtml(state.user?.gameName || "You")}</span>
        <p class="title-quest" style="margin-top:8px;font-size:2.2rem">${completedCount()} / 10</p>
      </div>

      <div class="host-section">
        <h3 class="host-section__title">Side quests</h3>
        <p class="muted">Host-only moments — saved to the archive, not scored.</p>
        <div class="side-quest-grid">
          ${(sideQuests || [])
            .map(
              (quest) => `
                <button class="side-quest-btn" type="button" data-side-quest="${escapeHtml(quest.id)}">
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
  document.querySelectorAll("[data-side-quest]").forEach((button) => {
    button.addEventListener("click", () => renderHostSideQuest(button.dataset.sideQuest, sideQuests));
  });
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

  camBtn?.addEventListener("click", async () => {
    if (cameraStream) {
      const canvas = document.createElement("canvas");
      canvas.width = feed.videoWidth || 1080;
      canvas.height = feed.videoHeight || 1440;
      canvas.getContext("2d").drawImage(feed, 0, 0, canvas.width, canvas.height);
      await setShot(canvas.toDataURL("image/jpeg", 0.85));
      stopCamera();
      feed.hidden = true;
      frame.classList.remove("capture-frame--live");
      camBtn.classList.remove("cam-big--live");
      camBtn.innerHTML = CAMERA_ICON;
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      feed.srcObject = cameraStream;
      feed.hidden = false;
      frame.classList.add("capture-frame--live");
      camBtn.classList.add("cam-big--live");
      camBtn.innerHTML = "";
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
      mediaDataUrl: shot.length < 1_400_000 ? shot : ""
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

async function boot() {
  initScene(gameBg);
  status = await api("/api/status");
  if (!state.user || !state.board) renderJoin();
  else renderGame();
}

boot().catch((error) => {
  app.innerHTML = `<section class="panel panel-pad"><h2 class="title-quest">Could not load</h2><p class="lead">${escapeHtml(error.message)}</p></section>`;
});
