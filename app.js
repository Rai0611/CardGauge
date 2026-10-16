const canvas = document.querySelector("#card-canvas");
const context = canvas.getContext("2d");
const canvasWrap = document.querySelector("#canvas-wrap");
const uploadInput = document.querySelector("#image-upload");
const detectionDialog = document.querySelector("#detection-dialog");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomInButton = document.querySelector("#zoom-in");
const zoomResetButton = document.querySelector("#zoom-reset");
const panToggleButton = document.querySelector("#pan-toggle");
const zoomLevel = document.querySelector("#zoom-level");

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
  panStart: null,
  panOrigin: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  panMode: false,
  display: null,
};

const statusText = document.querySelector("#status-text");
const resultStatus = document.querySelector("#result-status");
const targetCheck = document.querySelector("#target-check");
const canvasHelp = document.querySelector("#canvas-help");

function getDisplayRect() {
  if (!state.image) return null;
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(bounds.width / state.image.naturalWidth, bounds.height / state.image.naturalHeight) * state.zoom;
  const width = state.image.naturalWidth * scale;
  const height = state.image.naturalHeight * scale;
  return {
    left: (bounds.width - width) / 2 + state.panX,
    top: (bounds.height - height) / 2 + state.panY,
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

function updateZoomControls() {
  zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  zoomOutButton.disabled = !state.image || state.zoom <= 1;
  zoomInButton.disabled = !state.image || state.zoom >= 4;
  zoomResetButton.disabled = !state.image || (state.zoom === 1 && state.panX === 0 && state.panY === 0);
  panToggleButton.disabled = !state.image || state.zoom <= 1;
  if (panToggleButton.disabled) state.panMode = false;
  panToggleButton.classList.toggle("selected", state.panMode);
  panToggleButton.setAttribute("aria-pressed", String(state.panMode));
}

function setZoom(zoom) {
  state.zoom = Math.max(1, Math.min(4, zoom));
  if (state.zoom === 1) {
    state.panX = 0;
    state.panY = 0;
  }
  updateZoomControls();
  render();
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getImagePixels(image, maxDimension = 320) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0, width, height);
  const { data } = sampleContext.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);

  for (let pixel = 0, offset = 0; pixel < gray.length; pixel++, offset += 4) {
    gray[pixel] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }

  return { gray, width, height, scale };
}

function makeEdgeProfiles(pixels, bounds) {
  const { gray, width, height } = pixels;
  const xProfile = new Float32Array(width);
  const yProfile = new Float32Array(height);
  const xStart = Math.floor(bounds.y + bounds.height * 0.12);
  const xEnd = Math.ceil(bounds.y + bounds.height * 0.88);
  const yStart = Math.floor(bounds.x + bounds.width * 0.12);
  const yEnd = Math.ceil(bounds.x + bounds.width * 0.88);

  for (let x = 1; x < width - 1; x++) {
    let sum = 0;
    let count = 0;
    for (let y = xStart; y < xEnd; y += 2) {
      sum += Math.abs(gray[y * width + x + 1] - gray[y * width + x - 1]);
      count++;
    }
    xProfile[x] = count ? sum / count : 0;
  }

  for (let y = 1; y < height - 1; y++) {
    let sum = 0;
    let count = 0;
    for (let x = yStart; x < yEnd; x += 2) {
      sum += Math.abs(gray[(y + 1) * width + x] - gray[(y - 1) * width + x]);
      count++;
    }
    yProfile[y] = count ? sum / count : 0;
  }

  return { xProfile, yProfile };
}

