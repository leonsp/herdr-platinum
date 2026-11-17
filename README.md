# Herdr Platinum

A Mac OS 9 Platinum look for Herdr: a gray theme, a layout, a striped window
bar and striped pane title bars.

```
themes/platinum.json          palette (the layout's own theme)
layouts/platinum.json         window structure, fonts, pane frames, panel
mods/platinum-bar/            striped bar replacing the macOS title bar
mods/platinum-pane/           striped pane header (close and zoom boxes)
mods/platinum-files/          Files panel with Platinum folder and page icons
mods/platinum-changes/        Changes panel with square corners and buttons
mods/platinum-tabs/           tab bar in Platinum grays, 14px text
mods/platinum-spaces/         Spaces sidebar, 14px text, square selection
mods/platinum-agents/         Agents list, 14px text, square rows
```

## Install

Link the files into Herdr's home, so edits here show up live:

```sh
H=~/.config/herdr-app
R=$(pwd)   # run from a clone of this repository
ln -s $R/themes/platinum.json $H/themes/platinum.json
ln -s $R/layouts/platinum.json $H/layouts/platinum.json
ln -s $R/mods/platinum-bar $H/mods/platinum-bar
ln -s $R/mods/platinum-pane $H/mods/platinum-pane
ln -s $R/mods/platinum-files $H/mods/platinum-files
ln -s $R/mods/platinum-changes $H/mods/platinum-changes
ln -s $R/mods/platinum-tabs $H/mods/platinum-tabs
ln -s $R/mods/platinum-spaces $H/mods/platinum-spaces
ln -s $R/mods/platinum-agents $H/mods/platinum-agents
herdr-app check $H/mods/platinum-bar
herdr-app check $H/mods/platinum-pane
herdr-app check $H/mods/platinum-files
herdr-app check $H/mods/platinum-changes
herdr-app check $H/mods/platinum-tabs
herdr-app check $H/mods/platinum-spaces
herdr-app check $H/mods/platinum-agents
herdr-app do layout.switch '{"name":"platinum"}'
```

Use `cp -R` instead of `ln -s` to copy rather than link.

## Uninstall

Switch to another layout with `ctrl-shift-l`, then delete the links or
copies from `~/.config/herdr-app`.

## Notes

- Fonts are Monaco (terminals) and Geneva (UI). Change `font` and `ui_font`
  in the layout if your Mac lacks them.
- Mods linked with `ln -s` don't hot-reload on edit. Switch to another layout
  and back (`layout.switch` to `main`, then `platinum`) to restart them.
- Pinstripes show on the focused pane only. Unfocused panes get a plain
  gray title, as in Platinum.
- The layout hides the system title bar. The macOS window buttons sit over
  the left gap of `platinum-bar` at `traffic_lights` in the layout, so keep
  `BUTTONS_GAP` in the bar mod in step with it.
- Text is 14px or larger throughout. Raise `font_size` in the layout for a
  bigger terminal.
- The spaces, agents and tabs mods are copies of Herdr's own, so they do not
  follow Herdr updates.
- The terminal pane is white. Programs that assume a dark background may
  need their light theme to be readable.

## Licence

MIT, see `LICENSE`. The `platinum-files`, `platinum-changes`,
`platinum-tabs`, `platinum-spaces` and `platinum-agents` mods are modified copies of Herdr's own mods and stay under
the Apache License 2.0. See `NOTICE`. Put the licence text in
`LICENSES/Apache-2.0.txt`.
