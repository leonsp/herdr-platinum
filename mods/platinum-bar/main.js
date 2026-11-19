// Mac OS 9 Platinum window bar: pinstripes with the space name centered.
// Replaces the system title bar (layout root "titlebar": "none"). The macOS
// window buttons sit over the left gap, at the layout's "traffic_lights".
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, theme, settings } from "herdr";

const STRIPES = 5;
const BUTTONS_GAP = 78;

export default class PlatinumBar extends View {
  stripes(t) {
    const lines = [];
    for (let i = 0; i < STRIPES; i++) {
      // Embossed: a dark line with a white highlight beneath it.
      lines.push(v_flex().child(div().h(1).bg(t.dim)).child(div().h(1).bg("#ffffff")));
    }
    return v_flex().flex_1().gap(1).px(4).children(lines);
  }

  render(_cx) {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const name = space?.name || "Herdr";
    // The macOS window buttons keep their size at any zoom, so the gap that
    // clears them shrinks as the UI zooms in.
    const gap = Math.round(BUTTONS_GAP / (settings()?.zoom || 1));

    // A raised bevel: white 2px on the top and left, grey 2px on the bottom and
    // 1px on the right. Nested divs, as elements have no per-edge colours.
    return div()
      .size_full()
      .bg("#808080")
      .pr(1)
      .pb(2)
      .border_b(1)
      .border_color(t.border)
      .child(
        div()
          .size_full()
          .bg("#ffffff")
          .pt(2)
          .pl(2)
          .child(
            h_flex()
              .size_full()
              .items_center()
              .gap(2)
              .pr(8)
              .bg(t.chrome)
              .text_size(14)
              .children([
                div().w(Math.max(0, gap - 2)).h(12).flex_none(),
                this.stripes(t),
                div().flex_none().truncate().max_w(320).px(8).font_family("Lucida Grande").font_bold().text_color(t.foreground).child(name),
                this.stripes(t),
                // Mirrors the button gap on the left (less the row's 8px right padding).
                div().w(Math.max(0, gap - 8)).h(12).flex_none(),
              ]),
          ),
      );
  }
}
