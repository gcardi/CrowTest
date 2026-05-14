const canvas = document.getElementById("fieldCanvas");
const ctx = canvas.getContext("2d");
const heatCanvas = document.createElement("canvas");
const heatCtx = heatCanvas.getContext("2d");

const statusEl = document.getElementById("connectionStatus");
const sampleReadout = document.getElementById("sampleReadout");
const gridReadout = document.getElementById("gridReadout");
const addButton = document.getElementById("addMagnet");
const removeButton = document.getElementById("removeMagnet");
const resetButton = document.getElementById("resetScene");
const showLinesInput = document.getElementById("showLines");
const angleInput = document.getElementById("angleInput");
const strengthInput = document.getElementById("strengthInput");
const sizeInput = document.getElementById("sizeInput");
const resolutionInput = document.getElementById("resolutionInput");
const contrastInput = document.getElementById("contrastInput");
const angleValue = document.getElementById("angleValue");
const strengthValue = document.getElementById("strengthValue");
const sizeValue = document.getElementById("sizeValue");
const contrastValue = document.getElementById("contrastValue");

const formatAngle = (rad) => `${Math.round(rad * 180 / Math.PI)}°`;
const formatStrength = (v) => Number(v).toFixed(1);
const formatSize = (v) => Number(v).toFixed(2);
const formatContrast = (v) => Number(v).toFixed(2);

const state = {
    worldWidth: 4,
    worldHeight: 3,
    resolution: 128,
    selectedId: 1,
    field: null,
    drag: null,
    needsRender: true,
    magnets: [
        { id: 1, x: -0.75, y: 0, angle: 0, strength: 4.2, size: 0.18 },
        { id: 2, x: 0.75, y: 0, angle: Math.PI, strength: 4.2, size: 0.18 }
    ]
};

function selectedMagnet() {
    return state.magnets.find((magnet) => magnet.id === state.selectedId) || state.magnets[0];
}

function syncControls() {
    const magnet = selectedMagnet();
    if (!magnet) {
        return;
    }

    angleInput.value = Math.round(magnet.angle * 180 / Math.PI);
    strengthInput.value = magnet.strength;
    sizeInput.value = magnet.size;
    angleValue.textContent = formatAngle(magnet.angle);
    strengthValue.textContent = formatStrength(magnet.strength);
    sizeValue.textContent = formatSize(magnet.size);
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.needsRender = true;
}

function worldToScreen(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x / state.worldWidth + 0.5) * rect.width,
        y: (0.5 - y / state.worldHeight) * rect.height
    };
}

function screenToWorld(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x / rect.width - 0.5) * state.worldWidth,
        y: (0.5 - y / rect.height) * state.worldHeight
    };
}

function computeField() {
    const width = state.resolution;
    const height = state.resolution;
    const worldWidth = state.worldWidth;
    const worldHeight = state.worldHeight;
    const magnets = state.magnets;
    const values = new Array(width * height);
    const halfW = worldWidth * 0.5;
    const halfH = worldHeight * 0.5;
    let maxMagnitude = 0;

    for (let row = 0; row < height; row += 1) {
        const y = halfH - (worldHeight * row) / (height - 1);

        for (let col = 0; col < width; col += 1) {
            const x = -halfW + (worldWidth * col) / (width - 1);
            let bx = 0;
            let by = 0;

            for (const magnet of magnets) {
                const dx = x - magnet.x;
                const dy = y - magnet.y;
                const mx = Math.cos(magnet.angle) * magnet.strength;
                const my = Math.sin(magnet.angle) * magnet.strength;
                const softening = Math.max(0.025, magnet.size * 0.45);
                const r2 = dx * dx + dy * dy + softening * softening;
                const invR = 1 / Math.sqrt(r2);
                const invR3 = invR * invR * invR;
                const invR5 = invR3 / r2;
                const dot = mx * dx + my * dy;

                bx += 3 * dx * dot * invR5 - mx * invR3;
                by += 3 * dy * dot * invR5 - my * invR3;
            }

            const magnitude = Math.hypot(bx, by);
            values[row * width + col] = [bx, by, magnitude];
            if (magnitude > maxMagnitude) {
                maxMagnitude = magnitude;
            }
        }
    }

    return { width, height, worldWidth, worldHeight, maxMagnitude, values };
}

function scheduleFieldRequest() {
    state.field = computeField();
    gridReadout.textContent = `${state.field.width} x ${state.field.height}`;
    buildHeatmap();
    state.needsRender = true;
}

