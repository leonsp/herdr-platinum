// Open a file by path: a small Platinum dialog with a text field. Paste a path
// and press Return (or Open) to show the file in a cria-file-preview tab.
// Newlines from a wrapped copy are dropped, so the path comes out whole.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, theme, settings, spaces, focused } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FONT = "Lucida Grande";

// "/a/b\n/c.md" (a path wrapped across lines) -> "/a/b/c.md". Also drops
// surrounding quotes and a file:// prefix, and expands a leading ~.
export function cleanPath(text, home = "", base = "") {
  let p = (text ?? "").replace(/[\r\n\u2028\u2029]+/g, "").trim();
  p = p.replace(/^(["'`])(.*)\1$/, "$2").trim();
  if (/^file:\/\//i.test(p)) {
    p = p.replace(/^file:\/\//i, "");
    try { p = decodeURIComponent(p); } catch { /* keep as is */ }
  }
  if (p === "~" || p.startsWith("~/")) p = home + p.slice(1);
  else if (p && !p.startsWith("/") && base) p = `${base.replace(/\/+$/, "")}/${p}`;
  return p;
}

export default class PlatinumOpen extends View {
  init(_props, cx) {
    this.text = "";
    this.input = InputState.new({ value: "" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // split: show the file in a pane beside the focused one, not in a new tab.
  submit(split = false) {
    const space = spaces().find((s) => s.active), f = focused();
    const file = cleanPath(this.text, settings()?.home ?? "", f?.cwd || space?.folder || "");
    if (!file) return;
    closeOverlay(props()?.overlay);
    const p = { file, on: space?.machine ?? null };
    if (split) run("pane.split", { direction: "right", mod: "cria-file-preview", props: p });
    else run("tab.new", { name: file.split("/").pop(), mod: "cria-file-preview", props: p });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
  }

  // Platinum push button: black outline, white top-left, grey bottom-right.
  // The default button gets a second outline, as in Mac OS 9 dialogs.
  button(t, id, text, action, isDefault) {
    const face = div().h(22).px(16).flex().items_center().justify_center().bg(t.chrome)
      .text_size(14).font_family(FONT).font_bold().text_color(t.foreground).hover((s) => s.bg(t.hover)).child(text);
    const btn = div().id(id).flex_none().rounded(3).border_1().border_color("#000000").bg(DARK)
      .on_click(action)
      .child(div().pr(1).pb(1).rounded(2).bg(DARK).child(div().pt(1).pl(1).rounded(2).bg(LIGHT).child(face)));
    return isDefault ? div().p(2).rounded(5).border_1().border_color("#000000").child(btn) : div().p(3).child(btn);
  }

  render() {
    const t = theme();
    return v_flex().id("platinum-open").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().px(18).pt(16).pb(14).gap(10).bg(t.chrome).border_1().border_color("#000000").text_color(t.foreground)
      .font_family(FONT)
      .child(div().text_size(14).font_bold().child("Open a file by path"))
      // Sunken text field: grey top and left, white bottom and right.
      .child(div().pr(1).pb(1).bg(LIGHT).child(div().pt(1).pl(1).bg(DARK).child(
        Input.new(this.input).h(24).px(6).bg("#ffffff").text_size(13).text_color(t.foreground))))
      .child(div().text_size(12).text_color(t.dim).child("Paste a path to a Markdown or other file. Return opens it."))
      .child(h_flex().justify_end().items_center().gap(4)
        .child(this.button(t, "po-cancel", "Cancel", () => closeOverlay(props()?.overlay), false))
        .child(this.button(t, "po-split", "Open Split", () => this.submit(true), false))
        .child(this.button(t, "po-open", "Open", () => this.submit(), true)));
  }
}
