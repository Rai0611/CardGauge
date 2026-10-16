const canvas = document.querySelector("#card-canvas");
const context = canvas.getContext("2d");
const canvasWrap = document.querySelector("#canvas-wrap");
const uploadInput = document.querySelector("#image-upload");
const emptyState = document.querySelector("#empty-state");

const companies = {
  psa: {
    name: "PSA",
    target: "PSA 10 centering target",
    front: 45,
    back: 25,
    description: "Front: 55/45 · Back: 75/25",
  },
  bgs: {
    name: "BGS",
    target: "BGS Pristine 10 centering target",
    front: 50,
    back: 40,
    description: "Front: 50/50 · Back: 60/40",
  },
  cgc: {
    name: "CGC",
    target: "CGC Gem Mint 10 centering target",
    front: 45,
    back: 25,
    description: "Front: approx. 55/45 · Back: 75/25",
  },
  sgc: {
    name: "SGC",
    target: "SGC 10 estimated centering target",
    front: 45,
    back: 25,
    description: "Front: 55/45 · Back: 75/25",
  },
  tag: {
    name: "TAG",
    target: "TAG centering reference",
    front: null,
    back: null,
    description: "No TAG-specific numeric cutoff configured",
  },
};

const state = {
  image: null,
  imageUrl: null,
  company: "psa",
  side: "front",
  guide: "card",
  cardRect: null,
  artRect: null,
  dragStart: null,
  dragRect: null,
  display: null,
};

const statusText = document.querySelector("#status-text");
const resultStatus = document.querySelector("#result-status");
const targetCheck = document.querySelector("#target-check");
const canvasHelp = document.querySelector("#canvas-help");

function getDisplayRect() {
  if (!state.image) return null;
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(bounds.width / state.image.naturalWidth, bounds.height / state.image.naturalHeight);
  const width = state.image.naturalWidth * scale;
  const height = state.image.naturalHeight * scale;
  return {
    left: (bounds.width - width) / 2,
    top: (bounds.height - height) / 2,
    width,
    height,
    scale,
  };
}

function rectToCanvas(rect, display) {
  return {
    x: display.left + rect.x * display.scale,
    y: display.top + rect.y * display.scale,
    width: rect.width * display.scale,
    height: rect.height * display.scale,
  };
}

function drawGuide(rect, display, color, label) {
  if (!rect) return;
  const drawn = rectToCanvas(rect, display);
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.setLineDash(label === "CARD" ? [] : [7, 5]);
  context.strokeRect(drawn.x, drawn.y, drawn.width, drawn.height);
  context.fillStyle = color;
  context.font = "600 10px sans-serif";
  const labelWidth = context.measureText(label).width + 12;
  context.fillRect(drawn.x, drawn.y - 19, labelWidth, 19);
  context.fillStyle = "#111614";
  context.fillText(label, drawn.x + 6, drawn.y - 6);
  context.restore();
}

function render() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * pixelRatio);
  canvas.height = Math.round(bounds.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (!state.image) return;

  const display = getDisplayRect();
  state.display = display;
  context.drawImage(state.image, display.left, display.top, display.width, display.height);
  drawGuide(state.cardRect, display, "#9de5b4", "CARD");
  drawGuide(state.artRect, display, "#e5b76a", "PRINT");
  drawGuide(state.dragRect, display, state.guide === "card" ? "#9de5b4" : "#e5b76a", "DRAG");
}

function setStatus(message, result = "") {
  statusText.textContent = message;
  resultStatus.className = `result-status${result ? ` ${result}` : ""}`;
}

function getAxisRatio(a, b) {
  const total = a + b;
  if (total <= 0) return null;
  const smaller = (Math.min(a, b) / total) * 100;
  const larger = 100 - smaller;
  return { smaller, larger };
}

function ratioLabel(ratio) {
  return `${Math.round(ratio.larger)}/${Math.round(ratio.smaller)}`;
}

