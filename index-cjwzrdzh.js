// client/renderer.ts
var Z_SCALE = 1;
var RADIUS_FACTOR = 0.7;
var MARGIN_FACTOR = 0.15;
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

class Renderer {
  canvas;
  ctx;
  size;
  originX;
  originY;
  viewHeight;
  cells;
  edgeColor;
  cellFill;
  cellSelectedFill;
  bevelHighlight;
  bevelMid;
  bevelShadow;
  letterColor;
  letterSelectedColor;
  pathColor;
  clearedColor;
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.size = 0;
    this.originX = 0;
    this.originY = 0;
    this.viewHeight = 0;
    this.cells = [];
    this.edgeColor = cssVar("--base01");
    this.cellFill = cssVar("--cell-background");
    this.cellSelectedFill = cssVar("--base01");
    this.bevelHighlight = cssVar("--base1");
    this.bevelMid = cssVar("--base01");
    this.bevelShadow = cssVar("--base03");
    this.letterColor = cssVar("--cell-foreground");
    this.letterSelectedColor = cssVar("--base3");
    this.pathColor = cssVar("--blue");
    this.clearedColor = cssVar("--green");
  }
  setCells(cells) {
    this.cells = cells;
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || this.cells.length === 0)
      return;
    const dpr = window.devicePixelRatio || 1;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of this.cells) {
      const [ux, uy] = this.axialToUnit(cell.q, cell.r);
      minX = Math.min(minX, ux);
      maxX = Math.max(maxX, ux);
      minY = Math.min(minY, uy);
      maxY = Math.max(maxY, uy);
    }
    const pad = RADIUS_FACTOR + MARGIN_FACTOR;
    this.size = rect.width / (maxX - minX + pad * 2);
    this.originX = rect.width / 2 - (minX + maxX) / 2 * this.size;
    const gridHeight = (maxY - minY + pad * 2) * this.size * Z_SCALE;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = gridHeight * dpr;
    this.viewHeight = gridHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.originY = (pad - minY) * this.size * Z_SCALE;
  }
  project(wx, wy) {
    return {
      x: this.originX + wx,
      y: this.originY + wy * Z_SCALE
    };
  }
  axialToUnit(q, r) {
    const ux = 3 / 2 * q;
    const uy = Math.sqrt(3) / 2 * q + Math.sqrt(3) * r;
    return [ux, uy];
  }
  axialToPlane(q, r) {
    const [ux, uy] = this.axialToUnit(q, r);
    return [ux * this.size, uy * this.size];
  }
  projectAxial(q, r) {
    const [wx, wy] = this.axialToPlane(q, r);
    return this.project(wx, wy);
  }
  cellAtPixel(px, py, cells) {
    const wx = px - this.originX;
    const wy = (py - this.originY) / Z_SCALE;
    const radius = this.size * 0.75;
    for (const cell of cells) {
      const [cx, cy] = this.axialToPlane(cell.q, cell.r);
      const dx = wx - cx;
      const dw = wy - cy;
      if (dx * dx + dw * dw < radius * radius) {
        return cell.id;
      }
    }
    return;
  }
  drawEdges(centers, edges, yOffset) {
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.edgeColor;
    ctx.beginPath();
    for (const edge of edges) {
      const a = centers[edge.a];
      const b = centers[edge.b];
      ctx.moveTo(a.x, a.y + yOffset);
      ctx.lineTo(b.x, b.y + yOffset);
    }
    ctx.stroke();
  }
  hexVertex(radius, i) {
    const angle = Math.PI / 3 * i;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  }
  strokeBevel(radius, vertices, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.beginPath();
    const [sx, sy] = this.hexVertex(radius, vertices[0]);
    ctx.moveTo(sx, sy);
    for (let i = 1;i < vertices.length; i++) {
      const [x, y] = this.hexVertex(radius, vertices[i]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  hexPath(radius) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0;i < 6; i++) {
      const [x, y] = this.hexVertex(radius, i);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }
  drawCell(cell, p, yOffset, isSelected) {
    const ctx = this.ctx;
    const radius = this.size * RADIUS_FACTOR;
    ctx.save();
    ctx.transform(1, 0, 0, Z_SCALE, p.x, p.y + yOffset);
    this.hexPath(radius);
    ctx.fillStyle = isSelected ? this.cellSelectedFill : this.cellFill;
    ctx.fill();
    ctx.clip();
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.lineJoin = "miter";
    const lit = isSelected ? this.bevelShadow : this.bevelHighlight;
    const dark = isSelected ? this.bevelHighlight : this.bevelShadow;
    this.strokeBevel(radius, [3, 4, 5], lit);
    this.strokeBevel(radius, [2, 3], this.bevelMid);
    this.strokeBevel(radius, [5, 0], this.bevelMid);
    this.strokeBevel(radius, [0, 1, 2], dark);
    ctx.restore();
    ctx.save();
    ctx.transform(1, 0, 0, Z_SCALE, p.x, p.y + yOffset);
    ctx.fillStyle = isSelected ? this.letterSelectedColor : this.letterColor;
    ctx.font = `${this.size * 0.5}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.letter.toUpperCase(), 0, 0);
    ctx.restore();
  }
  drawCleared(elapsed, message) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const intro = Math.min(1, elapsed / 600);
    let scale;
    if (intro < 1) {
      scale = intro < 0.6 ? intro / 0.6 * 1.25 : 1.25 - (intro - 0.6) / 0.4 * 0.25;
    } else {
      scale = 1 + 0.06 * Math.sin((elapsed - 600) / 1600 * 2 * Math.PI);
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, intro / 0.6);
    ctx.fillStyle = this.clearedColor;
    ctx.font = `bold ${this.size * 1.2}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Cleared!", 0, 0);
    ctx.restore();
    if (message !== undefined) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, (elapsed - 400) / 400));
      ctx.fillStyle = this.letterColor;
      ctx.font = `${this.size * 0.4}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(message, w / 2, h / 2 + this.size * 1.2);
      ctx.restore();
    }
  }
  draw(cells, visibleEdges, selectedCells, activeCells, falling) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    const centers = cells.map((c) => this.projectAxial(c.q, c.r));
    this.drawEdges(centers, visibleEdges, 0);
    const drawOrder = [...cells].sort((a, b) => centers[a.id].y - centers[b.id].y);
    for (const cell of drawOrder) {
      if (!activeCells.has(cell.id))
        continue;
      const p = centers[cell.id];
      this.drawCell(cell, p, 0, selectedCells.includes(cell.id));
    }
    for (const item of falling) {
      this.drawEdges(centers, item.edges, item.offset);
      for (const id of item.cells) {
        this.drawCell(cells[id], centers[id], item.offset, false);
      }
    }
    if (selectedCells.length >= 2) {
      ctx.strokeStyle = this.pathColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const s = centers[selectedCells[0]];
      ctx.moveTo(s.x, s.y);
      for (let i = 1;i < selectedCells.length; i++) {
        const n = centers[selectedCells[i]];
        ctx.lineTo(n.x, n.y);
      }
      ctx.stroke();
    }
  }
}

// client/definitions.ts
class Definitions {
  map;
  constructor() {
    this.map = {};
  }
  get(word) {
    return this.map[word];
  }
  merge(chunk) {
    Object.assign(this.map, chunk);
  }
}

// client/dates.ts
var DAY_MS = 24 * 60 * 60 * 1000;
function dateString(utc) {
  return new Date(utc).toISOString().slice(0, 10);
}
function utcMidnight(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function puzzleUtc(utc, startUtc, total) {
  return startUtc + (utc - startUtc) / DAY_MS % total * DAY_MS;
}

// client/storage.ts
var COMPLETED_KEY = "completed";
var REVEALED_KEY = "revealed";
var PROGRESS_KEY = "progress";
function expandEntry(entry) {
  const [start, end] = entry.split("/");
  const startUtc = Date.parse(start);
  if (end === undefined) {
    return [startUtc];
  }
  const days = [];
  for (let utc = startUtc;utc <= Date.parse(end); utc += DAY_MS) {
    days.push(utc);
  }
  return days;
}
function compress(days) {
  const entries = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + DAY_MS) {
      j += 1;
    }
    if (i === j) {
      entries.push(dateString(days[i]));
    } else {
      entries.push(`${dateString(days[i])}/${dateString(days[j])}`);
    }
    i = j + 1;
  }
  return entries;
}
function reconcile(entries) {
  const days = [...new Set(entries.flatMap(expandEntry))].sort((a, b) => a - b);
  return compress(days);
}
function readEntries(key) {
  const raw = localStorage.getItem(key) ?? undefined;
  return raw === undefined ? [] : JSON.parse(raw);
}
function readDates(key) {
  return new Set(readEntries(key).flatMap(expandEntry).map(dateString));
}
function mark(key, date) {
  const entries = readEntries(key);
  entries.push(date);
  localStorage.setItem(key, JSON.stringify(reconcile(entries)));
}
function unmark(key, date) {
  const days = readEntries(key).flatMap(expandEntry).filter((utc) => dateString(utc) !== date);
  localStorage.setItem(key, JSON.stringify(reconcile(days.map(dateString))));
}
function completedDates() {
  return readDates(COMPLETED_KEY);
}
function markCompleted(date) {
  mark(COMPLETED_KEY, date);
}
function unmarkCompleted(date) {
  unmark(COMPLETED_KEY, date);
}
function revealedDates() {
  return readDates(REVEALED_KEY);
}
function markRevealed(date) {
  mark(REVEALED_KEY, date);
}
function loadProgress(date) {
  const raw = localStorage.getItem(PROGRESS_KEY) ?? undefined;
  if (raw === undefined) {
    return;
  }
  const progress = JSON.parse(raw);
  return progress.date === date ? progress : undefined;
}
function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}
function clearProgress() {
  localStorage.removeItem(PROGRESS_KEY);
}

// client/game.ts
var REVEAL_HOLD_MS = 1000;
function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

class Game {
  state;
  puzzle;
  date;
  clearedMessage;
  found;
  definitions;
  pendingDefinitions;
  renderer;
  previewEl;
  remainingEl;
  foundList;
  revealButton;
  resetButton;
  machine;
  animFrame;
  wonTime;
  isSwipe;
  falling;
  lastFrameTime;
  revealTimeouts;
  revealHoldTimeout;
  constructor(puzzle, date, clearedMessage, definitions, renderer, machine) {
    this.puzzle = puzzle;
    this.date = date;
    this.clearedMessage = clearedMessage;
    this.found = [];
    this.definitions = definitions;
    this.pendingDefinitions = [];
    this.renderer = renderer;
    this.machine = machine;
    this.previewEl = document.getElementById("preview");
    this.remainingEl = document.getElementById("remaining");
    this.foundList = document.querySelector("#found ul");
    this.revealButton = document.getElementById("reveal");
    this.resetButton = document.getElementById("reset");
    this.resetButton.addEventListener("click", () => {
      this.reset();
    });
    this.animFrame = 0;
    this.wonTime = 0;
    this.isSwipe = false;
    this.falling = [];
    this.lastFrameTime = 0;
    this.revealTimeouts = [];
    this.revealHoldTimeout = 0;
    this.state = null;
    this.revealButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!this.machine.is("playing"))
        return;
      this.revealButton.setPointerCapture(e.pointerId);
      this.revealButton.classList.add("holding");
      this.revealHoldTimeout = window.setTimeout(() => {
        this.cancelRevealHold();
        this.revealRemaining();
      }, REVEAL_HOLD_MS);
    });
    this.revealButton.addEventListener("pointerup", () => {
      this.cancelRevealHold();
    });
    this.revealButton.addEventListener("pointercancel", () => {
      this.cancelRevealHold();
    });
    this.revealButton.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
    this.load(puzzle);
  }
  load(puzzle) {
    this.puzzle = puzzle;
    this.state = {
      cells: puzzle.cells,
      words: puzzle.words,
      wordMap: new Map(puzzle.words.map((w) => [w.word, w])),
      fillerEdges: puzzle.fillerEdges,
      foundWords: new Set,
      bonusWords: new Set(puzzle.bonusWords),
      foundBonus: new Set,
      selectedCells: []
    };
    this.wonTime = 0;
    this.falling = [];
    for (const id of this.revealTimeouts) {
      clearTimeout(id);
    }
    this.revealTimeouts = [];
    this.cancelRevealHold();
    this.machine.transition({ kind: "playing" });
    this.foundList.innerHTML = "";
    this.pendingDefinitions = [];
    this.previewEl.textContent = "";
    this.found = [];
    this.restore();
    this.updateRemaining();
    this.renderer.setCells(puzzle.cells);
  }
  restore() {
    if (completedDates().has(this.date)) {
      for (const w of this.state.words) {
        this.state.foundWords.add(w.id);
        this.addFoundWord(w.word, false);
      }
      this.wonTime = performance.now();
      this.machine.transition({ kind: "won" });
      return;
    }
    const progress = loadProgress(this.date);
    if (progress !== undefined) {
      this.found = progress.found;
      for (const entry of this.found) {
        if (entry.bonus) {
          this.state.foundBonus.add(entry.word);
        } else {
          this.state.foundWords.add(this.state.wordMap.get(entry.word).id);
        }
        this.addFoundWord(entry.word, entry.bonus);
      }
    }
    if (revealedDates().has(this.date)) {
      this.revealRemaining();
    }
  }
  persist() {
    saveProgress({
      date: this.date,
      found: this.found
    });
  }
  start() {
    this.setupInput();
    this.frame();
  }
  frame() {
    const now = performance.now();
    const dt = this.lastFrameTime === 0 ? 0 : (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.updateFalling(dt);
    const visible = this.buildVisibleEdges();
    this.renderer.draw(this.state.cells, visible, this.state.selectedCells, this.activeCells(), this.falling);
    if (this.machine.is("won")) {
      this.renderer.drawCleared(now - this.wonTime, this.clearedMessage);
    }
    this.animFrame = requestAnimationFrame(() => this.frame());
  }
  updateFalling(dt) {
    const accel = this.renderer.size * 25;
    const limit = this.renderer.viewHeight + this.renderer.size;
    this.falling = this.falling.filter((f) => {
      f.vy += accel * dt;
      f.offset += f.vy * dt;
      return f.offset < limit;
    });
  }
  activeCells() {
    const active = new Set;
    for (const word of this.state.words) {
      if (this.state.foundWords.has(word.id))
        continue;
      for (const cid of word.cells) {
        active.add(cid);
      }
    }
    return active;
  }
  buildVisibleEdges() {
    if (this.machine.is("won"))
      return [];
    const edges = new Map;
    for (const word of this.state.words) {
      if (this.state.foundWords.has(word.id))
        continue;
      for (const edge of word.edges) {
        edges.set(edge.key, edge);
      }
    }
    return [...edges.values()];
  }
  setupInput() {
    const canvas = this.renderer.canvas;
    const cellAtEvent = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cellId = this.renderer.cellAtPixel(e.clientX - rect.left, e.clientY - rect.top, this.state.cells);
      if (cellId === undefined)
        return;
      if (!this.activeCells().has(cellId))
        return;
      return cellId;
    };
    const tryAdd = (cellId) => {
      const sel = this.state.selectedCells;
      const last = sel[sel.length - 1];
      const lastCell = this.state.cells[last];
      if (!lastCell.neighbors.includes(cellId))
        return false;
      const visible = this.buildVisibleEdges();
      const neededKey = edgeKey(last, cellId);
      return visible.some((e) => e.key === neededKey);
    };
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!this.machine.is("playing"))
        return;
      this.isSwipe = false;
      const cellId = cellAtEvent(e);
      if (cellId === undefined)
        return;
      const sel = this.state.selectedCells;
      if (sel.length === 0) {
        sel.push(cellId);
        this.updatePreview();
        return;
      }
      const lastIdx = sel.length - 1;
      if (cellId === sel[lastIdx]) {
        sel.pop();
        this.updatePreview();
        return;
      }
      const truncIdx = sel.indexOf(cellId);
      if (truncIdx !== -1) {
        sel.length = truncIdx + 1;
        this.updatePreview();
        return;
      }
      if (tryAdd(cellId)) {
        sel.push(cellId);
        this.updatePreview();
      } else {
        sel.length = 0;
        sel.push(cellId);
        this.updatePreview();
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.machine.is("playing"))
        return;
      if (this.state.selectedCells.length === 0)
        return;
      const cellId = cellAtEvent(e);
      if (cellId === undefined)
        return;
      const sel = this.state.selectedCells;
      if (sel.length >= 2 && cellId === sel[sel.length - 2]) {
        this.isSwipe = true;
        sel.pop();
        this.updatePreview();
        return;
      }
      if (sel.includes(cellId))
        return;
      if (!tryAdd(cellId))
        return;
      this.isSwipe = true;
      sel.push(cellId);
      this.updatePreview();
    });
    canvas.addEventListener("pointerup", () => {
      if (!this.machine.is("playing"))
        return;
      if (this.trySubmit())
        return;
      if (this.isSwipe) {
        this.state.selectedCells.length = 0;
        this.updatePreview();
      }
    });
  }
  trySubmit() {
    const sel = this.state.selectedCells;
    if (sel.length < 4)
      return false;
    const word = sel.map((id) => this.state.cells[id].letter).join("");
    const placement = this.state.wordMap.get(word);
    if (placement && !this.state.foundWords.has(placement.id)) {
      this.removeWord(placement);
      this.addFoundWord(word, false);
      this.found.push({ word, bonus: false });
      this.persist();
      this.updateRemaining();
      this.checkWin();
      sel.length = 0;
      this.updatePreview();
      return true;
    }
    if (this.state.bonusWords.has(word) && !this.state.foundBonus.has(word)) {
      this.state.foundBonus.add(word);
      this.addFoundWord(word, true);
      this.found.push({ word, bonus: true });
      this.persist();
      sel.length = 0;
      this.updatePreview();
      return true;
    }
    return false;
  }
  removeWord(placement) {
    const beforeEdges = this.buildVisibleEdges();
    const beforeCells = this.activeCells();
    this.state.foundWords.add(placement.id);
    const afterKeys = new Set(this.buildVisibleEdges().map((e) => e.key));
    const afterCells = this.activeCells();
    const cells = [...beforeCells].filter((id) => !afterCells.has(id));
    const edges = beforeEdges.filter((e) => !afterKeys.has(e.key));
    if (cells.length > 0 || edges.length > 0) {
      this.falling.push({ cells, edges, vy: 0, offset: 0 });
    }
  }
  cancelRevealHold() {
    clearTimeout(this.revealHoldTimeout);
    this.revealButton.classList.remove("holding");
  }
  reset() {
    unmarkCompleted(this.date);
    this.load(this.puzzle);
  }
  revealRemaining() {
    this.machine.transition({ kind: "revealed" });
    markRevealed(this.date);
    this.persist();
    this.state.selectedCells.length = 0;
    this.updatePreview();
    const remaining = this.state.words.filter((w) => !this.state.foundWords.has(w.id));
    remaining.forEach((w, i) => {
      const id = window.setTimeout(() => {
        this.addFoundWord(w.word, false);
      }, i * 250);
      this.revealTimeouts.push(id);
    });
  }
  updateRemaining() {
    const remaining = this.state.words.length - this.state.foundWords.size;
    this.remainingEl.textContent = remaining === 0 ? "" : `${remaining} word${remaining === 1 ? "" : "s"} remaining`;
  }
  updatePreview() {
    this.previewEl.textContent = this.state.selectedCells.map((id) => this.state.cells[id].letter.toUpperCase()).join("");
  }
  addFoundWord(word, bonus) {
    const older = [...this.foundList.children];
    const olderTops = older.map((el) => el.getBoundingClientRect().top);
    const li = document.createElement("li");
    const labelEl = document.createElement("span");
    labelEl.className = "label";
    labelEl.textContent = bonus ? "bonus" : "solution";
    li.appendChild(labelEl);
    const wordEl = document.createElement("span");
    wordEl.className = "word";
    wordEl.textContent = word.toUpperCase();
    li.appendChild(wordEl);
    li.append(" ");
    const definitionEl = document.createElement("span");
    definitionEl.className = "definition";
    const definition = this.definitions.get(word);
    if (definition === undefined) {
      this.pendingDefinitions.push({ word, el: definitionEl });
    } else {
      definitionEl.textContent = definition;
    }
    li.appendChild(definitionEl);
    if (bonus)
      li.className = "bonus";
    this.foundList.prepend(li);
    older.forEach((el, i) => {
      const delta = olderTops[i] - el.getBoundingClientRect().top;
      if (delta !== 0) {
        el.animate([
          { transform: `translateY(${delta}px)` },
          { transform: "translateY(0)" }
        ], { duration: 250, easing: "ease-out" });
      }
    });
    li.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 250,
      easing: "ease-out"
    });
  }
  applyDefinitions() {
    this.pendingDefinitions = this.pendingDefinitions.filter(({ word, el }) => {
      const definition = this.definitions.get(word);
      if (definition === undefined) {
        return true;
      }
      el.textContent = definition;
      return false;
    });
  }
  checkWin() {
    if (this.state.foundWords.size === this.state.words.length) {
      this.wonTime = performance.now();
      this.cancelRevealHold();
      this.machine.transition({ kind: "won" });
      markCompleted(this.date);
      clearProgress();
    }
  }
}

// client/machine.ts
var TRANSITIONS = {
  loading: ["playing", "error"],
  playing: ["won", "revealed"],
  won: ["playing"],
  revealed: [],
  error: []
};

class Machine {
  state;
  onChange;
  constructor(onChange) {
    this.state = { kind: "loading" };
    this.onChange = onChange;
    onChange(this.state);
  }
  transition(next) {
    if (!TRANSITIONS[this.state.kind].includes(next.kind)) {
      throw new Error(`invalid transition ${this.state.kind} -> ${next.kind}`);
    }
    this.state = next;
    this.onChange(next);
  }
  is(kind) {
    return this.state.kind === kind;
  }
}

// client/main.ts
var START_UTC = Date.UTC(2020, 4, 7);
function applyState(state) {
  const message = document.getElementById("message");
  const reveal = document.getElementById("reveal");
  const reset = document.getElementById("reset");
  message.hidden = state.kind !== "error";
  if (state.kind === "error") {
    message.textContent = state.message;
  }
  document.body.classList.toggle("error", state.kind === "error");
  reveal.hidden = state.kind !== "playing" && state.kind !== "revealed";
  reveal.disabled = state.kind === "revealed";
  reset.hidden = state.kind !== "won";
}
function setupShare() {
  const share = document.getElementById("share");
  let restoreTimeout = 0;
  share.addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    share.classList.remove("copied");
    share.offsetWidth;
    share.classList.add("copied");
    clearTimeout(restoreTimeout);
    restoreTimeout = window.setTimeout(() => {
      share.classList.remove("copied");
    }, 1500);
  });
}
function setupMenu(openCalendar) {
  const hamburger = document.getElementById("hamburger");
  const menu = document.getElementById("menu");
  const howto = document.getElementById("howto");
  hamburger.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", () => {
    menu.hidden = true;
  });
  document.getElementById("menu-howto").addEventListener("click", () => {
    howto.showModal();
  });
  document.getElementById("menu-past").addEventListener("click", openCalendar);
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.querySelector(".close").addEventListener("click", () => {
      dialog.close();
    });
  }
}
function setupCalendar(todayUtc, selectedUtc, total) {
  const dialog = document.getElementById("calendar");
  const title = document.getElementById("cal-title");
  const grid = document.getElementById("cal-grid");
  const prev = document.getElementById("cal-prev");
  const next = document.getElementById("cal-next");
  const shown = new Date(Math.min(Math.max(selectedUtc, START_UTC), todayUtc));
  let year = shown.getUTCFullYear();
  let month = shown.getUTCMonth();
  const start = new Date(START_UTC);
  const today = new Date(todayUtc);
  function render() {
    title.textContent = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
    prev.disabled = year === start.getUTCFullYear() && month === start.getUTCMonth();
    next.disabled = year === today.getUTCFullYear() && month === today.getUTCMonth();
    const done = completedDates();
    const revealed = revealedDates();
    grid.innerHTML = "";
    for (const dow of ["S", "M", "T", "W", "T", "F", "S"]) {
      const el = document.createElement("span");
      el.className = "dow";
      el.textContent = dow;
      grid.appendChild(el);
    }
    const first = Date.UTC(year, month, 1);
    const offset = new Date(first).getUTCDay();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells = Math.ceil((offset + days) / 7) * 7;
    for (let i = 0;i < cells; i += 1) {
      const utc = first + (i - offset) * DAY_MS;
      const inMonth = i >= offset && i < offset + days;
      const day = new Date(utc).getUTCDate();
      if (utc >= START_UTC && utc <= todayUtc) {
        const a = document.createElement("a");
        a.href = `?date=${dateString(utc)}`;
        a.textContent = String(day);
        if (!inMonth) {
          a.classList.add("adjacent");
        }
        if (utc === selectedUtc) {
          a.classList.add("selected");
        }
        const canonical = dateString(puzzleUtc(utc, START_UTC, total));
        if (done.has(canonical)) {
          a.classList.add("done");
        }
        if (revealed.has(canonical)) {
          a.classList.add("revealed");
        }
        grid.appendChild(a);
      } else {
        const el = document.createElement("span");
        el.className = "disabled";
        if (!inMonth) {
          el.classList.add("adjacent");
        }
        el.textContent = String(day);
        grid.appendChild(el);
      }
    }
  }
  prev.addEventListener("click", () => {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    render();
  });
  next.addEventListener("click", () => {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    render();
  });
  return () => {
    render();
    dialog.showModal();
  };
}
async function main() {
  const machine = new Machine(applyState);
  window.machine = machine;
  const indexResp = await fetch("public/puzzles/index.json");
  const index = await indexResp.json();
  const dateHeader = indexResp.headers.get("date") ?? undefined;
  const serverDate = dateHeader === undefined ? undefined : new Date(dateHeader);
  const now = serverDate === undefined || Number.isNaN(serverDate.getTime()) ? new Date : serverDate;
  const todayUtc = utcMidnight(now);
  const param = new URLSearchParams(location.search).get("date") ?? undefined;
  let targetUtc = todayUtc;
  if (param !== undefined) {
    const parsed = Date.parse(param);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(param) || Number.isNaN(parsed)) {
      setupMenu(setupCalendar(todayUtc, todayUtc, index.total));
      machine.transition({ kind: "error", message: `Invalid date: ${param}` });
      return;
    }
    targetUtc = parsed;
  }
  setupMenu(setupCalendar(todayUtc, targetUtc, index.total));
  setupShare();
  if (targetUtc > todayUtc) {
    machine.transition({
      kind: "error",
      message: `The puzzle for ${dateString(targetUtc)} isn't available yet.`
    });
    return;
  }
  const dayOffset = (targetUtc - START_UTC) / DAY_MS;
  if (dayOffset < 0) {
    machine.transition({
      kind: "error",
      message: `Puzzles start on ${dateString(START_UTC)}.`
    });
    return;
  }
  const dayIndex = dayOffset % index.total;
  const canvas = document.getElementById("board");
  const renderer = new Renderer(canvas);
  requestAnimationFrame(() => {
    renderer.resize();
  });
  window.addEventListener("resize", () => {
    renderer.resize();
  });
  const page = Math.floor(dayIndex / index.pageSize) + 1;
  const pageResp = await fetch(`public/puzzles/${page}.json`);
  const pageData = await pageResp.json();
  const puzzle = pageData.puzzles[dayIndex % index.pageSize];
  const clearedMessage = targetUtc === todayUtc ? "Come back tomorrow for daily puzzle" : undefined;
  const definitions = new Definitions;
  const game = new Game(puzzle, dateString(puzzleUtc(targetUtc, START_UTC, index.total)), clearedMessage, definitions, renderer, machine);
  window.game = game;
  game.start();
  loadDefinitions(definitions, game, page);
}
async function loadDefinitions(definitions, game, page) {
  const resp = await fetch(`public/definitions/${page}.json`);
  const chunk = await resp.json();
  definitions.merge(chunk);
  game.applyDefinitions();
  if (game.pendingDefinitions.length > 0) {
    const words = game.pendingDefinitions.map((p) => p.word).join(", ");
    throw new Error(`no definition for ${words}`);
  }
}
main();
