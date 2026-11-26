// Mac OS 9 Platinum Minesweeper. Rules live in board.js; this file draws them
// in the Platinum bevel style, like platinum-help. Ported from Herdr 98's
// mines.js. Open it with `mod.open platinum-minesweeper` (the Mines tile in
// the control strip does).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { closeOverlay, openOverlay, playSound, props, shared, setShared, theme } from "herdr";
import { Board, LEVELS } from "./board.js";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FACE = "#dddddd";
const FONT = "Lucida Grande";
const ASSETS = "mods/platinum-minesweeper";
const KEY = "platinum.mines";
const CELL = 20;
const COLORS = ["#000000", "#0000ff", "#008000", "#ff0000", "#000080", "#800000", "#008080", "#000000", "#808080"];
const SEGMENTS = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];
const SEG_RECTS = [[2, 1, 7, 2], [9, 3, 2, 7], [9, 12, 2, 7], [2, 19, 7, 2], [0, 12, 2, 7], [0, 3, 2, 7], [2, 10, 7, 2]];
const NAMES = { beginner: "Beginner", intermediate: "Intermediate", expert: "Expert" };

// Overlay size for a level: fixed chrome around the board.
export function sizeFor(level) {
  const [cols, rows] = LEVELS[level];
  return { width: Math.max(320, cols * CELL + 35), height: rows * CELL + 185 };
}

const raised = (child) => div().flex_none().bg(DARK).pr(1).pb(1).child(div().bg(LIGHT).pt(1).pl(1).child(child));
// Platinum push button: black outline, then a white top-left and grey
// bottom-right bevel (swapped when pressed), as in the status bar.
const push = (child, pressed = false) => div().flex_none().rounded(3).border_1().border_color("#000000").bg(DARK).child(
  pressed
    ? div().pr(1).pb(1).rounded(2).bg(LIGHT).child(div().pt(1).pl(1).rounded(2).bg(DARK).child(child))
    : div().pr(1).pb(1).rounded(2).bg(DARK).child(div().pt(1).pl(1).rounded(2).bg(LIGHT).child(child)));
const sunken = (child) => div().flex_none().bg(LIGHT).pr(1).pb(1).child(div().bg(DARK).pt(1).pl(1).child(child));

function art(name, size) {
  return image(`${ASSETS}/icons/${name}.svg`).w(size).h(size).flex_none();
}

function counter(value) {
  const text = value < 0 ? `-${String(Math.min(99, -value)).padStart(2, "0")}` : String(Math.min(999, value)).padStart(3, "0");
  const digits = h_flex().gap(2).bg("#000000").p(1).children([...text].map((ch) => {
    const lit = ch === "-" ? "g" : SEGMENTS[Number(ch)];
    return div().relative().w(11).h(23).children(SEG_RECTS.map(([x, y, w, h], i) =>
      div().absolute().left(x).top(y).w(w).h(h).bg(lit.includes("abcdefg"[i]) ? "#ff0000" : "#650000")));
  }));
  return sunken(digits);
}

export default class Minesweeper extends View {
  init(p, cx) {
    this.options = { level: "beginner", sound: true, best: {}, ...(shared(KEY) ?? {}) };
    if (!LEVELS[this.options.level]) this.options.level = "beginner";
    this.board = new Board(this.options.level);
    this.seconds = 0;
    this.held = false;
    this.timer = null;
    this.handle = cx.focus_handle();
    // mod.json opens at the beginner size; reopen once at the saved level's.
    if (this.options.level !== "beginner" && !(props() ?? p)?.sized) {
      cx.timer.after(0, () => this.reopen());
    }
  }

  save() {
    setShared(KEY, this.options);
  }

  sfx(name) {
    if (!this.options.sound) return;
    try { playSound(`${ASSETS}/sounds/${name}.mp3`); } catch {}
  }

  stop() {
    this.timer?.cancel();
    this.timer = null;
  }

  dismiss() {
    this.stop();
    closeOverlay(props()?.overlay);
  }

  reopen() {
    this.stop();
    const { width, height } = sizeFor(this.options.level);
    closeOverlay(props()?.overlay);
    openOverlay({ mod: "platinum-minesweeper", kind: "dialog", frame: "none", width, height, props: { sized: true } });
  }

  setLevel(level) {
    this.options.level = level;
    this.save();
    this.reopen();
  }

  newGame(cx) {
    this.stop();
    this.board = new Board(this.options.level);
    this.seconds = 0;
    this.held = false;
    cx.notify();
  }

  // Run a move, then start or stop the clock and play sounds as the state moved.
  play(fn, cx) {
    const before = this.board.state;
    fn();
    const b = this.board;
    if (before === "ready" && b.state === "playing") {
      this.started = Date.now();
      this.timer = cx.timer.every(1000, (cx) => {
        this.seconds = Math.min(999, Math.floor((Date.now() - this.started) / 1000));
        cx.notify();
      });
    }
    if (before === "playing" || before === "ready") {
      if (b.state === "lost") {
        this.stop();
        this.sfx("boom");
      } else if (b.state === "won") {
        this.stop();
        this.seconds = Math.min(999, Math.floor((Date.now() - this.started) / 1000));
        const best = this.options.best[this.options.level];
        if (best === undefined || this.seconds < best) {
          this.options.best = { ...this.options.best, [this.options.level]: this.seconds };
          this.save();
        }
        this.sfx("tada");
      }
    }
    this.held = false;
    cx.notify();
  }

