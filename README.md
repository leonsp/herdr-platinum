# Herdr Platinum

A Mac OS 9 Platinum look for Herdr, as a set of mods: striped window bar,
striped pane title bars, Platinum tabs, spaces, agents, Files and Changes
panels, and a bevelled status bar with a resize grip.

<img width="1464" height="960" alt="Screenshot of Herdr with the Platinum theme and mods" src="https://github.com/user-attachments/assets/199af85d-c9e3-4ca2-aa2c-bbaac0a99594" />

`RECIPE.md` is the brief another agent can build the whole thing from.

```
mods/platinum-bar/       striped bar replacing the macOS title bar
mods/platinum-pane/      striped pane header (close and zoom boxes)
mods/platinum-files/     Files panel with Platinum folder and page icons
mods/platinum-changes/   Changes panel with square corners and buttons
mods/platinum-tabs/      tab bar in Platinum grays, 14px text
mods/platinum-spaces/    Spaces sidebar, 14px text, square selection
mods/platinum-agents/    Agents list, 14px text, square rows
mods/platinum-menu/      right-click menus (space, tab, terminal)
mods/platinum-new-menu/  the + menu: terminal, agents, spaces, worktrees
mods/platinum-worktree/  New, Open and Remove worktree dialogs
mods/platinum-open/      open a file by path (needs cria-file-preview)
mods/platinum-context/   right-click menu for Files and Changes rows
mods/platinum-dialog/    Platinum alert and rename prompt
mods/platinum-diff/      one file's diff in a split or tab
mods/platinum-toast/     notifications ("Claude Code needs you")
mods/platinum-grip/      status bar: control strip (Settings, Keys),
                         breadcrumbs, git branch, split, zoom, palette,
                         clock, resize grip
mods/platinum-help/      the Keybinds dialog, opened by the strip's Keys
                         button
keys.json                cmd-k opens the command palette
```

The mods need a layout with matching blocks and the Platinum colours. The
block tree and palette are in `RECIPE.md`.

## Install

From a clone, link each mod into Herdr's home and check it:

```sh
H=~/.config/herdr-app
for m in bar pane files changes tabs spaces agents grip menu new-menu worktree open context dialog diff toast help; do
  ln -s "$(pwd)/mods/platinum-$m" "$H/mods/platinum-$m"
  herdr-app check "$H/mods/platinum-$m"
done
```

Merge `keys.json` into your own. Linked mods don't hot-reload: switch to
another layout and back.

## Licence

Apache License 2.0, see `LICENSE`. The `platinum-files`, `platinum-changes`,
`platinum-tabs`, `platinum-spaces`, `platinum-agents`, `platinum-menu` and
`platinum-worktree` and `platinum-toast` mods are modified copies of Herdr's own mods, also Apache 2.0. See `NOTICE`.