function updateMeasurements() {
  const horizontalValue = document.querySelector("#horizontal-ratio");
  const verticalValue = document.querySelector("#vertical-ratio");
  const horizontalBar = document.querySelector("#horizontal-bar");
  const verticalBar = document.querySelector("#vertical-bar");
  const horizontalDetail = document.querySelector("#horizontal-detail");
  const verticalDetail = document.querySelector("#vertical-detail");
  const config = companies[state.company];
  const limit = config[state.side];

  document.querySelector("#target-name").textContent = config.target;
  document.querySelector("#target-description").textContent = config.description;
  targetCheck.className = "target-check";

  if (!state.cardRect || !state.artRect) {
    horizontalValue.textContent = "— / —";
    verticalValue.textContent = "— / —";
    horizontalBar.style.width = "0";
    verticalBar.style.width = "0";
    horizontalDetail.textContent = "Mark the card and printed area to measure";
    verticalDetail.textContent = "Mark the card and printed area to measure";
    targetCheck.innerHTML = "<span aria-hidden=\"true\">◌</span><span>Waiting for measurements</span>";
    setStatus(state.image ? "Mark both guides to see your estimate" : "Add a photo to begin");
    return;
  }

  const left = Math.max(0, state.artRect.x - state.cardRect.x);
  const right = Math.max(0, state.cardRect.x + state.cardRect.width - state.artRect.x - state.artRect.width);
  const top = Math.max(0, state.artRect.y - state.cardRect.y);
  const bottom = Math.max(0, state.cardRect.y + state.cardRect.height - state.artRect.y - state.artRect.height);
  const horizontal = getAxisRatio(left, right);
  const vertical = getAxisRatio(top, bottom);

  if (!horizontal || !vertical) {
    horizontalValue.textContent = "— / —";
    verticalValue.textContent = "— / —";
    horizontalBar.style.width = "0";
    verticalBar.style.width = "0";
    horizontalDetail.textContent = "Printed area must sit inside the card guides";
    verticalDetail.textContent = "Printed area must sit inside the card guides";
    targetCheck.innerHTML = "<span aria-hidden=\"true\">!</span><span>Adjust the printed-area guide</span>";
    setStatus("Printed-area guide must be inside the card");
    return;
  }

  horizontalValue.textContent = ratioLabel(horizontal);
  verticalValue.textContent = ratioLabel(vertical);
  if (limit === null) {
    horizontalBar.style.width = `${horizontal.smaller}%`;
    verticalBar.style.width = `${vertical.smaller}%`;
    horizontalDetail.textContent = `Left ${Math.round((left / (left + right)) * 100)}% · Right ${Math.round((right / (left + right)) * 100)}%`;
    verticalDetail.textContent = `Top ${Math.round((top / (top + bottom)) * 100)}% · Bottom ${Math.round((bottom / (top + bottom)) * 100)}%`;
    targetCheck.innerHTML = "<span aria-hidden=\"true\">i</span><span>Ratios shown; no TAG-specific cutoff configured</span>";
    setStatus("Centering ratios measured · no TAG cutoff");
    return;
  }
  horizontalBar.style.width = `${Math.min(100, horizontal.smaller / limit * 100)}%`;
  verticalBar.style.width = `${Math.min(100, vertical.smaller / limit * 100)}%`;
  horizontalDetail.textContent = `Left ${Math.round((left / (left + right)) * 100)}% · Right ${Math.round((right / (left + right)) * 100)}%`;
  verticalDetail.textContent = `Top ${Math.round((top / (top + bottom)) * 100)}% · Bottom ${Math.round((bottom / (top + bottom)) * 100)}%`;

  const passes = horizontal.smaller >= limit && vertical.smaller >= limit;
  const targetLabel = state.side === "front"
    ? `${100 - config.front}/${config.front}`
    : `${100 - config.back}/${config.back}`;
  targetCheck.className = `target-check ${passes ? "pass" : "fail"}`;
  targetCheck.innerHTML = passes
    ? `<span aria-hidden="true">✓</span><span>Within ${targetLabel} centering target on this side</span>`
    : `<span aria-hidden="true">!</span><span>Outside ${targetLabel} centering target on this side</span>`;
  setStatus(passes ? "Within the centering target" : "Outside the centering target", passes ? "pass" : "fail");
}

