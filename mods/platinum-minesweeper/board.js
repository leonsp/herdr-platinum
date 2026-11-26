// Minesweeper rules, ported from Herdr 98's mines.js. No imports, so it runs
// under `node --test`. Cells: { mine, n, open, flag }.

export const LEVELS = {
  beginner: [9, 9, 10],
  intermediate: [16, 16, 40],
  expert: [30, 16, 99],
};

export class Board {
  constructor(level, rand = Math.random) {
    this.level = LEVELS[level] ? level : "beginner";
    [this.cols, this.rows, this.total] = LEVELS[this.level];
    this.rand = rand;
    this.cells = Array.from({ length: this.cols * this.rows }, () => ({
      mine: false,
      n: 0,
      open: false,
      flag: false,
    }));
    this.state = "ready";
    this.boom = -1;
  }

  neighbors(i) {
    const out = [];
    const x = i % this.cols;
    const y = Math.floor(i / this.cols);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
          out.push(ny * this.cols + nx);
        }
      }
    }
    return out;
  }

  place(i) {
    const excluded = new Set([i, ...this.neighbors(i)]);
    const pool = this.cells.map((_c, j) => j).filter((j) => !excluded.has(j));
    for (let n = 0; n < this.total; n++) {
      const j = n + Math.floor(this.rand() * (pool.length - n));
      [pool[n], pool[j]] = [pool[j], pool[n]];
      this.cells[pool[n]].mine = true;
    }
    this.cells.forEach((c, j) => {
      c.n = this.neighbors(j).filter((k) => this.cells[k].mine).length;
    });
    this.state = "playing";
  }

  live() {
    return this.state === "ready" || this.state === "playing";
  }

  reveal(i) {
    const c = this.cells[i];
    if (!c || c.open || c.flag || !this.live()) return;
    if (this.state === "ready") this.place(i);
    if (c.mine) {
      this.boom = i;
      this.state = "lost";
      return;
    }
    const todo = [i];
    while (todo.length) {
      const j = todo.pop();
      const cell = this.cells[j];
      if (cell.open || cell.flag || cell.mine) continue;
      cell.open = true;
      if (cell.n === 0) todo.push(...this.neighbors(j));
    }
    if (this.cells.every((x) => x.mine || x.open)) {
      this.state = "won";
      this.cells.forEach((x) => {
        if (x.mine) x.flag = true;
      });
    }
  }

  toggleFlag(i) {
    const c = this.cells[i];
    if (!c || c.open || !this.live()) return;
    c.flag = !c.flag;
  }

  chord(i) {
    const c = this.cells[i];
    if (!c || !c.open || !c.n || this.state !== "playing") return;
    const near = this.neighbors(i);
    if (near.filter((j) => this.cells[j].flag).length !== c.n) return;
    for (const j of near) this.reveal(j);
  }

  flags() {
    return this.cells.filter((c) => c.flag).length;
  }
}
