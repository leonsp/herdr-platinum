// Modified copy of Herdr's shipped `toast` mod, from the Herdr project
// (https://github.com/herdrdev/herdr), licensed under the Apache License 2.0.
// See NOTICE. Changes: a Mac OS 9 look (square corners, black outline,
// 2px bevel on a grey face, a hard drop shadow, bold Lucida Grande) and a
// square level marker. Behaviour is unchanged.
//
// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme } from "herdr";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

// Platinum bevel, 2px. Raised: white on the top and left, grey on the bottom
// and right. Elements have no per-edge border colours, so they are nested divs.
const raised = (kid) => div().size_full().bg("#808080").pr(1).pb(1)
  .child(div().size_full().bg("#ffffff").pt(1).pl(1).child(kid));

export default class Toast extends View {
  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const face = h_flex()
      .id("toast")
      .size_full()
      .px(14)
      .gap(12)
      .items_center()
      .bg("#dddddd")
      .cursor_pointer()
      .hover((s) => s.bg("#e8e8e8"))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(12).flex_none().border_1().border_color("#000000").bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_family("Lucida Grande").font_bold().text_size(14).text_color("#000000").child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().font_family("Lucida Grande").text_size(13).text_color("#444444").child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).font_family("Lucida Grande").text_size(13).text_color("#444444").child(command))
            .child(div().id("toast-login-copy").flex_none().px(8).py(2).border_1().border_color("#000000").bg("#ffffff")
              .font_family("Lucida Grande").text_size(13).text_color("#000000").cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
    // Black outline, the bevel inside it, and a dark block offset 2px down
    // and right as the drop shadow.
    return div().relative().size_full()
      .child(div().absolute().top(2).left(2).right(0).bottom(0).bg("#00000066"))
      .child(div().relative().mr(2).mb(2).h_full().border_1().border_color("#000000").child(raised(face)));
  }
}