  closeBox(t) {
    return div().id("mines-close").tooltip("Close").w(14).h(14).flex_none().border(1).border_color("#000000").bg(DARK)
      .on_click((_e, cx) => { cx.stop_propagation(); this.dismiss(); })
      .child(div().size_full().bg(LIGHT).pr(1).pb(1).child(
        div().size_full().bg(DARK).pt(1).pl(1).child(
          div().size_full().bg(t.input).hover((s) => s.bg(t.accent)))));
  }

  stripes(t) {
    const lines = [];
    for (let i = 0; i < 5; i++) lines.push(v_flex().child(div().h(1).bg(t.dim)).child(div().h(1).bg(LIGHT)));
    return v_flex().flex_1().gap(1).px(4).children(lines);
  }

  titleBar(t) {
    return h_flex().h(22).flex_none().items_center().px(6).bg("#e8e8e8").border_b(1).border_color("#000000")
      .child(this.closeBox(t))
      .child(this.stripes(t))
      .child(div().flex_none().px(8).font_family(FONT).font_bold().text_size(14).text_color("#000000").child("Mines"))
      .child(this.stripes(t))
      .child(div().w(14).h(14).flex_none());
  }

  button(id, label, active, onClick) {
    const text = div().h(22).px(10).flex().items_center().justify_center().font_family(FONT).text_size(12)
      .text_color("#000000").rounded(2).bg(active ? "#c4c4c4" : FACE).when(active, (el) => el.font_bold()).child(label);
    return div().id(id).flex_1().child(push(text, active).w_full()).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); });
  }

  cell(i) {
    const b = this.board;
    const c = b.cells[i];
    const lost = b.state === "lost";
    const exposed = c.open || (lost && c.mine && !c.flag);
    let content = null;
    if (lost && c.flag && !c.mine) content = art("wrong", 16);
    else if (c.flag) content = art("flag", 16);
    else if (exposed && c.mine) content = art("mine", 16);
    else if (c.open && c.n) {
      content = div().font_family(FONT).font_bold().text_size(14).text_color(COLORS[c.n]).child(String(c.n));
    }
    // The bevel adds 2px (raised) or 1px (flat), so the cell totals CELL.
    const inner = exposed ? CELL - 1 : CELL - 2;
    const face = div().w(inner).h(inner).flex().items_center().justify_center()
      .bg(i === b.boom ? "#ff0000" : exposed ? "#cccccc" : FACE).when(Boolean(content), (el) => el.child(content));
    const el = exposed
      ? div().flex_none().border_t(1).border_l(1).border_color(DARK).child(face)
      : raised(face);
    return el.id(`mine-${i}`)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (b.live()) { this.held = true; cx.notify(); } })
      .on_click((e, cx) => {
        this.play(() => (c.open && e.click_count >= 2 ? b.chord(i) : b.reveal(i)), cx);
      })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.play(() => b.toggleFlag(i), cx); })
      .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); this.play(() => b.chord(i), cx); });
  }

  render(_cx) {
    const t = theme();
    const b = this.board;
    const faceName = b.state === "lost" ? "face-dead" : b.state === "won" ? "face-cool" : this.held ? "face-ooh" : "face-smile";

    const levels = h_flex().gap(6).children(Object.keys(LEVELS).map((level) =>
      this.button(`level-${level}`, NAMES[level], level === this.options.level, () => {
        if (level !== this.options.level) this.setLevel(level);
      })));

    const smiley = div().id("mines-face").tooltip("New game").flex_none()
      .child(push(div().w(28).h(28).rounded(2).bg(FACE).flex().items_center().justify_center().child(art(faceName, 18))))
      .on_click((_e, cx) => { cx.stop_propagation(); this.newGame(cx); });
    const panel = sunken(h_flex().h(40).items_center().justify_between().px(6).bg(FACE)
      .child(counter(b.total - b.flags())).child(smiley).child(counter(this.seconds)));

    const rows = v_flex().flex_none().children(Array.from({ length: b.rows }, (_v, y) =>
      h_flex().flex_none().children(Array.from({ length: b.cols }, (_w, x) => this.cell(y * b.cols + x)))));
    const board = h_flex().justify_center().child(
      div().flex_none().w(b.cols * CELL + 4).h(b.rows * CELL + 4).bg(DARK).border_1().border_color("#000000").child(sunken(rows)));

    const best = this.options.best[this.options.level];
    const footer = h_flex().h(24).items_center().justify_between().font_family(FONT).text_size(12).text_color("#000000")
      .child(div().child(`Best ${NAMES[this.options.level]}: ${best === undefined ? "none" : `${best} s`}`))
      .child(div().id("mines-sound").flex_none().child(
        push(div().h(22).px(10).rounded(2).flex().items_center().bg(FACE).child(`Sound ${this.options.sound ? "on" : "off"}`)))
        .on_click((_e, cx) => { cx.stop_propagation(); this.options.sound = !this.options.sound; this.save(); cx.notify(); }));

    const win = v_flex().id("mines").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { this.dismiss(); cx.stop_propagation(); }
      })
      .size_full().min_h(0).bg("#dddddd").border_1().border_color("#000000")
      .font_family(FONT).text_color("#000000")
      .child(this.titleBar(t))
      .child(v_flex().flex_1().min_h(0).p(12).gap(8).items_center()
        .child(v_flex().gap(8).child(levels).child(panel).child(board).child(footer)))
      .on_mouse_down_out((_e, cx) => { if (this.held) { this.held = false; cx.notify(); } });

    return div().relative().size_full()
      .child(div().absolute().top(3).left(3).right(0).bottom(0).bg("#00000066"))
      .child(div().absolute().top(0).left(0).right(3).bottom(3).child(win));
  }
}
