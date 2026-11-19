// Mac OS 9 Platinum context menu for panel rows (Files, Changes). The panel
// passes the whole menu as props, since a popup can't call back into it:
//   { items: [{ label, icon?, enabled?, sep?, act }], overlay }
// `sep` draws a separator above the row. `icon` names an SVG in platinum-grip
// (split-right, split-down). `act` is one of:
//   { run: [command, args] }          an app command
//   { exec: { cmd, args, cwd, on } }  a program, on a machine
//   { copy: text }                    the text to the clipboard
//   { shared: [key, value] }          a value the panel reads back
//   { dialog: {...} }                 opens platinum-dialog with these props
// Arrows move, Return runs, Esc closes.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, exec, setShared } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FONT = "Lucida Grande";
const BLUE = "#3366aa";

export default class PlatinumContext extends View {
  init(_props, _cx) {
    this.at = -1;
    this.handle = _cx.focus_handle();
    this.handle.focus();
  }

  items() {
    return props()?.items ?? [];
  }

  choose(i) {
    const it = this.items()[i];
    if (!it || it.enabled === false) return;
    closeOverlay(props()?.overlay);
    const a = it.act ?? {};
    if (a.run) run(a.run[0], a.run[1] ?? {});
    else if (a.exec) exec(a.exec.cmd, a.exec.args ?? [], { cwd: a.exec.cwd, on: a.exec.on }).catch(() => {});
    else if (a.copy !== undefined) exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", a.copy]).catch(() => {});
    else if (a.shared) setShared(a.shared[0], a.shared[1]);
    else if (a.dialog) openOverlay({ mod: "platinum-dialog", kind: "dialog", frame: "none", width: 443, height: a.dialog.height ?? 193, props: a.dialog });
  }

  render() {
    const list = this.items();
    const n = list.length;
    const icons = list.some((it) => it.icon);
    const rows = list.map((it, i) => {
      const on = it.enabled !== false;
      return v_flex()
        .when(it.sep && i > 0, (el) => el.child(v_flex().px(2).py(2).child(div().h(1).bg(DARK)).child(div().h(1).bg(LIGHT))))
        .child(h_flex()
          .id(`ctx-${i}`)
          .h(22)
          .px(10)
          .gap(8)
          .items_center()
          .text_size(14)
          .font_family(FONT)
          .font_bold()
          .text_color(on ? "#000000" : DARK)
          .when(on && i === this.at, (el) => el.bg(BLUE).text_color("#ffffff"))
          .when(on, (el) => el.hover((s) => s.bg(BLUE).text_color("#ffffff")).on_click(() => this.choose(i)))
          .when(icons, (el) => el.child(div().w(16).h(16).flex_none().flex().items_center().justify_center()
            .when(Boolean(it.icon), (d) => d.child(image(`mods/platinum-grip/${it.icon}.svg`).w(14).h(14)))))
          .child(div().flex_1().truncate().child(it.label)));
    });
    // Black outline, white inner highlight, grey face, 2px drop shadow.
    return div().relative().w_full()
      .child(div().absolute().top(2).left(2).right(0).bottom(0).bg("#00000066"))
      .child(div().relative().mr(2).mb(2).border(1).border_color("#000000").bg(DARK).pr(1).pb(1).child(
        div().bg(LIGHT).pt(1).pl(1).child(
          v_flex()
            .id("ctx")
            .track_focus(this.handle)
            .w_full()
            .min_h(0)
            .py(2)
            .bg("#dddddd")
            .on_key_down((e, cx) => {
              const ok = (j) => list[j]?.enabled !== false;
              const step = (d) => { let j = this.at; for (let k = 0; k < n; k++) { j = (j + d + n) % n; if (ok(j)) return j; } return this.at; };
              if (e.key === "down") this.at = step(1);
              else if (e.key === "up") this.at = this.at < 0 ? step(-1) : step(-1);
              else if (e.key === "enter") this.choose(this.at);
              else if (e.key === "escape") closeOverlay(props()?.overlay);
              else return;
              cx.notify();
            })
            .children(rows),
        ),
      ));
  }
}
