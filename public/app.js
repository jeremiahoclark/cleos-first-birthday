import { composeProof, loadImage } from "/compose.js";
import { initScene } from "/scene.js";

const app = document.querySelector("#app");
const gameBg = document.querySelector("#game-bg");
const STORAGE_KEY = "cleoQuestState:v1";
const DEVICE_KEY = "cleoQuestDeviceId:v1";

const affirmations = [
  "Quest captured. Cleo's archive just got better.",
  "That one is birthday-book material.",
  "Excellent proof. The parents are going to love this.",
  "Team legend behavior.",
  "Memory secured. On to the next quest.",
  "That submission has serious party energy."
];

const state = loadState();
let status = null;
let timerHandle = null;
let activeQuestSlot = 1;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return {
    user: null,
    team: null,
    startedAt: null,
    submissions: [],
    feedback: []
  };
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
  const colors = ["#ffd166", "#ff6b9d", "#4ecdc4", "#a78bfa", "#ffb703"];
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
      <p class="lead">Get a random crew, chase 10 photo treasures, meet everyone, and fill Cleo's birthday archive.</p>
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
    state.team = result.team;
    state.startedAt = state.startedAt || Date.now();
    saveState();
    showToast(`Welcome to ${result.team.name}.`, true);
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
        <p class="kicker">Your crew</p>
        <span class="team-name">${escapeHtml(state.team.name)}</span>
      </div>
      <div class="timer-ring" aria-label="Time remaining">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <defs>
            <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffd166"/>
              <stop offset="100%" stop-color="#ff6b9d"/>
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
    </section>
  `;
}

// Slots 1-10 that still have no submission, as a friendly "Quest N" list.
function unsubmittedSlots() {
  const done = new Set(state.submissions.map((s) => Number(s.questSlot)));
  return (state.team?.quests || []).filter((q) => !done.has(Number(q.slot)));
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
  const requirements = quest.requiredFields
    .map((field) => `<div class="loot-item">${escapeHtml(field)}</div>`)
    .join("");
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
      <div class="loot-list">${requirements}</div>
      <div class="quest-actions">
        ${
          complete
            ? `
            <div class="complete-badge">
              <strong>Treasure secured!</strong>
              <span>Logged for your crew. Keep hunting.</span>
            </div>
            <button class="btn btn-primary btn-full" data-next-open>Next treasure</button>
          `
            : `<button class="btn btn-primary btn-capture btn-full" data-open-camera="${quest.slot}">Capture proof</button>`
        }
        <div class="quest-nav">
          <button class="btn btn-ghost" type="button" data-jump-slot="${previous}">← Prev</button>
          <button class="btn btn-secondary" type="button" data-jump-slot="${next}">Next →</button>
        </div>
      </div>
    </section>
  `;
}

function renderGame() {
  stopCamera();
  clearInterval(timerHandle);
  const quests = state.team.quests || status.quests;
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
  // quests that still have no submission so teams can scramble.
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
    activeQuestSlot = nextOpenQuestSlot(state.team.quests || status.quests);
    renderGame();
  });
  document.querySelector("[data-view-admin]")?.addEventListener("click", renderAdmin);
  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, loadState());
    renderJoin();
  });
  bindFeedback();
}

let cameraStream = null;

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

