// Modified copy of Herdr's shipped `changes` mod, from the Herdr project
// (https://github.com/herdrdev/herdr), licensed under the Apache License 2.0.
// See NOTICE. Changes: square corners, black borders, a gray header bar, a
// square commit input and a plain bordered Platinum commit button. Git, diff
// and commit behaviour is unchanged.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, openOverlay } from "herdr";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: untab(line.slice(1)) || " " }; }
    return { kind: "", text: line };
  });
}

// Platinum panel frame: a 2px sunken bevel, grey on the top and left, white on
// the bottom and right. Elements have no per-edge border colours, so it is
// nested divs with padding.
const frame = (kid) => div().size_full().min_h(0).bg("#808080").pt(2).pl(2)
  .child(div().size_full().min_h(0).bg("#ffffff").pr(2).pb(2).child(kid));

export default class PlatinumChanges extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    // Open in Split and Open in Tab need cria-file-preview.
    this.preview = false;
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", 'test -d "${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/cria-file-preview"']).catch(() => null);
      this.preview = r?.code === 0;
      cx.notify();
    });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          // X is the index column, Y the work tree: what Stage and Unstage can act on.
          files.push({ path, status: s, fresh, staged: xy[0] !== " " && xy[0] !== "?", unstaged: fresh || xy[1] !== " ", ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 9 + 70));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  // The right-click menu: a popup mod gets the whole menu as props.
  menu(f, cx) {
    const abs = `${this.root}/${f.path}`, local = !this.on, name = f.path.split("/").pop();
    const git = (args) => ({ cmd: "git", args, cwd: this.root, on: this.on });
    const file = { file: abs, on: this.on }, diff = { path: f.path, root: this.root, on: this.on };
    const gone = f.status === "D";
    const discard = f.fresh ? ["clean", "-f", "--", f.path] : this.hasHead ? ["restore", "--source=HEAD", "--staged", "--worktree", "--", f.path] : ["rm", "-f", "--", f.path];
    const unstage = this.hasHead ? ["restore", "--staged", "--", f.path] : ["rm", "--cached", "--", f.path];
    const items = [
      { label: "Open Diff in Split", icon: "split-right", act: { run: ["pane.split", { direction: "right", mod: "platinum-diff", props: diff }] } },
      { label: "Open Diff in Tab", act: { run: ["tab.new", { name: `${name} diff`, mod: "platinum-diff", props: diff }] } },
      ...(!gone && this.preview ? [
        { label: "Open File in Split", icon: "split-right", sep: true, act: { run: ["pane.split", { direction: "right", mod: "cria-file-preview", props: file }] } },
        { label: "Open File in Tab", act: { run: ["tab.new", { name, mod: "cria-file-preview", props: file }] } },
      ] : []),
      ...(f.unstaged ? [{ label: "Stage", sep: true, act: { exec: git(["add", "--", f.path]) } }] : []),
      ...(f.staged ? [{ label: "Unstage", sep: !f.unstaged, act: { exec: git(unstage) } }] : []),
      { label: "Discard Changes…", act: { dialog: { kind: "confirm", danger: true, title: `Discard changes to “${name}”?`,
        message: f.fresh ? "The new file is deleted. This cannot be undone." : "Your edits to this file are lost. This cannot be undone.", ok: "Discard", exec: git(discard) } } },
      ...(local && !gone ? [{ label: "Reveal in Finder", sep: true, act: { exec: { cmd: "open", args: ["-R", abs] } } }] : []),
      { label: "Copy Path", sep: !(local && !gone), act: { copy: abs } },
      { label: "Copy Relative Path", act: { copy: f.path } },
    ];
    openOverlay({ mod: "platinum-context", kind: "popup", width: 240, height: items.length * 22 + items.filter((i) => i.sep).length * 6 + 14, frame: "none", props: { items } });
    // Look again after the command runs.
    for (const ms of [1500, 4000]) cx.timer?.after?.(ms, (cx) => this.refresh(cx));
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(24).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(24).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(44).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  // A raised Platinum button: rounded black outline, white top-left edge, gray
  // bottom-right edge. The API has no per-edge border colors, so it is three
  // nested boxes: padding leaves 1px of each outer box showing. An enabled
  // button is the default button, so it gets the heavy outer ring.
  bevelButton(t, id, enabled, label, onClick) {
    return div().id(`${id}-ring`).flex_none().p(1).border_2().rounded(9).bg(t.surface)
      .border_color(enabled ? t.foreground : t.surface)
      .child(div().id(id).h(28).border_1().rounded(6).overflow_hidden().border_color(enabled ? t.foreground : t.border)
        .bg("#808080").pr(1).pb(1)
        .child(div().size_full().bg("#ffffff").pl(1).pt(1).rounded(5)
          .child(div().id(`${id}-face`).size_full().px(14).flex().items_center().justify_center().rounded(4)
            .bg(t.surface).text_color(enabled ? t.foreground : t.dim).text_size(14).font_family("Lucida Grande").font_bold()
            .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.accent)))
            .on_click(onClick).child(label))));
  }

  render(cx) {
    return frame(this.content(cx));
  }

  content(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(0).overflow_hidden().bg(t.background).border_1().border_color(t.foreground).text_color(t.foreground).text_size(14).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      // Platinum title bar: dotted band, centred bold title.
      .child(h_flex().relative().overflow_hidden().h(36).flex_none().items_center().text_size(14)
        .child(image("mods/platinum-changes/titlebar-dots.svg").absolute().top(0).left(0).w(640).h(36))
        .child(div().flex_1())
        .child(div().px(10).h(20).flex().items_center().bg(t.surface).font_family("Lucida Grande").font_bold().child("Changes"))
        .child(div().flex_1()))
      // Info strip under the title bar: file count and line totals.
      .child(h_flex().h(26).flex_none().px(10).gap(10).items_center().justify_center().bg(t.surface).border_b(1).border_color(t.border).text_size(14).text_color(t.muted)
        .child(`${this.files.length} ${this.files.length === 1 ? "file" : "files"}`)
        .child(div().text_color(t.ansi2).child(`+${add}`)).child(div().text_color(t.ansi1).child(`−${del}`)))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().flex_1().min_h(44).max_h(this.files.length * 32 + 12).relative().border_b(1).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(0).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(32).flex_none().px(8).gap(8).items_center().rounded(0).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(f, cx); })
          .child(div().w(20).text_size(14).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .when(f.add > 0, (e) => e.child(div().text_size(14).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(14).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(14).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(14)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 24, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(14).text_color(t.ansi1).child(this.note)))
      .child(h_flex().flex_none().p(10).gap(8).items_center().border_t(1).border_color(t.border)
        // Sunken field: gray top-left edge, white bottom-right edge, as nested
        // boxes (see bevelButton).
        .child(div().id("commit-message").flex_1().min_w(0).h(34).border_1().border_color(this.typing ? t.ring : t.foreground)
          .bg("#ffffff").pr(1).pb(1).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(div().size_full().bg("#808080").pl(1).pt(1)
            .child(div().size_full().px(9).flex().items_center().bg(t.input)
              .child(Input.new(this.input).h_full().text_size(14).text_color(t.foreground)))))
        .child(this.bevelButton(t, "commit", enabled, this.busy ? "Committing…" : "Commit", (_e, cx) => this.commit(cx))));
  }
}
