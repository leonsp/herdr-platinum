// Mac OS 9 Platinum alert, or a one-line prompt. Props:
//   { title, message?, ok, kind: "confirm" | "prompt", value?, danger?,
//     exec: { cmd, args, cwd, on }, overlay }
// OK runs `exec`; in a prompt, an arg that is exactly "{input}" becomes the
// typed text. A failure shows the program's message in the dialog. A danger
// dialog makes Cancel the default button, so Return is safe.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, exec, theme } from "herdr";

const DARK = "#808080";
const LIGHT = "#ffffff";
const FONT = "Lucida Grande";
const FOCUS = "#6a9fd0";

export default class PlatinumDialog extends View {
  init(_props, cx) {
    this.prompt = props()?.kind === "prompt";
    this.error = "";
    this.busy = false;
    this.text = props()?.value ?? "";
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (this.prompt) {
      this.input = InputState.new({ value: this.text });
      this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; cx.notify(); });
      this.input.on("submit", (_e, cx) => this.accept(cx));
      this.input.focus();
      cx.timer.after(300, () => this.input.focus());
    }
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  accept(cx) {
    if (this.busy) return;
    if (props()?.danger) return this.close();
    this.ok(cx);
  }

  ok(cx) {
    const p = props() ?? {};
    if (this.busy || !p.exec) return;
    if (this.prompt && !this.text.trim()) { this.error = "Enter a name."; cx.notify(); return; }
    this.busy = true;
    cx.notify();
    const args = (p.exec.args ?? []).map((a) => (a === "{input}" ? this.text.trim() : a));
    cx.spawn(async (cx) => {
      try {
        const r = await exec(p.exec.cmd, args, { cwd: p.exec.cwd, on: p.exec.on });
        if (r.code !== 0) this.error = (r.stderr || r.stdout || "That did not work.").trim().split("\n")[0];
      } catch (e) { this.error = String(e); }
      this.busy = false;
      if (!this.error) this.close();
      cx.notify();
    });
  }

  // Platinum push button: black outline, white top-left, grey bottom-right.
  // The default button gets a second outline.
  button(t, id, text, action, isDefault) {
    const face = div().h(22).px(16).flex().items_center().justify_center().bg(t.chrome)
      .text_size(14).font_family(FONT).font_bold().text_color("#000000").hover((s) => s.bg(t.hover)).child(text);
    const btn = div().id(id).flex_none().rounded(3).border_1().border_color("#000000").bg(DARK)
      .on_click(action)
      .child(div().pr(1).pb(1).rounded(2).bg(DARK).child(div().pt(1).pl(1).rounded(2).bg(LIGHT).child(face)));
    return isDefault ? div().p(2).rounded(5).border_1().border_color("#000000").child(btn) : div().p(3).child(btn);
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const danger = Boolean(p.danger);
    const dialog = v_flex().id("platinum-dialog").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { this.close(); cx.stop_propagation(); }
        else if (e.key === "enter" && !this.prompt) this.accept(cx);
      })
      .size_full().px(18).pt(16).pb(14).gap(10).bg("#dddddd").border_1().border_color("#000000")
      .text_size(14).font_family(FONT).text_color("#000000")
      .child(div().font_bold().child(p.title ?? ""))
      .when(Boolean(p.message), (el) => el.child(div().text_size(12).text_color("#444444").child(p.message)))
      .when(this.prompt, (el) => el.child(
        div().p(2).rounded(3).bg(FOCUS).child(
          div().border_1().border_color("#000000").pr(1).pb(1).bg(LIGHT).child(
            div().pt(1).pl(1).bg(DARK).child(
              Input.new(this.input).h(22).px(5).bg("#ffffff").text_size(14).font_family(FONT).font_bold().text_color("#000000"))))))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().justify_end().items_center().gap(4)
        .when(this.busy, (el) => el.child(div().text_size(12).text_color(DARK).mr(8).child("working…")))
        .child(this.button(t, "dlg-cancel", "Cancel", () => this.close(), danger))
        .child(this.button(t, "dlg-ok", p.ok ?? "OK", (_e, cx) => this.ok(cx), !danger)));
    // The drop shadow is a dark block offset 3px down and right, behind.
    return div().relative().size_full()
      .child(div().absolute().top(3).left(3).right(0).bottom(0).bg("#00000066"))
      .child(div().absolute().top(0).left(0).right(3).bottom(3).child(dialog));
  }
}