function renderCamera(slot) {
  const quest = state.team.quests.find((item) => Number(item.slot) === Number(slot));
  const isVideoQuest = quest.mediaType === "video";
  const allowMultiple = quest.composition === "collage";
  const shots = []; // captured/uploaded image data URLs (for photo quests)
  let composed = null; // { canvas, dataUrl }
  let videoDataUrl = ""; // raw data URL for video quests

  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack capture-screen">
      <button class="btn btn-ghost" data-back>← Back to map</button>
      <div>
        <p class="kicker">Treasure ${quest.slot}</p>
        <h2 class="title-quest">${escapeHtml(quest.title)}</h2>
        <p class="lead">${escapeHtml(quest.prompt)}</p>
      </div>

      <form id="submission-form" class="stack">
        ${
          isVideoQuest
            ? `
          <label class="field">
            <span>Record or upload a video</span>
            <input class="file-input" name="media" type="file" accept="video/*" capture="environment" required>
          </label>
          <video class="preview" data-video-preview controls playsinline hidden></video>
        `
            : `
          <div class="capture-stage">
            <video class="cam-feed" data-feed playsinline autoplay muted hidden></video>
            <div class="button-row">
              <button class="btn btn-primary" type="button" data-start-cam>Open camera</button>
              <button class="btn btn-secondary" type="button" data-shutter hidden>Snap${allowMultiple ? " photo" : ""}</button>
              <button class="btn btn-ghost" type="button" data-stop-cam hidden>Stop</button>
            </div>
            <label class="field">
              <span>Or upload from your phone${allowMultiple ? " (pick several)" : ""}</span>
              <input class="file-input" name="upload" type="file" accept="image/*" capture="environment" ${allowMultiple ? "multiple" : ""}>
            </label>
            <div class="thumb-row" data-thumbs></div>
          </div>
        `
        }

        <div class="capture-details" data-capture-details hidden>
        <label class="field">
          <span>Caption</span>
          <textarea class="textarea" name="caption" placeholder="Who is in this? What should the parents know?" required></textarea>
        </label>
        ${quest.requiredFields
          .map(
            (field, index) => `
              <label class="field">
                <span>${escapeHtml(field)}</span>
                <input class="input" name="required-${index}" required>
              </label>
            `
          )
          .join("")}
        ${
          isVideoQuest
            ? ""
            : `
        <div class="composed-wrap" data-composed-wrap hidden>
          <p class="kicker">Preview</p>
          <img class="preview show" data-composed alt="Composed proof preview">
        </div>
        <details class="details-advanced">
          <summary>Photo layout</summary>
          <div class="details-body">
            <select class="select" name="compositionMode">
              <option value="${quest.composition}">Recommended: ${layoutLabel(quest.composition)}</option>
              <option value="caption">Caption at bottom</option>
              <option value="side-by-side">Side-by-side reference</option>
              <option value="collage">Collage / set</option>
              <option value="plain">Plain proof</option>
            </select>
          </div>
        </details>
        `
        }
        <button class="btn btn-primary btn-full" type="submit" data-submit ${isVideoQuest ? "" : "disabled"}>Lock in treasure</button>
        </div>
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
  const detailsPanel = document.querySelector("[data-capture-details]");

  function revealDetails() {
    if (!detailsPanel || !detailsPanel.hidden) return;
    detailsPanel.hidden = false;
    detailsPanel.classList.add("capture-details--reveal");
  }

  async function rebuildPreview() {
    if (isVideoQuest) return;
    const wrap = document.querySelector("[data-composed-wrap]");
    if (!shots.length) {
      wrap.hidden = true;
      composed = null;
      submitBtn.disabled = true;
      return;
    }
    const images = await Promise.all(shots.map(loadImage));
    composed = composeProof({
      mode: compositionSelect.value,
      images,
      caption: captionEl.value,
      title: quest.title,
      reference: quest.prompt
    });
    document.querySelector("[data-composed]").src = composed.dataUrl;
    wrap.hidden = false;
    submitBtn.disabled = false;
    revealDetails();
  }

  function addShot(dataUrl) {
    if (!allowMultiple) shots.length = 0;
    shots.push(dataUrl);
    renderThumbs();
    rebuildPreview();
    revealDetails();
  }

  function renderThumbs() {
    const row = document.querySelector("[data-thumbs]");
    if (!row) return;
    row.innerHTML = shots
      .map((src, i) => `<div class="thumb"><img src="${src}" alt="shot ${i + 1}"><button type="button" data-remove="${i}">×</button></div>`)
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
    const videoPreview = document.querySelector("[data-video-preview]");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      videoPreview.src = URL.createObjectURL(file);
      videoPreview.hidden = false;
      videoDataUrl = file.size < 4_000_000 ? await fileToDataUrl(file) : "";
      revealDetails();
    });
  } else {
    captionEl.addEventListener("input", rebuildPreview);
    compositionSelect.addEventListener("change", rebuildPreview);

    const uploadInput = document.querySelector("[name='upload']");
    uploadInput.addEventListener("change", async () => {
      for (const file of [...(uploadInput.files || [])]) {
        if (file.type.startsWith("image/")) addShot(await fileToDataUrl(file));
      }
    });

    const feed = document.querySelector("[data-feed]");
    const startBtn = document.querySelector("[data-start-cam]");
    const shutter = document.querySelector("[data-shutter]");
    const stopBtn = document.querySelector("[data-stop-cam]");

    startBtn.addEventListener("click", async () => {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        feed.srcObject = cameraStream;
        feed.hidden = false;
        shutter.hidden = false;
        stopBtn.hidden = false;
        startBtn.hidden = true;
      } catch {
        showToast("Camera unavailable — use upload instead.");
        startBtn.hidden = true;
      }
    });

    shutter.addEventListener("click", () => {
      const canvas = document.createElement("canvas");
      canvas.width = feed.videoWidth || 1080;
      canvas.height = feed.videoHeight || 1440;
      canvas.getContext("2d").drawImage(feed, 0, 0, canvas.width, canvas.height);
      addShot(canvas.toDataURL("image/jpeg", 0.85));
      if (!allowMultiple) {
        stopCamera();
        feed.hidden = true;
        shutter.hidden = true;
        stopBtn.hidden = true;
        startBtn.hidden = false;
        startBtn.textContent = "Retake";
      }
    });

    stopBtn.addEventListener("click", () => {
      stopCamera();
      feed.hidden = true;
      shutter.hidden = true;
      stopBtn.hidden = true;
      startBtn.hidden = false;
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
      compositionMode = compositionSelect.value;
    }

    const payload = {
      userId: state.user.id,
      teamId: state.team.id,
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
    activeQuestSlot = nextOpenQuestSlot(state.team.quests || status.quests);
    saveState();
    showToast(affirmations[Math.floor(Math.random() * affirmations.length)], Math.random() > 0.35);
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
      <p class="kicker">Time's up · ${escapeHtml(state.team.name)}</p>
      <h1 class="title-display">${headline}</h1>
      <div class="final-score" aria-label="Final score">
        <span class="final-score-num">${score}</span><span class="final-score-den">/ 10</span>
      </div>
      <p class="lead">Treasures found by your crew. Host confirms the winner.</p>
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
  const admin = await api("/api/admin");
  const submissions = state.submissions
    .map((submission) => `<div class="mini-card"><strong>Quest ${submission.questSlot}</strong><p>${escapeHtml(submission.questId)} · ${escapeHtml(submission.caption)}</p></div>`)
    .join("");
  app.innerHTML = `
    ${topbar()}
    <section class="panel panel-pad stack">
      <button class="btn btn-ghost" data-back>← Back to map</button>
      <p class="kicker">Host view</p>
      <h2 class="title-quest">Scoreboard</h2>
      <p class="lead">${admin.dryRun ? "Dry mode — no Cloudflare writes." : "Live mode active."}</p>
      <div class="panel panel-pad">
        <span class="team-name">${escapeHtml(state.team?.name || "Current crew")}</span>
        <p class="title-quest" style="margin-top:8px;font-size:2.2rem">${completedCount()} / 10</p>
        <p class="muted">Gallery export hooks up to R2 when dry mode is off.</p>
      </div>
      <div class="stack">${submissions || `<p class="muted">No local submissions yet.</p>`}</div>
      <button class="btn btn-secondary btn-full" type="button">Download gallery (soon)</button>
    </section>
  `;
  screenEnter();
  document.querySelector("[data-back]").addEventListener("click", renderGame);
}

async function boot() {
  initScene(gameBg);
  status = await api("/api/status");
  if (!state.user || !state.team) renderJoin();
  else renderGame();
}

boot().catch((error) => {
  app.innerHTML = `<section class="panel panel-pad"><h2 class="title-quest">Could not load</h2><p class="lead">${escapeHtml(error.message)}</p></section>`;
});
