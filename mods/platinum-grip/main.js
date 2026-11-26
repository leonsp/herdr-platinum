// Mac OS 9 Platinum status bar: a control strip (Settings, Keys, Mines) then
// folder breadcrumbs and git branch on the left,
// a sunken branch field and bevelled buttons (split, text zoom, palette) on the
// right, then the clock and the resize grip.
// Herdr cannot resize the window from a mod, so a click on the grip zooms
// (maximizes) the window and back.
import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, focused, panes, run, settings, spaces, theme } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FONT = "Lucida Grande";

// The focused pane's folder and machine, as the Files and Changes mods read them.
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || "", on, pane };
}

// "## main...origin/main [ahead 1]" -> "main"; any further line means changes.
function parseBranch(out) {
  const lines = out.split("\n").filter(Boolean);
  const head = (lines[0] || "").replace(/^## /, "");
  let name = head.split("...")[0];
  if (name.startsWith("No commits yet on ")) name = name.slice(18);
  if (name.startsWith("HEAD (no branch)")) name = "detached";
  return { name, dirty: lines.length > 1 };
}

const two = (n) => String(n).padStart(2, "0");
function clock() {
  const d = new Date();
  const h = d.getHours() % 12 || 12;
  return `${h}:${two(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

// Left grey and top grey, right and bottom white: a sunken field.
function field(t, id, tip, ...kids) {
  return div().id(id).tooltip(tip).flex_none().pr(1).pb(1).bg(LIGHT).child(
    div().pt(1).pl(1).bg(DARK).child(
      h_flex().h(18).px(8).gap(6).items_center().bg(t.surface).text_size(13).font_family(FONT).text_color(t.foreground).children(kids)));
}

export default class PlatinumGrip extends View {
  init(_props, cx) {
    this.branch = null;
    this.where = "";
    this.tick = 0;
    this.open = true;
    cx.timer.every(2000, (cx) => this.poll(cx));
    this.poll(cx);
  }

  // The clock redraws every poll; git is asked again when the folder changes
  // and every tenth poll, so a checkout or an edit shows within 20 seconds.
  poll(cx) {
    const { cwd, on } = location();
    const where = JSON.stringify([cwd, on]);
    const stale = where !== this.where || ++this.tick % 10 === 0;
    this.where = where;
    cx.notify();
    if (!stale || !cwd) {
      if (!cwd) this.branch = null;
      return;
    }
    cx.spawn(async (cx) => {
      let next = null;
      try {
        const r = await exec("git", ["--no-optional-locks", "status", "--porcelain=v1", "-b", "-uno"], { cwd, on });
        if (r.code === 0 || r.code === undefined) next = parseBranch(r.stdout || "");
      } catch (_e) { /* not a repo, or the machine is away */ }
      if (where !== this.where) return;
      this.branch = next;
      cx.notify();
    });
  }

  crumbs(cwd) {
    const home = settings()?.home;
    let path = cwd || "";
    if (home && path.startsWith(home)) path = "~" + path.slice(home.length);
    else path = path.replace(/^\/Users\/[^/]+/, "~");
    const parts = path.split("/").filter(Boolean);
    const tail = parts.slice(-4);
    const lead = parts.length > 4 ? "… › " : path.startsWith("/") ? "/ " : "";
    return lead + tail.join(" › ");
  }

  button(t, id, tip, kid, command, args) {
    return div().id(id).tooltip(tip).flex_none().rounded(3).border_1().border_color("#000000").bg(DARK)
      .child(
        div().pr(1).pb(1).rounded(2).bg(DARK).child(
          div().pt(1).pl(1).rounded(2).bg(LIGHT).child(
            div().w(20).h(16).flex().items_center().justify_center().bg(t.chrome).text_size(13).font_family(FONT).font_bold()
              .text_color(t.foreground).hover((s) => s.bg(t.hover)).child(kid))))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      });
  }

  // A control-strip module: icon and a small black triangle on a bevelled tile.
  module(t, id, tip, icon, command, args) {
    return div().id(id).tooltip(tip).flex_none().rounded(3).border_1().border_color("#000000").bg(DARK)
      .child(
        div().pr(1).pb(1).rounded(2).bg(DARK).child(
          div().pt(1).pl(1).rounded(2).bg(LIGHT).child(
            h_flex().h(16).px(4).gap(3).items_center().bg(t.chrome).hover((s) => s.bg(t.hover))
              .child(image(icon).w(12).h(12))
              .child(div().text_size(7).text_color("#000000").child("▶")))))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      });
  }

  // The strip's end tab folds the modules away and brings them back.
  strip(t) {
    const tab = div().id("strip-tab").tooltip(this.open ? "Hide the control strip" : "Show the control strip")
      .flex_none().rounded(3).border_1().border_color("#000000").bg(DARK)
      .child(
        div().pr(1).pb(1).rounded(2).bg(DARK).child(
          div().pt(1).pl(1).rounded(2).bg(LIGHT).child(
            div().w(12).h(16).flex().items_center().justify_center().bg(t.chrome).text_size(8).text_color("#000000")
              .hover((s) => s.bg(t.hover)).child(this.open ? "◀" : "▶"))))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.open = !this.open;
        cx.notify();
      });
    if (!this.open) return [tab];
    return [
      tab,
      this.module(t, "strip-settings", "Settings", "mods/platinum-grip/settings.svg", "app.settings"),
      this.module(t, "strip-keys", "Keys", "mods/platinum-grip/keys.svg", "mod.open", { name: "platinum-help" }),
      this.module(t, "strip-mines", "Mines", "mods/platinum-grip/mines.svg", "mod.open", { name: "platinum-minesweeper" }),
    ];
  }

  render(_cx) {
    const t = theme();
    const { cwd } = location();
    const zoom = Math.round((settings()?.zoom || 1) * 100);
    const b = this.branch;

    const readouts = [];
    if (b) readouts.push(field(t, "branch", b.dirty ? `Git branch ${b.name}, with uncommitted changes` : `Git branch ${b.name}, clean`, div().child(`${b.name}${b.dirty ? " ✗" : " ✓"}`)));

    return h_flex()
      .size_full()
      .items_center()
      .gap(6)
      .pl(8)
      .pr(8)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .font_family(FONT)
      .text_color(t.foreground)
      .children([
        ...this.strip(t),
        div().id("crumbs").tooltip(cwd || "No folder").flex_1().min_w(0).truncate().child(this.crumbs(cwd)),
        ...readouts,
        this.button(t, "split-right", "Split the pane to the right", image("mods/platinum-grip/split-right.svg").w(14).h(14), "pane.split", { direction: "right" }),
        this.button(t, "split-down", "Split the pane downward", image("mods/platinum-grip/split-down.svg").w(14).h(14), "pane.split", { direction: "down" }),
        this.button(t, "zoom-out", "Make text smaller", "A−", "app.zoom_out"),
        field(t, "zoom", "Text size", div().child(`${zoom}%`)),
        this.button(t, "zoom-in", "Make text larger", "A+", "app.zoom_in"),
        this.button(t, "palette", "Command palette", "⌘", "app.palette"),
        field(t, "clock", "Current time", div().child(clock())),
        div()
          .id("grip")
          .tooltip("Resize window")
          .relative()
          .w(14)
          .h(14)
          .flex_none()
          .cursor_nwse_resize()
          .on_click((_e, cx) => {
            cx.stop_propagation();
            run("window.maximize");
          })
          .child(image("mods/platinum-grip/grip-2.svg").absolute().top(0).left(0).w(14).h(14)),
      ]);
  }
}
