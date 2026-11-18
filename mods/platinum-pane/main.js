// Mac OS 9 Platinum pane header: close box, pinstripes, centered title,
// zoom box. Pinstripes show only on the focused pane, as in Platinum.
// Props from the app: { pane, terminal }. Click: focus the pane.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, props, run, theme } from "herdr";

const STRIPES = 5;
const BOX = 14;

export default class PlatinumPane extends View {
  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  stripes(t) {
    const lines = [];
    for (let i = 0; i < STRIPES; i++) {
      // Embossed: a dark line with a white highlight beneath it.
      lines.push(v_flex().child(div().h(1).bg(t.dim)).child(div().h(1).bg("#ffffff")));
    }
    return v_flex().flex_1().gap(1).px(4).children(lines);
  }

  // The close box is empty; the zoom box holds a small inner square, as in
  // Platinum.
  box(t, id, tip, command, args, inner) {
    return div()
      .id(id)
      .tooltip(tip)
      .w(BOX)
      .h(BOX)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .bg(t.input)
      .border(1)
      .border_color(t.foreground)
      .hover((s) => s.bg(t.accent))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .when(Boolean(inner), (el) =>
        el.child(div().w(6).h(6).border(1).border_color(t.foreground)));
  }

  render(_cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const pane = p.pane;
    // Shells often set the title to user@host:path. Keep the path, drop the
    // account and machine name.
    const name = (p.title || p.program?.name || "shell").replace(/^[^@\s:]+@[^:\s]+:\s*/, "");

    const kids = p.focused
      ? [
          this.box(t, `close-${pane}`, "Close pane", "pane.close", { pane }),
          this.stripes(t),
          div().flex_none().truncate().max_w(320).px(8).font_family("Lucida Grande").font_bold().text_color(t.foreground).child(name),
          this.stripes(t),
          this.box(t, `zoom-${pane}`, "Zoom pane", "pane.zoom", { pane }, true),
        ]
      : [
          div().w(BOX).h(BOX).flex_none(),
          div().flex_1(),
          div().flex_none().truncate().max_w(320).px(8).font_family("Lucida Grande").font_bold().text_color(t.muted).child(name),
          div().flex_1(),
          div().w(BOX).h(BOX).flex_none(),
        ];

    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .items_center()
      .px(6)
      .gap(2)
      .bg(t.surface)
      .border_b(1)
      .border_color(t.border)
      .text_size(14)
      .on_click(() => run("pane.focus", { pane }))
      .children(kids);
  }
}
