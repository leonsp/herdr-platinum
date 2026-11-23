// A lazy file browser for the focused pane's folder, with bounded read-only previews.
// Modified copy of Herdr's shipped `files` mod, from the Herdr project
// (https://github.com/herdrdev/herdr), licensed under the Apache License 2.0.
// See NOTICE. Changes: full-color folder and document icons (image() keeps
// their colors), square corners, a gray header, lilac row hover.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, hc, readTextFile, watchFolder, theme, settings, window, run, openOverlay } from "herdr";

// A pane's cwd is its shell's folder. A program started elsewhere (claude in
// another worktree, say) runs in a different one, and that is the folder the
// pane is about. hc knows it, so ask and remember the answer per terminal.
const foreground = new Map(), probed = new Map();
async function probe(terminal) {
  if (!terminal || Date.now() - (probed.get(terminal) ?? 0) < 2000) return false;
  probed.set(terminal, Date.now());
  const before = foreground.get(terminal);
  try {
    const r = await hc(["get", terminal]);
    const cwd = r.code === 0 ? JSON.parse(r.stdout).foreground?.cwd : null;
    if (cwd) foreground.set(terminal, cwd); else foreground.delete(terminal);
  } catch { foreground.delete(terminal); }
  return foreground.get(terminal) !== before;
}

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: foreground.get(f?.terminal) || pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

// Platinum panel frame: a 2px sunken bevel, grey on the top and left, white on
// the bottom and right. Elements have no per-edge border colours, so it is
// nested divs with padding.
const frame = (kid) => div().size_full().min_h(0).bg("#808080").pt(2).pl(2)
  .child(div().size_full().min_h(0).bg("#ffffff").pr(2).pb(2).child(kid));

export default class PlatinumFiles extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    // Files open in cria-file-preview (Markdown, PDF, images, tables, JSON,
    // code), when that mod is installed.
    this.preview = false;
    cx.spawn(async cx => {
      const r = await exec("sh", ["-c", 'test -d "${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/cria-file-preview"']).catch(() => null);
      this.preview = r?.code === 0;
      cx.notify();
    });
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    probe(focused()?.terminal).then((changed) => { if (changed) cx.notify(); });
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // The right-click menu: a popup mod gets the whole menu as props. Reveal,
  // Rename and Delete use the local Finder, so they are left out on a remote
  // machine.
  menu(entry, path, cx) {
    const abs = `${this.root}/${path}`, local = !this.on, dir = abs.slice(0, abs.lastIndexOf("/"));
    const file = { file: abs, on: this.on };
    const items = [
      ...(!entry.dir && this.preview ? [
        { label: "Open in Split", icon: "split-right", act: { run: ["pane.split", { direction: "right", mod: "cria-file-preview", props: file }] } },
        { label: "Open in Tab", act: { run: ["tab.new", { name: entry.name, mod: "cria-file-preview", props: file }] } },
      ] : []),
      ...(local ? [{ label: "Reveal in Finder", sep: !entry.dir && this.preview, act: { exec: { cmd: "open", args: ["-R", abs] } } }] : []),
      { label: "Copy Path", sep: !local && !entry.dir && this.preview, act: { copy: abs } },
      { label: "Copy Relative Path", act: { copy: path } },
      ...(local ? [
        { label: "Rename…", sep: true, act: { dialog: { kind: "prompt", title: `Rename “${entry.name}”`, message: "Type a new name.", value: entry.name, ok: "Rename", height: 213,
          exec: { cmd: "sh", args: ["-c", 'n="$2"; case "$n" in ""|*/*) echo "Enter a name without slashes." >&2; exit 1;; esac; d=$(dirname "$1"); [ -e "$d/$n" ] && { echo "That name is already taken." >&2; exit 1; }; mv -- "$1" "$d/$n"', "rename", abs, "{input}"] } } } },
        { label: "Move to Trash…", act: { dialog: { kind: "confirm", danger: true, title: `Move “${entry.name}” to the Trash?`, message: entry.dir ? "The folder and everything in it go to the Trash." : "The file goes to the Trash.", ok: "Move to Trash",
          exec: { cmd: "osascript", args: ["-e", "on run argv\ntell application \"Finder\" to delete POSIX file (item 1 of argv)\nend run", abs] } } } },
      ] : []),
    ];
    openOverlay({ mod: "platinum-context", kind: "popup", width: 240, height: items.length * 22 + items.filter((i) => i.sep).length * 6 + 14, frame: "none", props: { items } });
    // The folder watch only sees local changes; look again after the command.
    for (const ms of [1500, 4000]) cx.timer?.after?.(ms, (cx) => this.refresh(cx));
  }

  icon(entry, open) {
    const name = entry.dir ? (open ? "folder-open" : "folder-closed") : "file";
    return image(`mods/platinum-files/${name}.svg`).w(20).h(20).flex_none();
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(30).flex_none().pl(8 + depth * 22).pr(8).gap(7).items_center().rounded(0).cursor_pointer()
        // Zebra stripes, as in the Finder's list view.
        .bg(out.length % 2 ? "#eeeef6" : t.background).hover(s => s.bg(t.selected))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(entry, path, cx); })
        .on_click((_e, cx) => {
          if (entry.dir) return this.toggle(path, cx);
          if (this.preview) {
            const file = `${this.root}/${path}`;
            return run("tab.new", { name: entry.name, mod: "cria-file-preview", props: { file, on: this.on } });
          }
          this.show(path, cx);
        })
        // Solid disclosure triangles, as in the Finder.
        .child(entry.dir ? div().w(16).flex_none().text_size(14).text_color(t.foreground).child(open ? "▼" : "▶") : div().w(16).flex_none())
        .child(this.icon(entry, open))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(14).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    return frame(this.content(cx));
  }

  content(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme();
    return v_flex().id("files").size_full().min_h(0).rounded(0).overflow_hidden().bg(t.background).border_1().border_color(t.foreground).text_color(t.foreground).text_size(14)
      // Platinum title bar: dotted band, centred bold title.
      .child(h_flex().relative().overflow_hidden().h(36).flex_none().items_center().text_size(14)
        .child(image("mods/platinum-files/titlebar-dots.svg").absolute().top(0).left(0).w(640).h(36))
        .child(this.file
          ? div().id("files-back").w(26).flex_none().flex().items_center().justify_center().cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child(div().px(4).bg(t.surface).child("←"))
          : div().w(26).flex_none())
        .child(div().flex_1())
        .child(div().px(10).h(20).flex().items_center().bg(t.surface).font_family("Lucida Grande").font_bold().child("Files"))
        .child(div().flex_1())
        .child(div().w(26).flex_none()))
      // The Finder's info strip under the title bar: folder name and "17 items".
      .child(h_flex().h(26).flex_none().px(10).items_center().justify_center().bg(t.surface).border_b(1).border_color(t.border).text_size(14).text_color(t.muted)
        .child(div().min_w(0).truncate().child(this.file ?? `${this.root?.split(/[\\/]/).pop() ?? ""} · ${this.entries.get("")?.length ?? 0} ${(this.entries.get("")?.length ?? 0) === 1 ? "item" : "items"}`)))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(0).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(14).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(14).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
