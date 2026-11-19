// A file's uncommitted diff in a pane or tab of its own, for Changes' "Open
// Diff in Split" and "Open Diff in Tab". Props: { path, root, on } with path
// relative to root. The diff code is the one in platinum-changes, copied:
// mods can't import from each other. Refreshes every few seconds.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, v_virtual_list } from "gpui-base";
import { exec, readTextFile, props, theme, settings } from "herdr";

// Reads write nothing under .git, so the refresh doesn't disturb a watcher.
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

export default class PlatinumDiff extends View {
  init(_props, cx) {
    this.rows = []; this.diffWidth = 300; this.add = 0; this.del = 0; this.note = "Loading…"; this.sig = "";
    this.refresh(cx);
    cx.timer.every(3000, (cx) => this.refresh(cx));
  }

  async lines() {
    const { path, root, on } = props() ?? {};
    const git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
    const head = await git(["rev-parse", "--verify", "HEAD"]);
    const hasHead = head.code === 0;
    const status = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", path]);
    const xy = status.stdout.slice(0, 2);
    if (status.code === 0 && !status.stdout.trim()) return { note: "No uncommitted changes" };
    if (xy === "??" || (!hasHead && xy.includes("A"))) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) return { note: "Cannot preview this file (binary, too large, or unreadable)" };
      if (text.includes("\0")) return { note: "Binary file · no text diff" };
      const n = countLines(text);
      return { lines: [`@@ -0,0 +1,${n} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map((l) => `+${l}`)] };
    }
    const r = await git(["diff", ...(hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path]);
    if (r.code !== 0) throw new Error(r.stderr);
    const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
    return first < 0 ? { note: "Binary file changed or no text diff available" } : { lines: all.slice(first) };
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await this.lines();
        const sig = r.lines ? r.lines.join("\n") : `note:${r.note}`;
        if (sig !== this.sig) {
          this.sig = sig;
          this.note = r.note ?? null;
          const lines = (r.lines ?? []).slice(0, 1500).map((l) => (l.length > 4000 ? l.slice(0, 4000) + "… (line truncated)" : l));
          this.rows = diffRows(lines);
          this.add = lines.filter((l) => l[0] === "+").length;
          this.del = lines.filter((l) => l[0] === "-").length;
          this.diffWidth = Math.max(300, ...this.rows.map((row) => (row.text.length + 1) * 9 + 70));
        }
      } catch (e) { this.note = `Cannot preview this diff: ${e}`; }
      finally { this.busy = false; cx.notify(); }
    });
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(24).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(24).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(44).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render() {
    const t = theme();
    const path = props()?.path ?? "";
    return v_flex().size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(14)
      // Info strip: the file, then its line totals.
      .child(h_flex().h(26).flex_none().px(10).gap(10).items_center().bg(t.surface).border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_family("Lucida Grande").font_bold().child(path))
        .child(div().text_color(t.ansi2).child(`+${this.add}`)).child(div().text_color(t.ansi1).child(`−${this.del}`)))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "Monaco").text_size(14)
        .child(div().id("diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("diff-rows", this.rows.length, 24, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("diff-rows").viewport_from_layout().absolute().inset_0())
        .when(Boolean(this.note), (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child(this.note))));
  }
}
