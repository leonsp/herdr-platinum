// Mac OS 9 Platinum "+" menu: grey, bold Lucida Grande, a solid blue
// highlight, embossed separators, shortcuts on the right. Replaces the
// shipped new-menu, which the tab bar no longer opens.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, knownAgents, focused, theme } from "herdr";

const FONT = "Lucida Grande";
const BLUE = "#3366aa";
const GREY = "#dddddd";
const ROW = 22;

export default class PlatinumNewMenu extends View {
  init(_props, cx) {
    this.agents = [];
    cx.spawn(async (cx) => {
      try { this.agents = (await knownAgents()) ?? []; } catch { this.agents = []; }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  sep() {
    return v_flex().px(2).py(2).child(div().h(1).bg("#808080")).child(div().h(1).bg("#ffffff"));
  }

  // A row. Disabled rows are grey and do not highlight.
  item(id, label, { icon, keys, note, enabled = true, onClick } = {}) {
    const row = h_flex().id(id).h(ROW).px(10).gap(8).items_center().flex_none()
      .text_size(14).font_family(FONT).font_bold()
      .text_color(enabled ? "#000000" : "#808080")
      .when(enabled, (el) => el.hover((s) => s.bg(BLUE).text_color("#ffffff")).on_click(() => { this.close(); onClick?.(); }))
      .child(div().w(16).h(16).flex_none().flex().items_center().justify_center().when(Boolean(icon), (el) => el.child(icon)))
      .child(div().flex_1().truncate().child(label));
    const tail = keys ?? note;
    return tail ? row.child(div().flex_none().pl(12).child(tail)) : row;
  }

  render() {
    const t = theme();
    const space = focused()?.space;
    const target = space?.id ?? space;
    // Only agents that can start; the not-installed ones are noise.
    const agents = (this.agents ?? []).filter((a) => a.installed);
    const rows = [
      this.item("new-terminal", "Terminal", { icon: svg("mods/workspace-chrome/terminal.svg").size(14).text_color(t.foreground), keys: "⌘T", onClick: () => run("tab.new") }),
      ...(agents.length ? [this.sep(), this.item("agents-head", "Start an agent", { enabled: false })] : []),
      ...agents.map((a, i) => this.item(`agent-${i}`, a.name ?? a.key, {
        icon: a.icon ? (a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14)) : undefined,
        onClick: () => run("tab.new", { argv: a.run }),
      })),
      this.sep(),
      this.item("new-space", "New space", { keys: "⌘N", onClick: () => run("space.new") }),
      this.item("new-worktree", "New worktree…", { onClick: () => openOverlay({ mod: "platinum-worktree", kind: "dialog", width: 483, height: 223, frame: "none", props: { space: target, action: "new" } }) }),
      this.item("open-worktree", "Open worktree…", { onClick: () => openOverlay({ mod: "platinum-worktree", kind: "dialog", width: 483, height: 403, frame: "none", props: { space: target, action: "open" } }) }),
    ];
    // Black outline, white highlight inside on the top and left, grey shadow
    // on the bottom and right.
    // The drop shadow is a dark block offset 2px down and right, behind.
    return div().relative().w_full()
      .child(div().absolute().top(2).left(2).right(0).bottom(0).bg("#00000066"))
      .child(div().relative().mr(2).mb(2).border(1).border_color("#000000").bg("#808080").pr(1).pb(1).child(
        div().bg("#ffffff").pt(1).pl(1).child(
          v_flex().w_full().py(2).bg(GREY).children(rows),
        ),
      ));
  }
}
