// Mac OS 9 Platinum pane header: close box, pinstripes, centered title,
// zoom box. Pinstripes show only on the focused pane, as in Platinum.
// Props from the app: { pane, terminal }. Click: focus the pane.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, props, run, theme } from "herdr";

const STRIPES = 5;
const BOX = 14;
// Face of a box inside its border and 1px bevel, and the darkest row's alpha.
const FACE = BOX - 4;
const SHADE = 0x4d;
const BANDS = 5;

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
  // Platinum. Each is a sunken 1px bevel with a face that darkens towards the
  // bottom. The kit can only fill an element with a flat colour, so the
  // gradient is bands of black at rising alpha over the face colour. That keeps
  // the hover tint, which changes the face colour beneath.
  box(t, id, tip, command, args, inner) {
    const rows = [];
    for (let i = 0; i < BANDS; i++) {
      const alpha = Math.round((i / (BANDS - 1)) * SHADE).toString(16).padStart(2, "0");
      rows.push(div().h(FACE / BANDS).w_full().bg(`#000000${alpha}`));
    }
    return div()
      .id(id)
      .tooltip(tip)
      .w(BOX)
      .h(BOX)
      .flex_none()
      .border(1)
      .border_color(t.foreground)
      .bg("#808080")
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(
        div().size_full().bg("#ffffff").pr(1).pb(1).child(
          div().size_full().bg("#808080").pt(1).pl(1).child(
            div()
              .id(`${id}-face`)
              .size_full()
              .relative()
              .flex()
              .items_center()
              .justify_center()
              .bg(t.input)
              .hover((s) => s.bg(t.accent))
              .child(v_flex().absolute().inset_0().children(rows))
              .when(Boolean(inner), (el) =>
                el.child(div().w(6).h(6).border(1).border_color(t.foreground)),
              ),
          ),
        ),
      );
  }

  // The tooltip shows the whole title when the header cuts it short.
  title(pane, name, color) {
    return div()
      .id(`title-${pane}`)
      .tooltip(name)
      .flex_none()
      .truncate()
      .max_w(320)
      .px(8)
      .font_family("Lucida Grande")
      .font_bold()
      .text_color(color)
      .child(name);
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
          this.title(pane, name, t.foreground),
          this.stripes(t),
          this.box(t, `zoom-${pane}`, "Zoom pane", "pane.zoom", { pane }, true),
        ]
      : [
          div().w(BOX).h(BOX).flex_none(),
          div().flex_1(),
          this.title(pane, name, t.muted),
          div().flex_1(),
          div().w(BOX).h(BOX).flex_none(),
        ];

    // A raised bevel around the header: white 2px on the top and left, grey 2px
    // on the bottom and 1px on the right. Nested divs, as elements have no per-edge colours.
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
              .id(`pane-head-${pane}`)
              .size_full()
              .items_center()
              .px(4)
              .gap(2)
              .bg(t.surface)
              .text_size(14)
              .on_hover((hovered) => {
                // Focus follows the pointer onto the header.
                if (hovered && !this.me()?.focused) run("pane.focus", { pane });
              })
              .on_click(() => run("pane.focus", { pane }))
              .children(kids),
          ),
      );
  }
}