function strongestPositions(profile, minimum, maximum, count = 18) {
  const peaks = [];
  for (let position = Math.ceil(minimum); position <= Math.floor(maximum); position++) {
    const score = profile[position];
    if (score >= (profile[position - 1] || 0) && score >= (profile[position + 1] || 0)) {
      peaks.push({ position, score });
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const peak of peaks) {
    if (selected.every((item) => Math.abs(item.position - peak.position) >= 3)) {
      selected.push(peak);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function detectOuterRectangle(pixels) {
  const { width, height, scale } = pixels;
  const profiles = makeEdgeProfiles(pixels, { x: 0, y: 0, width, height });
  const leftEdges = strongestPositions(profiles.xProfile, width * 0.01, width * 0.42);
  const rightEdges = strongestPositions(profiles.xProfile, width * 0.58, width * 0.99);
  const topEdges = strongestPositions(profiles.yProfile, height * 0.01, height * 0.42);
  const bottomEdges = strongestPositions(profiles.yProfile, height * 0.58, height * 0.99);
  let best = null;

  for (const left of leftEdges) {
    for (const right of rightEdges) {
      for (const top of topEdges) {
        for (const bottom of bottomEdges) {
          const boxWidth = right.position - left.position;
          const boxHeight = bottom.position - top.position;
          if (boxWidth < width * 0.35 || boxHeight < height * 0.35) continue;
          const aspectRatio = boxWidth / boxHeight;
          if (aspectRatio < 0.52 || aspectRatio > 0.88) continue;
          const aspectPenalty = Math.abs(aspectRatio - 0.714) * 90;
          const score = left.score + right.score + top.score + bottom.score - aspectPenalty;
          if (!best || score > best.score) {
            best = { x: left.position, y: top.position, width: boxWidth, height: boxHeight, score };
          }
        }
      }
    }
  }

  if (!best) {
    const boxWidth = Math.min(width * 0.88, height * 0.714 * 0.88);
    const boxHeight = boxWidth / 0.714;
    best = { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight };
  }

  return {
    x: best.x / scale,
    y: best.y / scale,
    width: best.width / scale,
    height: best.height / scale,
  };
}

function detectInnerRectangle(pixels, outer) {
  const { width, height, scale } = pixels;
  const scaledOuter = {
    x: outer.x * scale,
    y: outer.y * scale,
    width: outer.width * scale,
    height: outer.height * scale,
  };
  const profiles = makeEdgeProfiles(pixels, scaledOuter);
  const findInsetPair = (profile, start, length) => {
    const low = Math.ceil(start + length * 0.035);
    const high = Math.floor(start + length * 0.30);
    let best = null;
    for (let first = low; first <= high; first++) {
      for (let second = Math.ceil(start + length * 0.70); second <= Math.floor(start + length * 0.965); second++) {
        const leftInset = (first - start) / length;
        const rightInset = (start + length - second) / length;
        const balancePenalty = Math.abs(leftInset - rightInset) * 16;
        const expectedInsetPenalty = Math.abs((leftInset + rightInset) / 2 - 0.09) * 5;
        const score = profile[first] + profile[second] - balancePenalty - expectedInsetPenalty;
        if (!best || score > best.score) best = { first, second, score };
      }
    }
    return best;
  };

  const xEdges = findInsetPair(profiles.xProfile, scaledOuter.x, scaledOuter.width);
  const yEdges = findInsetPair(profiles.yProfile, scaledOuter.y, scaledOuter.height);
  const minimumInset = 0.035;
  const maximumInset = 0.30;
  const cardRect = {
    x: scaledOuter.x,
    y: scaledOuter.y,
    width: scaledOuter.width,
    height: scaledOuter.height,
  };
  const inner = xEdges && yEdges
    ? {
        x: xEdges.first,
        y: yEdges.first,
        width: xEdges.second - xEdges.first,
        height: yEdges.second - yEdges.first,
      }
    : null;

  if (!inner || inner.width <= 0 || inner.height <= 0 ||
      !isInside(inner, cardRect) ||
      (inner.x - cardRect.x) / cardRect.width < minimumInset ||
      (inner.x - cardRect.x) / cardRect.width > maximumInset ||
      (inner.y - cardRect.y) / cardRect.height < minimumInset ||
      (inner.y - cardRect.y) / cardRect.height > maximumInset) {
    return {
      x: outer.x + outer.width * 0.09,
      y: outer.y + outer.height * 0.09,
      width: outer.width * 0.82,
      height: outer.height * 0.82,
    };
  }

  return {
    x: inner.x / scale,
    y: inner.y / scale,
    width: inner.width / scale,
    height: inner.height / scale,
  };
}

function detectGuides(image) {
  const pixels = getImagePixels(image);
  const cardRect = detectOuterRectangle(pixels);
  const artRect = detectInnerRectangle(pixels, cardRect);
  return { cardRect, artRect };
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
    ? "Drag to redraw the card edges. Redrawing this guide clears the printed-area guide."
    : "Drag to redraw the printed area, inside the card guide. Zoom in for precision.";
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
  if (!display || x < Math.max(0, display.left) || y < Math.max(0, display.top) ||
      x > Math.min(bounds.width, display.left + display.width) ||
      y > Math.min(bounds.height, display.top + display.height)) return null;
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
  if ((event.shiftKey || state.panMode) && state.zoom > 1) {
    state.panStart = { x: event.clientX, y: event.clientY };
    state.panOrigin = { x: state.panX, y: state.panY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  const point = getPoint(event);
  if (!point) return;
  state.dragStart = point;
  state.dragRect = rectFromPoints(point, point);
  canvas.setPointerCapture(event.pointerId);
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (state.panStart) {
    const bounds = canvas.getBoundingClientRect();
    const display = getDisplayRect();
    const maxPanX = Math.max(0, (display.width - bounds.width) / 2);
    const maxPanY = Math.max(0, (display.height - bounds.height) / 2);
    state.panX = clamp(state.panOrigin.x + event.clientX - state.panStart.x, -maxPanX, maxPanX);
    state.panY = clamp(state.panOrigin.y + event.clientY - state.panStart.y, -maxPanY, maxPanY);
    render();
    return;
  }
  if (!state.dragStart) return;
  const point = getPoint(event);
  if (!point) return;
  state.dragRect = rectFromPoints(state.dragStart, point);
  render();
});

canvas.addEventListener("pointerup", (event) => {
  if (state.panStart) {
    state.panStart = null;
    state.panOrigin = null;
    canvas.style.cursor = "";
    return;
  }
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

canvas.addEventListener("pointercancel", () => {
  state.panStart = null;
  state.panOrigin = null;
  state.dragStart = null;
  state.dragRect = null;
  canvas.style.cursor = "";
  render();
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
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    canvasWrap.classList.add("has-image");
    updateZoomControls();
    render();
    try {
      const guides = detectGuides(image);
      state.cardRect = guides.cardRect;
      state.artRect = guides.artRect;
      updateGuideStatus();
      setGuide("art");
      render();
      updateMeasurements();
      detectionDialog.showModal();
    } catch (error) {
      state.cardRect = null;
      state.artRect = null;
      console.error("Automatic card guide detection failed.", error);
      updateGuideStatus();
      setGuide("card");
      updateMeasurements();
      setStatus("Could not auto-detect guides. Draw them manually.");
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(state.imageUrl);
    state.imageUrl = null;
    setStatus("Could not read that image. Please try another file.");
  };
  image.src = state.imageUrl;
}

uploadInput.addEventListener("change", () => loadImage(uploadInput.files[0]));

zoomOutButton.addEventListener("click", () => setZoom(state.zoom - 0.25));
zoomInButton.addEventListener("click", () => setZoom(state.zoom + 0.25));
zoomResetButton.addEventListener("click", () => setZoom(1));
panToggleButton.addEventListener("click", () => {
  state.panMode = !state.panMode;
  updateZoomControls();
});

document.querySelector("#confirm-guides").addEventListener("click", () => {
  detectionDialog.close();
  setGuide("art");
});

document.querySelector("#adjust-guides").addEventListener("click", () => {
  detectionDialog.close();
  setGuide("card");
});

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

window.addEventListener("resize", () => {
  const display = getDisplayRect();
  if (display) {
    const bounds = canvas.getBoundingClientRect();
    state.panX = clamp(state.panX, -Math.max(0, (display.width - bounds.width) / 2), Math.max(0, (display.width - bounds.width) / 2));
    state.panY = clamp(state.panY, -Math.max(0, (display.height - bounds.height) / 2), Math.max(0, (display.height - bounds.height) / 2));
  }
  updateZoomControls();
  render();
});
window.addEventListener("beforeunload", () => {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
});

updateGuideStatus();
updateMeasurements();
updateZoomControls();
