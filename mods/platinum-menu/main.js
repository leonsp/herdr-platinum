// Modified copy of Herdr's shipped `menu` mod, from the Herdr project
// (https://github.com/herdrdev/herdr), licensed under the Apache License 2.0.
// See NOTICE. Changes: Mac OS 9 Platinum look (grey face, black outline,
// drop shadow, bold Lucida Grande, blue highlight, shortcut glyphs), no icons,
// and worktree items open the Platinum worktree dialog. Items and behaviour
// are unchanged. Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// a command "worktree" opens the worktree dialog instead.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FONT = "Lucida Grande";
const BLUE = "#3366aa";
const KEYCELL = 14;

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      // A terminal shown outside a tab (a layout terminal block, a window) has
      // no pane to split, zoom or close: its pane is the block's id.
      const inTab = panes().some((pane) => pane.pane === tg.pane);
      return [
        ...(inTab
          ? [
              ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
              ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
              ["Zoom", "pane.zoom", { pane: tg.pane }],
            ]
          : []),
        ...(term
          ? [
              toProgram
                ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
                : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }],
            ]
          : []),
        ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
        ...(inTab ? [["Close pane", "pane.close", { pane: tg.pane }]] : []),
      ];
    }
    case "tab":
      return [
        ["Rename", "tab.rename", { id: tg.id }],
        ["New tab", "tab.new", { space: tg.space }],
        ["Close", "tab.close", { id: tg.id }],
      ];
    case "space":
      return [
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
        ...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    default:
      return [
        ["New space", "space.new", {}],
        ["Keybinds", "app.help", {}],
        ["Theme: graphite", "app.theme", { name: "graphite" }],
        ["Theme: ink", "app.theme", { name: "ink" }],
        ["Theme: moss", "app.theme", { name: "moss" }],
        ["Theme: atom one dark", "app.theme", { name: "atom-one-dark" }],
      ];
  }
}

function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : command === "app.help" ? "terminal" : command === "app.theme" ? "settings" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? glyphs(k.keys) : "";
}

// "cmd-shift-d" -> "⇧⌘D", as Mac OS 9 menus show shortcuts: modifiers in the
// order Control, Option, Shift, Command, then the key.
function glyphs(text) {
  const parts = String(text).toLowerCase().split("-");
  const key = parts.pop();
  const marks = { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" };
  const named = { enter: "↩", return: "↩", escape: "⎋", backspace: "⌫", delete: "⌦", tab: "⇥", space: "Space", up: "↑", down: "↓", left: "←", right: "→" };
  const mods = ["ctrl", "alt", "shift", "cmd"].filter((m) => parts.includes(m)).map((m) => marks[m]).join("");
  return mods + (named[key] ?? (key.length === 1 ? key.toUpperCase() : key.toUpperCase()));
}

export default class Menu extends View {
  init(_props, cx) {
    // Nothing is highlighted until the pointer or an arrow key picks a row.
    this.at = -1;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  choose(i, cx) {
    const it = items(props(), this.git)[i];
    if (!it) return;
    closeOverlay(props()?.overlay);
    // Platinum worktree dialog: 3px of drop shadow on top of the dialog's size.
    if (it[1] === "worktree") openOverlay({ mod: "platinum-worktree", kind: "dialog", frame: "none", ...(it[2].action === "open" ? { width: 483, height: 403 } : { width: 483, height: it[2].action === "remove" ? 243 : 223 }), props: it[2] });
    // Platinum alert in place of Herdr's own confirm. Cancel is the default.
    else if (it[1] === "space.close") {
      const s = spaces().find((x) => x.id === it[2].id);
      openOverlay({ mod: "platinum-dialog", kind: "dialog", frame: "none", width: 443, height: 193, props: {
        title: `Close the space "${s?.name ?? ""}"?`,
        message: "Its tabs and terminals will be closed. Programs running in them will stop.",
        ok: "Close", kind: "confirm", danger: true,
        run: { name: "space.close", args: { id: it[2].id, confirmed: true } },
      } });
    }
    else run(it[1], it[2]);
  }

  render(cx) {
    const t = theme();
    const list = items(props(), this.git);
    const n = list.length;
    const rows = list.map((it, i) => {
      const keys = shortcut(it[1], it[2]);
      // An embossed separator before Close and before the settings group.
      const sep = i > 0 && (it[1].endsWith(".close") || it[1] === "app.help" || (it[1] === "app.theme" && list[i - 1][1] !== "app.theme"));
      return v_flex()
        .when(sep, (el) => el.child(v_flex().px(2).py(2).child(div().h(1).bg(DARK)).child(div().h(1).bg(LIGHT))))
        .child(h_flex()
          .id(`mi-${i}`)
          .h(22)
          .px(10)
          .gap(8)
          .items_center()
          .text_size(14)
          .font_family(FONT)
          .font_bold()
          .text_color("#000000")
          .when(i === this.at, (el) => el.bg(BLUE).text_color("#ffffff"))
          .hover((s) => s.bg(BLUE).text_color("#ffffff"))
          .on_click((_e, cx) => this.choose(i, cx))
          .child(div().flex_1().truncate().child(it[0]))
          .when(Boolean(keys), (el) => {
            // Modifier marks get one fixed-width cell each, so ⌘ and ⇧ line up
            // across rows; the key itself is plain text, so "F2" stays tight.
            const chars = [...keys];
            const lead = chars.findIndex((c) => !"⌃⌥⇧⌘".includes(c));
            const split = lead < 0 ? chars.length : lead;
            return el.child(h_flex().flex_none().ml(12)
              .children(chars.slice(0, split).map((c) => div().w(KEYCELL).flex().justify_center().child(c)))
              .child(div().child(chars.slice(split).join(""))));
          }));
    });
    // Black outline, white inner highlight, grey face, 2px drop shadow behind.
    return div().relative().w_full()
      .child(div().absolute().top(2).left(2).right(0).bottom(0).bg("#00000066"))
      .child(div().relative().mr(2).mb(2).border(1).border_color("#000000").bg(DARK).pr(1).pb(1).child(
        div().bg(LIGHT).pt(1).pl(1).child(
          v_flex()
            .id("menu")
            .track_focus(this.handle)
            .w_full()
            .min_h(0)
            .py(2)
            .bg("#dddddd")
            .on_key_down((e, cx) => {
              if (e.key === "down") this.at = (this.at + 1) % n;
              else if (e.key === "up") this.at = this.at < 0 ? n - 1 : (this.at + n - 1) % n;
              else if (e.key === "enter") this.choose(this.at, cx);
              else if (e.key === "escape") closeOverlay(props().overlay);
              else return;
              cx.notify();
            })
            .children(rows),
        ),
      ));
  }
}
