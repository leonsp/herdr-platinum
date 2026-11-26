// Mac OS 9 Platinum keybind list: a window with a striped title bar and a close
// box, a sunken filter field, and the keys grouped in a sunken list.
// Modified copy of Herdr's `help` mod. Reads keys.json through keys(); edit
// keys.json to change any of them. Open it with `mod.open platinum-help`.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { keys, props, closeOverlay, theme } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FONT = "Lucida Grande";
const FOCUS = "#6a9fd0";

const GROUPS = [
  ["spaces", /^space\./],
  ["tabs", /^tab\./],
  ["panes", /^pane\./],
  ["agents", /^agent\./],
  ["terminal", /^terminal\.|^send:/],
  ["window", /./],
];

function label(action) {
  if (action.startsWith("send:")) return "type " + JSON.stringify(action.slice(5));
  const [name, arg] = action.split(":");
  const words = name.replace(/[._]/g, " ");
  return arg ? `${words} ${arg}` : words;
}

export default class PlatinumHelp extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Type to filter…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  // Embossed pinstripes: a dark line with a white highlight beneath it.
  stripes(t) {
    const lines = [];
    for (let i = 0; i < 5; i++) lines.push(v_flex().child(div().h(1).bg(t.dim)).child(div().h(1).bg(LIGHT)));
    return v_flex().flex_1().gap(1).px(4).children(lines);
  }

  // The close box: a sunken 1px bevel around a pale face.
  closeBox(t) {
    return div().id("help-close").tooltip("Close").w(14).h(14).flex_none().border(1).border_color("#000000").bg(DARK)
      .on_click((_e, cx) => { cx.stop_propagation(); this.close(); })
      .child(div().size_full().bg(LIGHT).pr(1).pb(1).child(
        div().size_full().bg(DARK).pt(1).pl(1).child(
          div().size_full().bg(t.input).hover((s) => s.bg(t.accent)))));
  }

  titleBar(t) {
    return h_flex().h(22).flex_none().items_center().gap(0).px(6).bg("#e8e8e8").border_b(1).border_color("#000000")
      .child(this.closeBox(t))
      .child(this.stripes(t))
      .child(div().flex_none().px(8).font_family(FONT).font_bold().text_size(14).text_color("#000000").child("Keybinds"))
      .child(this.stripes(t))
      .child(div().w(14).h(14).flex_none());
  }

  // A sunken field: grey top and left, white bottom and right, inside a black
  // outline, with the focus ring around it.
  filterField() {
    return div().flex_none().p(2).rounded(3).bg(FOCUS).child(
      div().border_1().border_color("#000000").pr(1).pb(1).bg(LIGHT).child(
        div().pt(1).pl(1).bg(DARK).child(
          Input.new(this.input).h(22).px(5).bg("#ffffff").text_size(14).font_family(FONT).text_color("#000000"))));
  }

  row(t, k) {
    return h_flex().h(24).px(8).items_center().text_size(13).font_family(FONT)
      .hover((s) => s.bg(t.accent))
      .child(div().w(190).font_bold().text_color("#000000").child(k.keys + (k.section !== "global" ? `  (${k.section})` : "")))
      .child(div().text_color("#333333").child(label(k.action)));
  }

  render(_cx) {
    const t = theme();
    const f = this.filter.toLowerCase();
    const all = keys().filter((k) => !f || k.keys.includes(f) || label(k.action).includes(f));
    const seen = new Set();
    const groups = GROUPS.map(([name, re]) => {
      const rows = all.filter((k) => !seen.has(k) && re.test(k.action) && (seen.add(k) || true));
      return [name, rows];
    }).filter(([, rows]) => rows.length > 0);

    const list = v_flex().flex_1().min_h(0).border_1().border_color("#000000").pr(1).pb(1).bg(LIGHT).child(
      v_flex().size_full().min_h(0).pt(1).pl(1).bg(DARK).child(
        v_flex().size_full().min_h(0).overflow_y_scrollbar().bg(LIGHT).pb(6).children(
          groups.map(([name, rows]) =>
            v_flex()
              .child(div().h(22).px(8).flex().items_center().bg("#ececec").border_b(1).border_color("#bbbbbb")
                .font_family(FONT).font_bold().text_size(12).text_color("#000000").child(name))
              .children(rows.map((k) => this.row(t, k))),
          ),
        ),
      ),
    );

    const win = v_flex().id("help").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { this.close(); cx.stop_propagation(); }
      })
      .size_full().min_h(0).bg("#dddddd").border_1().border_color("#000000")
      .font_family(FONT).text_color("#000000")
      .child(this.titleBar(t))
      .child(v_flex().flex_1().min_h(0).p(14).gap(10).child(this.filterField()).child(list));

    // The drop shadow is a dark block offset 3px down and right, behind.
    return div().relative().size_full()
      .child(div().absolute().top(3).left(3).right(0).bottom(0).bg("#00000066"))
      .child(div().absolute().top(0).left(0).right(3).bottom(3).child(win));
  }
}