function palette(t) {
    const stops = [
        [12, 13, 13],
        [36, 48, 54],
        [32, 137, 139],
        [242, 201, 76],
        [240, 108, 69],
        [250, 245, 229]
    ];
    const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = stops[index];
    const b = stops[index + 1];
    return [
        Math.round(a[0] + (b[0] - a[0]) * local),
        Math.round(a[1] + (b[1] - a[1]) * local),
        Math.round(a[2] + (b[2] - a[2]) * local)
    ];
}

function buildHeatmap() {
    const field = state.field;
    if (!field) {
        return;
    }

    heatCanvas.width = field.width;
    heatCanvas.height = field.height;
    const image = heatCtx.createImageData(field.width, field.height);
    const contrast = Number(contrastInput.value);
    const scale = Math.max(0.000001, field.maxMagnitude);

    for (let i = 0; i < field.values.length; i += 1) {
        const mag = field.values[i][2];
        const t = Math.log1p((mag / scale) * 18 * contrast) / Math.log1p(18 * contrast);
        const color = palette(t);
        const p = i * 4;
        image.data[p] = color[0];
        image.data[p + 1] = color[1];
        image.data[p + 2] = color[2];
        image.data[p + 3] = 255;
    }

    heatCtx.putImageData(image, 0, 0);
}

function sampleField(wx, wy) {
    const field = state.field;
    if (!field) {
        return null;
    }

    const gx = (wx / state.worldWidth + 0.5) * (field.width - 1);
    const gy = (0.5 - wy / state.worldHeight) * (field.height - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);

    if (x0 < 0 || y0 < 0 || x0 >= field.width - 1 || y0 >= field.height - 1) {
        return null;
    }

    const tx = gx - x0;
    const ty = gy - y0;
    const at = (x, y) => field.values[y * field.width + x];
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    const bx = a[0] * (1 - tx) * (1 - ty) + b[0] * tx * (1 - ty) + c[0] * (1 - tx) * ty + d[0] * tx * ty;
    const by = a[1] * (1 - tx) * (1 - ty) + b[1] * tx * (1 - ty) + c[1] * (1 - tx) * ty + d[1] * tx * ty;
    return { bx, by, mag: Math.hypot(bx, by) };
}

function traceLine(seedX, seedY, direction) {
    const points = [];
    let x = seedX;
    let y = seedY;
    const step = Math.min(state.worldWidth, state.worldHeight) / 120;

    for (let i = 0; i < 115; i += 1) {
        const field = sampleField(x, y);
        if (!field || field.mag < 0.00001) {
            break;
        }

        points.push(worldToScreen(x, y));
        x += direction * (field.bx / field.mag) * step;
        y += direction * (field.by / field.mag) * step;

        if (Math.abs(x) > state.worldWidth * 0.52 || Math.abs(y) > state.worldHeight * 0.52) {
            break;
        }
    }

    return points;
}

