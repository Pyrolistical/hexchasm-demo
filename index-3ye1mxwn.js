// client/renderer.ts
var Z_SCALE = 1;
var RADIUS_FACTOR = 0.42;
var MARGIN_FACTOR = 0.15;

class Renderer {
  canvas;
  ctx;
  size;
  originX;
  originY;
  viewHeight;
  cells;
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.size = 0;
    this.originX = 0;
    this.originY = 0;
    this.viewHeight = 0;
    this.cells = [];
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
    const radius = this.size * 0.45;
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
    ctx.strokeStyle = "#888";
    ctx.beginPath();
    for (const edge of edges) {
      const a = centers[edge.a];
      const b = centers[edge.b];
      ctx.moveTo(a.x, a.y + yOffset);
      ctx.lineTo(b.x, b.y + yOffset);
    }
    ctx.stroke();
  }
  drawCell(cell, p, yOffset, isSelected) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.save();
    ctx.transform(1, 0, 0, Z_SCALE, p.x, p.y + yOffset);
    ctx.arc(0, 0, this.size * RADIUS_FACTOR, 0, Math.PI * 2);
    ctx.restore();
    ctx.fillStyle = isSelected ? "#ddd" : "#fff";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();
    ctx.save();
    ctx.transform(1, 0, 0, Z_SCALE, p.x, p.y + yOffset);
    ctx.fillStyle = "#000";
    ctx.font = `${this.size * 0.5}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.letter.toUpperCase(), 0, 0);
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
      ctx.strokeStyle = "#444";
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
  messageEl;
  revealButton;
  animFrame;
  won;
  isSwipe;
  falling;
  lastFrameTime;
  revealTimeouts;
  constructor(puzzle, definitions, renderer) {
    this.definitions = definitions;
    this.renderer = renderer;
    this.previewEl = document.getElementById("preview");
    this.remainingEl = document.getElementById("remaining");
    this.foundList = document.querySelector("#found ul");
    this.messageEl = document.getElementById("message");
    this.revealButton = document.getElementById("reveal");
    this.animFrame = 0;
    this.won = false;
    this.isSwipe = false;
    this.falling = [];
    this.lastFrameTime = 0;
    this.revealTimeouts = [];
    this.state = null;
    this.revealButton.addEventListener("click", () => {
      this.revealRemaining();
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
    this.falling = [];
    for (const id of this.revealTimeouts) {
      clearTimeout(id);
    }
    this.revealTimeouts = [];
    this.revealButton.disabled = false;
    this.foundList.innerHTML = "";
    this.messageEl.textContent = "";
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
  revealRemaining() {
    this.revealButton.disabled = true;
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
      this.messageEl.textContent = "Puzzle Complete";
    }
  }
}

// client/main.ts
async function main() {
  const [puzzlesResp, definitionsResp] = await Promise.all([
    fetch("public/puzzles.json"),
    fetch("public/definitions.json")
  ]);
  const data = await puzzlesResp.json();
  const definitions = await definitionsResp.json();
  const canvas = document.getElementById("board");
  const renderer = new Renderer(canvas);
  requestAnimationFrame(() => {
    renderer.resize();
  });
  window.addEventListener("resize", () => {
    renderer.resize();
  });
  const picker = document.getElementById("picker");
  data.puzzles.forEach((_, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Puzzle ${i + 1}`;
    picker.appendChild(opt);
  });
  const game = new Game(data.puzzles[0], definitions, renderer);
  game.start();
  picker.addEventListener("change", () => {
    game.load(data.puzzles[Number(picker.value)]);
  });
}
main();
