import { test } from "node:test";
import assert from "node:assert/strict";
import { Board, LEVELS } from "./board.js";

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const mineIndexes = (b) => b.cells.map((c, i) => (c.mine ? i : -1)).filter((i) => i >= 0);

test("neighbors of corner 0 on beginner has length 3", () => {
  const b = new Board("beginner");
  assert.equal(b.neighbors(0).length, 3);
  assert.equal(b.neighbors(1).length, 5);
  assert.equal(b.neighbors(40).length, 8);
});

test("first reveal never places a mine on the clicked cell or its neighbours", () => {
  for (const i of [0, 8, 40, 80]) {
    for (let seed = 1; seed <= 50; seed++) {
      const b = new Board("beginner", seeded(seed));
      b.reveal(i);
      const mines = mineIndexes(b);
      assert.equal(mines.length, LEVELS.beginner[2]);
      for (const j of [i, ...b.neighbors(i)]) assert.ok(!mines.includes(j));
    }
  }
});

test("reveal of a zero cell opens its neighbours", () => {
  const b = new Board("beginner", seeded(7));
  b.reveal(40);
  assert.equal(b.cells[40].n, 0);
  for (const j of b.neighbors(40)) assert.ok(b.cells[j].open);
  assert.equal(b.state, "playing");
});

test("reveal of a mine sets state lost and boom to that index", () => {
  const b = new Board("beginner", seeded(3));
  b.reveal(40);
  const m = mineIndexes(b)[0];
  b.reveal(m);
  assert.equal(b.state, "lost");
  assert.equal(b.boom, m);
});

test("opening every safe cell sets state won and flags every mine", () => {
  const b = new Board("beginner", seeded(5));
  b.reveal(40);
  b.cells.forEach((c, i) => {
    if (!c.mine) b.reveal(i);
  });
  assert.equal(b.state, "won");
  assert.ok(b.cells.every((c) => !c.mine || c.flag));
});

test("toggleFlag does nothing on an open cell or after the game ends", () => {
  const b = new Board("beginner", seeded(5));
  b.reveal(40);
  b.toggleFlag(40);
  assert.equal(b.cells[40].flag, false);
  const m = mineIndexes(b)[0];
  b.reveal(m);
  const covered = b.cells.findIndex((c) => !c.open && !c.flag && !c.mine);
  b.toggleFlag(covered);
  assert.equal(b.cells[covered].flag, false);
});

test("toggleFlag flags and unflags a covered cell", () => {
  const b = new Board("beginner");
  b.toggleFlag(0);
  assert.equal(b.cells[0].flag, true);
  b.toggleFlag(0);
  assert.equal(b.cells[0].flag, false);
});

test("chord opens neighbours only when flag count equals n", () => {
  const b = new Board("beginner", seeded(11));
  b.reveal(40);
  const i = b.cells.findIndex((c, k) => c.open && c.n > 0 && b.neighbors(k).some((j) => !b.cells[j].open && !b.cells[j].mine));
  assert.ok(i >= 0);
  const near = b.neighbors(i);
  const before = b.cells.filter((c) => c.open).length;
  b.chord(i);
  assert.equal(b.cells.filter((c) => c.open).length, before, "no flags: nothing");
  const mines = near.filter((j) => b.cells[j].mine);
  const safe = near.find((j) => !b.cells[j].mine && !b.cells[j].open);
  mines.slice(1).forEach((j) => b.toggleFlag(j));
  b.chord(i);
  assert.equal(b.cells.filter((c) => c.open).length, before, "too few flags: nothing");
  b.toggleFlag(mines[0]);
  b.toggleFlag(safe);
  b.chord(i);
  assert.equal(b.cells.filter((c) => c.open).length, before, "too many flags: nothing");
  b.toggleFlag(safe);
  b.chord(i);
  assert.ok(b.cells.filter((c) => c.open).length > before, "exact flags: opens");
});

test("flags() may exceed total", () => {
  const b = new Board("beginner");
  for (let i = 0; i < 12; i++) b.toggleFlag(i);
  assert.equal(b.flags(), 12);
  assert.ok(b.flags() > b.total);
});
