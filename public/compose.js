// Client-side photo composition. Takes one or more captured images plus a
// caption / reference text and paints a shareable proof image on a <canvas>.
// Four layouts map to the quest "composition" field:
//   caption       - single photo, caption bar along the bottom
//   side-by-side  - quest reference panel beside the captured photo
//   collage       - grid of photos for multi-shot "set" quests
//   plain         - the photo, lightly framed, no caption furniture

const CANVAS_WIDTH = 1080;
const BRAND_TOP = "#0ea5e9";
const BRAND_BOTTOM = "#4f46e5";

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// draw an image scaled to "cover" the target box (crop overflow)
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Compose a proof image.
 * @param {Object} opts
 * @param {string} opts.mode - caption | side-by-side | collage | plain
 * @param {HTMLImageElement[]} opts.images - loaded images (>=1)
 * @param {string} [opts.caption]
 * @param {string} [opts.title] - quest title, shown as a small badge
 * @param {string} [opts.reference] - reference text for side-by-side
 * @returns {{ canvas: HTMLCanvasElement, dataUrl: string }}
 */
export function composeProof({ mode = "plain", images = [], caption = "", title = "", reference = "" }) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const W = CANVAS_WIDTH;
  const pad = 36;

  if (mode === "collage" && images.length > 1) {
    const cols = images.length <= 2 ? 1 : 2;
    const rows = Math.ceil(images.length / cols);
    const cell = (W - pad * (cols + 1)) / cols;
    const gridH = rows * cell + pad * (rows + 1);
    canvas.width = W;
    canvas.height = gridH + 150;
    paintBackground(ctx, canvas.width, canvas.height);
    images.forEach((img, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = pad + c * (cell + pad);
      const y = pad + r * (cell + pad);
      ctx.save();
      roundRect(ctx, x, y, cell, cell, 26);
      ctx.clip();
      drawCover(ctx, img, x, y, cell, cell);
      ctx.restore();
    });
    paintCaptionBar(ctx, canvas, caption, title, gridH);
    return finish(canvas);
  }

  const img = images[0];
  if (!img) {
    canvas.width = W;
    canvas.height = 320;
    paintBackground(ctx, W, canvas.height);
    paintCaptionBar(ctx, canvas, caption || "No photo captured", title, 0);
    return finish(canvas);
  }

  const aspect = img.height / img.width;

  if (mode === "side-by-side") {
    const photoH = Math.round((W * aspect) / 1.2);
    canvas.width = W;
    canvas.height = photoH + 230;
    paintBackground(ctx, W, canvas.height);
    const half = (W - pad * 3) / 2;
    // reference panel
    ctx.save();
    roundRect(ctx, pad, pad, half, photoH, 26);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#4f46e5";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText("Reference", pad + 28, pad + 54);
    ctx.fillStyle = "#334155";
    ctx.font = "400 28px system-ui, sans-serif";
    wrapText(ctx, reference || title || "Match this prompt", half - 56).slice(0, 8).forEach((line, i) => {
      ctx.fillText(line, pad + 28, pad + 104 + i * 38);
    });
    // captured photo
    ctx.save();
    roundRect(ctx, pad * 2 + half, pad, half, photoH, 26);
    ctx.clip();
    drawCover(ctx, img, pad * 2 + half, pad, half, photoH);
    ctx.restore();
    paintCaptionBar(ctx, canvas, caption, title, photoH);
    return finish(canvas);
  }

  // caption + plain share the single-photo layout; plain just omits the bar.
  const photoH = Math.round(W * aspect);
  const barH = mode === "plain" ? pad : 0;
  canvas.width = W;
  canvas.height = photoH + (mode === "plain" ? pad * 2 : 200);
  paintBackground(ctx, W, canvas.height);
  ctx.save();
  roundRect(ctx, pad, pad, W - pad * 2, photoH - pad, 30);
  ctx.clip();
  drawCover(ctx, img, pad, pad, W - pad * 2, photoH - pad);
  ctx.restore();
  if (mode !== "plain") {
    paintCaptionBar(ctx, canvas, caption, title, photoH - pad);
  }
  void barH;
  return finish(canvas);
}

function paintBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#f0f9ff");
  grad.addColorStop(1, "#eef2ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function paintCaptionBar(ctx, canvas, caption, title, topOffset) {
  const W = canvas.width;
  const pad = 36;
  const barTop = topOffset + pad;
  const grad = ctx.createLinearGradient(0, barTop, W, barTop);
  grad.addColorStop(0, BRAND_TOP);
  grad.addColorStop(1, BRAND_BOTTOM);
  ctx.fillStyle = grad;
  roundRect(ctx, pad, barTop, W - pad * 2, canvas.height - barTop - pad, 26);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "800 24px system-ui, sans-serif";
  if (title) ctx.fillText(title.toUpperCase(), pad + 30, barTop + 44);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 34px system-ui, sans-serif";
  const lines = wrapText(ctx, caption || "", W - pad * 2 - 60).slice(0, 3);
  lines.forEach((line, i) => {
    ctx.fillText(line, pad + 30, barTop + (title ? 92 : 60) + i * 44);
  });
}

function finish(canvas) {
  return { canvas, dataUrl: canvas.toDataURL("image/jpeg", 0.82) };
}
