import { composeProof, loadImage } from "/compose.js";

const app = document.querySelector("#app");
const bubbleField = document.querySelector(".bubble-field");
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

function makeBubbles() {
  bubbleField.innerHTML = "";
  for (let i = 0; i < 34; i += 1) {
    const bubble = document.createElement("span");
    const size = 20 + Math.random() * 74;
    bubble.className = "bubble";
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${Math.random() * 100}%`;
    bubble.style.top = `${Math.random() * 100}%`;
    bubble.style.setProperty("--duration", `${10 + Math.random() * 14}s`);
    bubble.style.setProperty("--drift-x", `${Math.random() * 80 - 40}px`);
    bubble.style.setProperty("--drift-y", `${Math.random() * -90 - 20}px`);
    bubble.style.setProperty("--opacity", `${0.35 + Math.random() * 0.42}`);
    bubbleField.appendChild(bubble);
  }
}

function topbar() {
  const dry = status?.dryRun ? `<span class="dry-pill">Dry mode</span>` : `<span class="status-pill">Live</span>`;
  const score = `<span class="score-pill">${completedCount()}/10</span>`;
  return `<div class="topbar">${dry}${state.user ? score : ""}</div>`;
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
  const colors = ["#0ea5e9", "#4f46e5", "#ec4899", "#10b981", "#f59e0b"];
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
    <section class="screen-card stack">
      <p class="eyebrow">Cleo's First Birthday</p>
      <h1>Team Quest</h1>
      <p class="big-copy">Join a random team, chase 10 photo quests, meet people, and help build the birthday archive.</p>
      <form id="join-form" class="stack">
        <label class="field">
          <span>Real name</span>
          <input class="input" name="realName" autocomplete="name" placeholder="Jeremiah Clark" required>
        </label>
        <label class="field">
          <span>Game name</span>
          <input class="input" name="gameName" autocomplete="nickname" placeholder="Uncle J" required>
        </label>
        <button class="btn full" type="submit">Join the quest</button>
      </form>
      <p class="muted">No account. This phone gets remembered for the game. In dry mode, nothing is saved to Cloudflare storage.</p>
    </section>
  `;

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
  const progress = Math.round(((duration - remaining) / duration) * 100);
  return `
    <section class="game-header" data-timer-card>
      <div>
        <p class="eyebrow">Active round</p>
        <strong>${escapeHtml(state.team.name)}</strong>
      </div>
      <div class="timer-block">
        <span>60 min</span>
        <div class="timer" data-timer>${formatTime(remaining)}</div>
      </div>
      <div class="progress-track"><div class="progress-fill" data-progress style="--progress: ${progress}%"></div></div>
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
    <div class="quest-dots" aria-label="Quest progress">
      ${quests
        .map(
          (quest) => `
            <button
              class="quest-dot ${quest.slot === activeQuestSlot ? "active" : ""} ${isComplete(quest.slot) ? "done" : ""}"
              type="button"
              data-jump-slot="${quest.slot}"
              aria-label="Quest ${quest.slot}${isComplete(quest.slot) ? " complete" : ""}"
            >${quest.slot}</button>
          `
        )
        .join("")}
    </div>
  `;
}

function activeQuestView(quest, quests) {
  const complete = isComplete(quest.slot);
  const requirements = quest.requiredFields.map((field) => `<div><strong>Need:</strong> ${escapeHtml(field)}</div>`).join("");
  const previous = quest.slot > 1 ? quest.slot - 1 : quests.length;
  const next = quest.slot < quests.length ? quest.slot + 1 : 1;
  return `
    <section class="objective-shell ${complete ? "complete" : ""}" id="quest-${quest.slot}">
      <div class="objective-meta">
        <span>Quest ${quest.slot} of ${quests.length}</span>
        <span>${escapeHtml(quest.stageName)}</span>
      </div>
      <h1 class="objective-title">${escapeHtml(quest.title)}</h1>
      <p class="quest-prompt">${escapeHtml(quest.prompt)}</p>
      <div class="requirements">${requirements}</div>
      ${
        complete
          ? `
            <div class="complete-state">
              <strong>Locked in for your team.</strong>
              <span>This quest counts. Keep the momentum going.</span>
            </div>
            <button class="btn full" data-next-open>Next open quest</button>
          `
          : `<button class="btn full camera-cta" data-open-camera="${quest.slot}">Camera mode</button>`
      }
      <div class="objective-nav">
        <button class="btn ghost" type="button" data-jump-slot="${previous}">Previous</button>
        <button class="btn secondary" type="button" data-jump-slot="${next}">Next</button>
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
    <div class="game-flow">
      ${timerMarkup()}
      <section class="quest-control">
        <div>
          <p class="eyebrow">One objective at a time</p>
          <strong>${completedCount()} complete · ${10 - completedCount()} to go</strong>
        </div>
        <button class="mini-link" data-view-admin>Host</button>
      </section>
      ${progressNav(quests)}
      ${activeQuestView(activeQuest, quests)}
      ${feedbackMarkup()}
      <button class="mini-link reset-link" data-reset>Reset this phone</button>
    </div>
  `;
  bindGameEvents();
  timerHandle = setInterval(updateTimer, 1000);
}

let announcedFinalPush = false;

function updateTimer() {
  const timer = document.querySelector("[data-timer]");
  const fill = document.querySelector("[data-progress]");
  if (!timer || !fill) return;
  const remaining = timeRemaining();
  const duration = status?.event?.durationSeconds || 3600;
  timer.textContent = formatTime(remaining);
  fill.style.setProperty("--progress", `${Math.round(((duration - remaining) / duration) * 100)}%`);

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
    <section class="screen-card stack">
      <button class="btn ghost" data-back>Back to quests</button>
      <p class="eyebrow">Camera mode · Quest ${quest.slot}</p>
      <h1>${escapeHtml(quest.title)}</h1>
      <p class="big-copy">${escapeHtml(quest.prompt)}</p>

      <form id="submission-form" class="camera-panel">
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
              <button class="btn" type="button" data-start-cam>📷 Open camera</button>
              <button class="btn" type="button" data-shutter hidden>Capture${allowMultiple ? " photo" : ""}</button>
              <button class="btn ghost" type="button" data-stop-cam hidden>Stop</button>
            </div>
            <label class="field">
              <span>Or upload from your phone${allowMultiple ? " (pick several)" : ""}</span>
              <input class="file-input" name="upload" type="file" accept="image/*" capture="environment" ${allowMultiple ? "multiple" : ""}>
            </label>
            <div class="thumb-row" data-thumbs></div>
          </div>
        `
        }

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
        <label class="field">
          <span>Photo layout</span>
          <select class="select" name="compositionMode">
            <option value="${quest.composition}">Recommended: ${layoutLabel(quest.composition)}</option>
            <option value="caption">Photo with caption at bottom</option>
            <option value="side-by-side">Side-by-side reference layout</option>
            <option value="collage">Collage / set</option>
            <option value="plain">Plain proof photo</option>
          </select>
        </label>
        <div class="composed-wrap" data-composed-wrap hidden>
          <p class="eyebrow">Preview before you submit</p>
          <img class="preview show" data-composed alt="Composed proof preview">
        </div>
        `
        }
        <button class="btn full" type="submit" data-submit ${isVideoQuest ? "" : "disabled"}>Submit complete quest</button>
      </form>
    </section>
  `;

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
        startBtn.textContent = "📷 Retake";
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
    <section class="panel screen-card stack">
      <p class="eyebrow">Dry mode feedback</p>
      <h2>Help make the game better</h2>
      <p class="muted">Prompt ideas, UI feedback, bugs, anything. In beta dry mode this stays local and does not persist to Cloudflare.</p>
      <form id="feedback-form" class="stack">
        <select class="select" name="category">
          <option value="Prompt idea">Prompt idea</option>
          <option value="UI feedback">UI feedback</option>
          <option value="Bug">Bug</option>
          <option value="Party idea">Party idea</option>
        </select>
        <textarea class="textarea" name="message" placeholder="What should we change or add?" required></textarea>
        <button class="btn full" type="submit">Send beta feedback</button>
      </form>
      <div class="feedback-list">${localFeedback}</div>
    </section>
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
    <section class="screen-card stack end-card">
      <p class="eyebrow">Time's up · ${escapeHtml(state.team.name)}</p>
      <h1>${headline}</h1>
      <div class="final-score" aria-label="Final score">
        <span class="final-score-num">${score}</span><span class="final-score-den">/ 10</span>
      </div>
      <p class="big-copy">Quests completed by your team. Final scores and the winner are confirmed by the host.</p>
      <div class="award-grid">
        ${awards
          .map(
            (a) => `<div class="award-card"><span class="award-emoji">${a.emoji}</span><strong>${escapeHtml(
              a.title
            )}</strong><span class="muted">${escapeHtml(a.note)}</span></div>`
          )
          .join("")}
      </div>
      <button class="btn full" data-view-admin>See host scoreboard</button>
      <button class="btn ghost full" data-replay>Back to quest board</button>
    </section>
  `;
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
    <section class="screen-card stack">
      <button class="btn ghost" data-back>Back to quests</button>
      <p class="eyebrow">Host view</p>
      <h1>Scores & Submissions</h1>
      <p class="big-copy">${admin.dryRun ? "Dry mode is active. Cloudflare storage writes and reads are skipped." : "Live Cloudflare mode is active."}</p>
      <div class="panel screen-card">
        <h2>${escapeHtml(state.team?.name || "Current team")}</h2>
        <p class="timer">${completedCount()} / 10</p>
        <p class="muted">Export/download will connect to R2 once dry mode is turned off.</p>
      </div>
      <div class="submission-list">${submissions || `<p class="muted">No local submissions yet.</p>`}</div>
      <button class="btn full secondary" type="button">Download parent gallery placeholder</button>
    </section>
  `;
  document.querySelector("[data-back]").addEventListener("click", renderGame);
}

async function boot() {
  makeBubbles();
  status = await api("/api/status");
  if (!state.user || !state.team) renderJoin();
  else renderGame();
}

boot().catch((error) => {
  app.innerHTML = `<section class="screen-card"><h1>Could not load</h1><p>${escapeHtml(error.message)}</p></section>`;
});
