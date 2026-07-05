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
  drawCleared(progress) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const scale = progress < 0.6 ? progress / 0.6 * 1.25 : 1.25 - (progress - 0.6) / 0.4 * 0.25;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, progress / 0.6);
    ctx.fillStyle = this.clearedColor;
    ctx.font = `bold ${this.size * 1.2}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Cleared!", 0, 0);
    ctx.restore();
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

// client/game.ts
var REVEAL_HOLD_MS = 1000;
function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

class Game {
  state;
  definitions;
  renderer;
  previewEl;
  remainingEl;
  foundList;
  revealButton;
  animFrame;
  won;
  wonTime;
  revealed;
  isSwipe;
  falling;
  lastFrameTime;
  revealTimeouts;
  revealHoldTimeout;
  constructor(puzzle, definitions, renderer) {
    this.definitions = definitions;
    this.renderer = renderer;
    this.previewEl = document.getElementById("preview");
    this.remainingEl = document.getElementById("remaining");
    this.foundList = document.querySelector("#found ul");
    this.revealButton = document.getElementById("reveal");
    this.animFrame = 0;
    this.won = false;
    this.wonTime = 0;
    this.revealed = false;
    this.isSwipe = false;
    this.falling = [];
    this.lastFrameTime = 0;
    this.revealTimeouts = [];
    this.revealHoldTimeout = 0;
    this.state = null;
    this.revealButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.revealButton.disabled)
        return;
      this.revealButton.setPointerCapture(e.pointerId);
      this.revealButton.classList.add("holding");
      this.revealHoldTimeout = setTimeout(() => {
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
    this.won = false;
    this.wonTime = 0;
    this.revealed = false;
    this.falling = [];
    for (const id of this.revealTimeouts) {
      clearTimeout(id);
    }
    this.revealTimeouts = [];
    this.cancelRevealHold();
    this.revealButton.disabled = false;
    this.revealButton.hidden = false;
    this.foundList.innerHTML = "";
    this.previewEl.textContent = "";
    this.updateRemaining();
    this.renderer.setCells(puzzle.cells);
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
    if (this.won) {
      const progress = Math.min(1, (now - this.wonTime) / 600);
      this.renderer.drawCleared(progress);
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
    if (this.won)
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
      if (this.revealed)
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
      if (this.revealed)
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
      if (this.revealed)
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
      this.updateRemaining();
      this.checkWin();
      sel.length = 0;
      this.updatePreview();
      return true;
    }
    if (this.state.bonusWords.has(word) && !this.state.foundBonus.has(word)) {
      this.state.foundBonus.add(word);
      this.addFoundWord(word, true);
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
  revealRemaining() {
    this.revealed = true;
    this.revealButton.disabled = true;
    this.state.selectedCells.length = 0;
    this.updatePreview();
    const remaining = this.state.words.filter((w) => !this.state.foundWords.has(w.id));
    remaining.forEach((w, i) => {
      const id = setTimeout(() => {
        this.addFoundWord(w.word, false);
      }, i * 250);
      this.revealTimeouts.push(id);
    });
  }
  updateRemaining() {
    const remaining = this.state.words.length - this.state.foundWords.size;
    this.remainingEl.textContent = `${remaining} word${remaining === 1 ? "" : "s"} remaining`;
  }
  updatePreview() {
    this.previewEl.textContent = this.state.selectedCells.map((id) => this.state.cells[id].letter.toUpperCase()).join("");
  }
  addFoundWord(word, bonus) {
    const older = [...this.foundList.children];
    const olderTops = older.map((el) => el.getBoundingClientRect().top);
    const li = document.createElement("li");
    const wordEl = document.createElement("span");
    wordEl.className = "word";
    wordEl.textContent = word.toUpperCase();
    li.appendChild(wordEl);
    const definition = this.definitions[word];
    if (definition === undefined) {
      throw new Error(`no definition for ${word}`);
    }
    const definitionEl = document.createElement("span");
    definitionEl.className = "definition";
    definitionEl.textContent = definition;
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
  checkWin() {
    if (this.state.foundWords.size === this.state.words.length) {
      this.won = true;
      this.wonTime = performance.now();
      this.cancelRevealHold();
      this.revealButton.hidden = true;
    }
  }
}

// client/main.ts
async function main() {
  const [indexResp, definitionsResp] = await Promise.all([
    fetch("public/puzzles/index.json"),
    fetch("public/definitions.json")
  ]);
  const index = await indexResp.json();
  const definitions = await definitionsResp.json();
  const pageCache = new Map;
  function fetchPage(page) {
    let cached = pageCache.get(page);
    if (cached === undefined) {
      cached = fetch(`public/puzzles/${page}.json`).then((resp) => resp.json());
      pageCache.set(page, cached);
    }
    return cached;
  }
  async function loadPuzzle(i) {
    const page = await fetchPage(Math.floor(i / index.pageSize) + 1);
    return page.puzzles[i % index.pageSize];
  }
  const canvas = document.getElementById("board");
  const renderer = new Renderer(canvas);
  requestAnimationFrame(() => {
    renderer.resize();
  });
  window.addEventListener("resize", () => {
    renderer.resize();
  });
  const picker = document.getElementById("picker");
  for (let i = 0;i < index.total; i += 1) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Puzzle ${i + 1}`;
    picker.appendChild(opt);
  }
  const game = new Game(await loadPuzzle(0), definitions, renderer);
  game.start();
  picker.addEventListener("change", async () => {
    game.load(await loadPuzzle(Number(picker.value)));
  });
}
main();
