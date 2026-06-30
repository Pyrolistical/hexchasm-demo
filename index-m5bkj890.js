// client/renderer.ts
class Renderer {
  canvas;
  ctx;
  size;
  originX;
  originY;
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.size = 0;
    this.originX = 0;
    this.originY = 0;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0)
      return;
    const dpr = window.devicePixelRatio || 1;
    const gridHeight = rect.width * 1.1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = gridHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = rect.width / 7.5;
    this.originX = rect.width / 2;
    this.originY = gridHeight / 2;
  }
  axialToPixel(q, r) {
    const x = this.size * (3 / 2) * q;
    const y = this.size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
    return [this.originX + x, this.originY + y];
  }
  cellAtPixel(px, py, cells) {
    const radius = this.size * 0.45;
    for (const cell of cells) {
      const [cx, cy] = this.axialToPixel(cell.q, cell.r);
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < radius * radius) {
        return cell.id;
      }
    }
    return;
  }
  draw(cells, visibleEdges, selectedCells, foundWords, words, cellToWords) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    const centers = cells.map((c) => this.axialToPixel(c.q, c.r));
    const circleRadius = this.size * 0.42;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#888";
    ctx.beginPath();
    for (const edge of visibleEdges) {
      const [ax, ay] = centers[edge.a];
      const [bx, by] = centers[edge.b];
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    for (const cell of cells) {
      const wordSet = cellToWords.get(cell.id);
      let active = false;
      if (wordSet) {
        for (const wid of wordSet) {
          if (!foundWords.has(wid)) {
            active = true;
            break;
          }
        }
      }
      if (!active)
        continue;
      const [cx, cy] = centers[cell.id];
      const isSelected = selectedCells.includes(cell.id);
      ctx.beginPath();
      ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ddd" : "#fff";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = `${this.size * 0.5}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cell.letter.toUpperCase(), cx, cy);
    }
    if (selectedCells.length >= 2) {
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const [sx, sy] = centers[selectedCells[0]];
      ctx.moveTo(sx, sy);
      for (let i = 1;i < selectedCells.length; i++) {
        const [nx, ny] = centers[selectedCells[i]];
        ctx.lineTo(nx, ny);
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
  renderer;
  previewEl;
  foundList;
  messageEl;
  animFrame;
  won;
  constructor(puzzle, renderer) {
    const cellToWords = new Map;
    for (const w of puzzle.words) {
      for (const cid of w.cells) {
        let set = cellToWords.get(cid);
        if (!set) {
          set = new Set;
          cellToWords.set(cid, set);
        }
        set.add(w.id);
      }
    }
    this.state = {
      cells: puzzle.cells,
      words: puzzle.words,
      wordMap: new Map(puzzle.words.map((w) => [w.word, w])),
      fillerEdges: puzzle.fillerEdges,
      foundWords: new Set,
      selectedCells: [],
      cellToWords
    };
    this.renderer = renderer;
    this.previewEl = document.getElementById("preview");
    this.foundList = document.querySelector("#found ul");
    this.messageEl = document.getElementById("message");
    this.animFrame = 0;
    this.won = false;
  }
  start() {
    this.setupInput();
    this.frame();
  }
  frame() {
    const visible = this.buildVisibleEdges();
    this.renderer.draw(this.state.cells, visible, this.state.selectedCells, this.state.foundWords, this.state.words, this.state.cellToWords);
    this.animFrame = requestAnimationFrame(() => this.frame());
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
      return this.renderer.cellAtPixel(e.clientX - rect.left, e.clientY - rect.top, this.state.cells);
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
        sel.pop();
        this.updatePreview();
        return;
      }
      if (sel.includes(cellId))
        return;
      if (!tryAdd(cellId))
        return;
      sel.push(cellId);
      this.updatePreview();
    });
    canvas.addEventListener("pointerup", () => {
      const sel = this.state.selectedCells;
      if (sel.length < 4)
        return;
      const word = sel.map((id) => this.state.cells[id].letter).join("");
      const placement = this.state.wordMap.get(word);
      if (placement && !this.state.foundWords.has(placement.id)) {
        this.state.foundWords.add(placement.id);
        this.addFoundWord(word);
        this.checkWin();
        sel.length = 0;
        this.updatePreview();
      }
    });
  }
  updatePreview() {
    this.previewEl.textContent = this.state.selectedCells.map((id) => this.state.cells[id].letter.toUpperCase()).join("");
  }
  addFoundWord(word) {
    const li = document.createElement("li");
    li.textContent = word.toUpperCase();
    this.foundList.appendChild(li);
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
  const resp = await fetch("public/puzzle.json");
  const puzzle = await resp.json();
  const canvas = document.getElementById("board");
  const renderer = new Renderer(canvas);
  requestAnimationFrame(() => {
    renderer.resize();
  });
  window.addEventListener("resize", () => {
    renderer.resize();
  });
  const game = new Game(puzzle, renderer);
  game.start();
}
main();