function setGuide(guide) {
  state.guide = guide;
  document.querySelectorAll(".guide-button").forEach((button) => {
    const selected = button.dataset.guide === guide;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  canvasHelp.textContent = guide === "card"
    ? "Drag a rectangle around the card’s outer edges."
    : "Drag a rectangle around the printed area, inside the card guide.";
}

function updateGuideStatus() {
  document.querySelector("#card-status").textContent = state.cardRect ? "✓" : "1";
  document.querySelector("#art-status").textContent = state.artRect ? "✓" : "2";
  document.querySelector('[data-guide="card"]').classList.toggle("done", Boolean(state.cardRect));
  document.querySelector('[data-guide="art"]').classList.toggle("done", Boolean(state.artRect));
  document.querySelector("#reset-guides").disabled = !state.cardRect && !state.artRect;
}

function getPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  const display = getDisplayRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (!display || x < display.left || y < display.top ||
      x > display.left + display.width || y > display.top + display.height) return null;
  return {
    x: (x - display.left) / display.scale,
    y: (y - display.top) / display.scale,
  };
}

function rectFromPoints(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    x: left,
    y: top,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function isInside(inner, outer) {
  const tolerance = 2;
  return inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance;
}

canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  const point = getPoint(event);
  if (!point) return;
  state.dragStart = point;
  state.dragRect = rectFromPoints(point, point);
  canvas.setPointerCapture(event.pointerId);
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.dragStart) return;
  const point = getPoint(event);
  if (!point) return;
  state.dragRect = rectFromPoints(state.dragStart, point);
  render();
});

canvas.addEventListener("pointerup", (event) => {
  if (!state.dragStart) return;
  const point = getPoint(event);
  if (point) state.dragRect = rectFromPoints(state.dragStart, point);
  const rect = state.dragRect;
  state.dragStart = null;
  state.dragRect = null;

  if (rect && rect.width > 5 && rect.height > 5) {
    if (state.guide === "card") {
      state.cardRect = rect;
      state.artRect = null;
      setGuide("art");
    } else if (state.cardRect && isInside(rect, state.cardRect)) {
      state.artRect = rect;
    } else {
      canvasHelp.textContent = "Printed area must fit inside the card guide. Try drawing it again.";
    }
  }
  updateGuideStatus();
  render();
  updateMeasurements();
});

document.querySelectorAll(".guide-button").forEach((button) => {
  button.addEventListener("click", () => setGuide(button.dataset.guide));
});

document.querySelectorAll(".company-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.company = button.dataset.company;
    document.querySelectorAll(".company-button").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    updateMeasurements();
  });
});

document.querySelectorAll(".side-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.side = button.dataset.side;
    document.querySelectorAll(".side-button").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    updateMeasurements();
  });
});

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Please choose a supported image file");
    return;
  }
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.cardRect = null;
    state.artRect = null;
    canvasWrap.classList.add("has-image");
    updateGuideStatus();
    setGuide("card");
    render();
    updateMeasurements();
  };
  image.onerror = () => {
    URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = null;
    setStatus("Could not read that image. Please try another file.");
  };
  image.src = state.imageUrl;
}

uploadInput.addEventListener("change", () => loadImage(uploadInput.files[0]));

canvasWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
  canvasWrap.classList.add("is-dragging");
});

canvasWrap.addEventListener("dragleave", () => canvasWrap.classList.remove("is-dragging"));
canvasWrap.addEventListener("drop", (event) => {
  event.preventDefault();
  canvasWrap.classList.remove("is-dragging");
  loadImage(event.dataTransfer.files[0]);
});

document.querySelector("#reset-guides").addEventListener("click", () => {
  state.cardRect = null;
  state.artRect = null;
  updateGuideStatus();
  setGuide("card");
  render();
  updateMeasurements();
});

window.addEventListener("resize", render);
window.addEventListener("beforeunload", () => {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
});

updateGuideStatus();
updateMeasurements();