function drawFieldLines() {
    if (!showLinesInput.checked || !state.field) {
        return;
    }

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(246, 243, 234, 0.34)";

    const seedsX = 13;
    const seedsY = 9;
    for (let ix = 1; ix < seedsX; ix += 1) {
        for (let iy = 1; iy < seedsY; iy += 1) {
            const x = -state.worldWidth / 2 + state.worldWidth * ix / seedsX;
            const y = -state.worldHeight / 2 + state.worldHeight * iy / seedsY;
            const forward = traceLine(x, y, 1);
            const backward = traceLine(x, y, -1).reverse();
            const points = backward.concat(forward);

            if (points.length < 5) {
                continue;
            }

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (const point of points.slice(1)) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawMagnets() {
    for (const magnet of state.magnets) {
        const center = worldToScreen(magnet.x, magnet.y);
        const pixels = magnet.size / state.worldWidth * canvas.getBoundingClientRect().width;
        const length = Math.max(44, pixels * 3.4);
        const width = Math.max(18, pixels * 1.05);
        const selected = magnet.id === state.selectedId;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(-magnet.angle);
        ctx.lineWidth = selected ? 3 : 1.5;
        ctx.strokeStyle = selected ? "#f6f3ea" : "rgba(246, 243, 234, 0.72)";

        ctx.fillStyle = "#f06c45";
        ctx.fillRect(-length / 2, -width / 2, length / 2, width);
        ctx.fillStyle = "#3bc7c7";
        ctx.fillRect(0, -width / 2, length / 2, width);
        ctx.strokeRect(-length / 2, -width / 2, length, width);

        ctx.fillStyle = "#101112";
        ctx.font = "700 11px Segoe UI, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("S", -length / 4, 0);
        ctx.fillText("N", length / 4, 0);

        ctx.fillStyle = "#f2c94c";
        ctx.beginPath();
        ctx.arc(length / 2 + 16, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function render() {
    if (state.needsRender) {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);

        if (state.field) {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(heatCanvas, 0, 0, rect.width, rect.height);
        }

        drawFieldLines();
        drawMagnets();
        state.needsRender = false;
    }

    requestAnimationFrame(render);
}

function hitTest(screenX, screenY) {
    for (let i = state.magnets.length - 1; i >= 0; i -= 1) {
        const magnet = state.magnets[i];
        const center = worldToScreen(magnet.x, magnet.y);
        const dx = screenX - center.x;
        const dy = screenY - center.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 26) {
            return { magnet, mode: "move" };
        }

        const handle = worldToScreen(
            magnet.x + Math.cos(magnet.angle) * magnet.size * 1.9,
            magnet.y + Math.sin(magnet.angle) * magnet.size * 1.9
        );
        if (Math.hypot(screenX - handle.x, screenY - handle.y) < 22) {
            return { magnet, mode: "rotate" };
        }
    }
    return null;
}

canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    const hit = hitTest(event.offsetX, event.offsetY);
    if (!hit) {
        return;
    }

    state.selectedId = hit.magnet.id;
    state.drag = { mode: hit.mode, id: hit.magnet.id };
    syncControls();
    state.needsRender = true;
});

canvas.addEventListener("pointermove", (event) => {
    const pos = screenToWorld(event.offsetX, event.offsetY);

    if (!state.drag) {
        const field = sampleField(pos.x, pos.y);
        sampleReadout.textContent = `B = ${field ? field.mag.toFixed(3) : "0.000"}`;
        return;
    }

    const magnet = selectedMagnet();
    if (!magnet) {
        return;
    }

    if (state.drag.mode === "move") {
        magnet.x = Math.max(-state.worldWidth / 2, Math.min(state.worldWidth / 2, pos.x));
        magnet.y = Math.max(-state.worldHeight / 2, Math.min(state.worldHeight / 2, pos.y));
    } else {
        magnet.angle = Math.atan2(pos.y - magnet.y, pos.x - magnet.x);
    }

    syncControls();
    scheduleFieldRequest();
});

canvas.addEventListener("pointerup", () => {
    state.drag = null;
});

canvas.addEventListener("pointercancel", () => {
    state.drag = null;
});

function addMagnet(x = 0, y = 0) {
    const id = Math.max(0, ...state.magnets.map((magnet) => magnet.id)) + 1;
    state.magnets.push({ id, x, y, angle: 0, strength: 3.5, size: 0.16 });
    state.selectedId = id;
    syncControls();
    scheduleFieldRequest();
}

function removeSelectedMagnet() {
    if (state.magnets.length <= 1) {
        return;
    }
    state.magnets = state.magnets.filter((magnet) => magnet.id !== state.selectedId);
    state.selectedId = state.magnets[0].id;
    syncControls();
    scheduleFieldRequest();
}

function resetScene() {
    state.magnets = [
        { id: 1, x: -0.75, y: 0, angle: 0, strength: 4.2, size: 0.18 },
        { id: 2, x: 0.75, y: 0, angle: Math.PI, strength: 4.2, size: 0.18 }
    ];
    state.selectedId = 1;
    syncControls();
    scheduleFieldRequest();
}

addButton.addEventListener("click", () => addMagnet());
removeButton.addEventListener("click", removeSelectedMagnet);
resetButton.addEventListener("click", resetScene);
showLinesInput.addEventListener("change", () => {
    state.needsRender = true;
});

angleInput.addEventListener("input", () => {
    const magnet = selectedMagnet();
    magnet.angle = Number(angleInput.value) * Math.PI / 180;
    angleValue.textContent = formatAngle(magnet.angle);
    scheduleFieldRequest();
});

strengthInput.addEventListener("input", () => {
    const magnet = selectedMagnet();
    magnet.strength = Number(strengthInput.value);
    strengthValue.textContent = formatStrength(magnet.strength);
    scheduleFieldRequest();
});

sizeInput.addEventListener("input", () => {
    const magnet = selectedMagnet();
    magnet.size = Number(sizeInput.value);
    sizeValue.textContent = formatSize(magnet.size);
    scheduleFieldRequest();
});

resolutionInput.addEventListener("change", () => {
    state.resolution = Number(resolutionInput.value);
    scheduleFieldRequest();
});

contrastInput.addEventListener("input", () => {
    contrastValue.textContent = formatContrast(contrastInput.value);
    buildHeatmap();
    state.needsRender = true;
});

window.addEventListener("resize", resizeCanvas);

statusEl.textContent = "Local";
statusEl.className = "ready";
resizeCanvas();
syncControls();
scheduleFieldRequest();
render();
