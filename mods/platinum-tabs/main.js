// Modified copy of Herdr's shipped `tabs` mod, from the Herdr project
// (https://github.com/herdrdev/herdr), licensed under the Apache License 2.0.
// See NOTICE. Changes: Platinum grays, a black outline on the active tab, and
// larger text and controls (14px text, taller tabs and buttons), and bevelled
// push buttons. Behaviour is unchanged.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, exec, openOverlay, theme, window, shared, layout, settings } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const PRESSED = "#bbbbbb";
// Geneva has no bold face. Lucida Grande does, as in the status bar.
const FONT = "Lucida Grande";

// A Platinum push button: black outline, white highlight on the top and left,
// grey shadow on the bottom and right. Pressed swaps the bevel and darkens
// the face. Elements have no per-edge border colours, so the bevel is nested
// divs with padding.
function bevel(t, id, pressed, kids, onClick, small = false, tip = "") {
  const face = h_flex().h(small ? 20 : 24).when(small, el => el.w(24), el => el.px(10)).gap(6).items_center().justify_center()
    .text_size(14).font_family(FONT).font_bold().text_color(t.foreground)
    .bg(pressed ? PRESSED : t.chrome)
    .when(!pressed, el => el.hover(s => s.bg(t.hover)))
    // Extra room after the label, as a spacer: pr() on the face did not show.
    .children(small ? kids : [...kids, div().w(0).h(1).flex_none()]);
  return div().id(id).flex_none().rounded(3).border_1().border_color("#000000").bg(DARK)
    .when(Boolean(tip), el => el.tooltip(tip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(onClick)
    .child(div().pr(1).pb(1).rounded(2).bg(pressed ? LIGHT : DARK)
      .child(div().pt(1).pl(1).rounded(2).bg(pressed ? DARK : LIGHT).child(face)));
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Same as the agents mod: drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// A tab Herdr named (unnamed, or after its program) follows its agent's live
// title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = clean(lead.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (tab.name === prog || !tab.named) && telling ? live : base;
}

export default class PlatinumTabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
    // The Files Extended button shows only when that mod is installed.
    // The open-by-path button shows only when cria-file-preview is installed.
    this.extended = false;
    this.preview = false;
    // The Map button shows only when the agenttrail mod is installed.
    this.map = false;
    const installed = (name) => exec("sh", ["-c", `test -d "\${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/${name}"`])
      .then(r => r?.code === 0).catch(() => false);
    cx.spawn(async cx => {
      this.extended = await installed("cria-files-extended");
      this.preview = await installed("cria-file-preview");
      this.map = await installed("agenttrail");
      cx.notify();
    });
  }

  // One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many
  // small events per gesture: a short swipe or one smoothed notch (about
  // 25 px) switches one tab, a longer swipe keeps going a tab per 60 px, at
  // most one every 100 ms so each shows.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    // Phases often arrive only as moves (a macOS touchpad included): a pause
    // or a turn starts a new gesture.
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(30).flex_none().flex().items_center().justify_center().rounded(6).text_size(18).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // SVGs are masks tinted by text_color, so the fill and the outline are
    // two layers.
    const cap = (side, color) => div().relative().w(14).h(32).flex_none()
      .child(svg(`mods/platinum-tabs/tab-${side}-fill.svg`).w(14).h(32).text_color(color))
      .child(svg(`mods/platinum-tabs/tab-${side}-line.svg`).absolute().inset_0().w(14).h(32).text_color("#000000"));
    // The + is a small inactive tab after the last one, as in Platinum.
    const plus = h_flex().id("tab-new").tooltip("New tab or terminal").h(32).items_center().flex_none()
      .on_mouse_down("left", stop)
      .on_click(() => openOverlay({ mod: "platinum-new-menu", kind: "popup", width: 250, height: 300, frame: "none" }))
      .child(cap("left", PRESSED))
      .child(h_flex().h_full().px(2).items_center().justify_center().border_t(1).border_color("#000000").bg(PRESSED)
        .text_size(16).font_family(FONT).font_bold().text_color(t.foreground).child("+"))
      .child(cap("right", PRESSED));
    const item = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const program = lead?.program;
      const name = label(c, lead);
      // Slanted caps (SVG) on each side of a flat body, as in Mac OS 9
      // Platinum tab panels. The active tab is the pane colour, the others
      // are a darker grey.
      const face = c.active ? t.surface : PRESSED;
      const body = h_flex().h_full().px(2).gap(8).items_center().flex_none()
        .text_size(14).font_family(FONT).font_bold()
        .border_t(1).border_color("#000000").bg(face).text_color(t.foreground)
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(16).text_color(t.muted) : image(program.icon).size(16)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(8).rounded(4).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
      return h_flex().id(`tab-${c.id}`).tooltip(String(name)).relative().h(32).items_center().flex_none()
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "platinum-menu", kind: "popup", width: 210, height: 100, frame: "none", props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(cap("left", face))
        .child(body)
        .child(cap("right", face));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon, tip) => {
      const on = panel && !panel.hidden && body?.active === id;
      return bevel(t, `panel-${id}`, Boolean(on), [svg(icon).size(16), label], () => {
        if (on) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      }, false, tip);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_end().gap(0).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children([...shown.map(item), plus]))
      .when(this.preview, el => el.child(bevel(t, "tab-open", false, [">", "Preview"], () => openOverlay({ mod: "platinum-open", kind: "dialog", width: 463, height: 187, frame: "none" }), false, "Open a file by path")))
      .when(this.map, el => el.child(bevel(t, "tab-map", false, [svg("mods/platinum-tabs/compass.svg").size(16), "Map"], () => run("pane.split", { direction: "right", mod: "agenttrail" }), false, "Show the Agenttrail map")))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg", "Browse files")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg", "Review git changes")))
      .when(this.extended && Boolean(find(root, "files-extended")), el => el.child(panelButton("files-extended", "Extended", "mods/cria-files-extended/icons/folder.svg", "Browse files, with a menu")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
