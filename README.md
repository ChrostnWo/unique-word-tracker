# Unique Word Tracker

Track how often you use specific words in your notes.

Unique Word Tracker watches a list you choose, then shows those counts next to a leaderboard of the rest of your writing. Switch between the whole vault, the note you have open, or that note's folder. Open the 3D graph when you want each node to use a different metric.

## Pages

- [Install](docs/install.md)
- [Usage](docs/usage.md)
- [Support](docs/support.md)
- [Changelog](CHANGELOG.md)
- [Buy Me a Coffee](https://buymeacoffee.com/chrostn)

## Features

- Watchlist for words you want counted first
- Three scopes: whole vault, current note, current folder
- Most-used word list with a clickable note breakdown
- 3D graph with separate metrics for position, size, and color
- Metric space or co-occurrence layout
- Live updates after you edit a note
- Stopwords and folder excludes
- Works on desktop and mobile

Switching scope does not require a rescan. The vault is indexed in the background.

## Install from Community plugins

After the plugin is accepted into the directory:

1. Open **Settings → Community plugins**
2. Browse and search for **Unique Word Tracker**
3. Install and enable it

## Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](https://github.com/ChrostnWo/unique-word-tracker/releases)
2. Put them in:

   ```
   <vault>/.obsidian/plugins/unique-word-tracker/
   ```

3. Enable **Unique Word Tracker** under Community plugins

## Usage

1. Open the panel from the hash ribbon icon, or Command palette → **Open panel**
2. Add words under **Settings → Unique Word Tracker → Watchlist**
3. Pick a scope at the top of the panel:
   - **Global** — every markdown note in the vault
   - **This note** — only the active file
   - **This folder** — notes in the same folder as that file
4. Click a word to see which notes use it
5. Switch to **3D graph** and assign metrics:
   - **Metric space** — X, Y, and Z are independent metrics
   - **Co-occurrence** — words that share a note pull together; height is its own metric
   - **Size** and **Color** — count, notes, spread, links, length, or watchlist

Use **Rescan** only after changing tokenization settings such as minimum length, case sensitivity, or excluded folders.

## Commands

Obsidian prefixes these with the plugin name.

- Open panel
- Open 3D graph
- Rescan vault
- Count in whole vault
- Count in current note
- Count in current folder

## What it counts

- Markdown notes only
- Frontmatter and code blocks skipped by default
- Wiki-link aliases and markdown link labels kept
- Unicode letters and digits, including contractions
- Case-insensitive unless you turn that setting on

## Settings

| Setting | What it does |
| --- | --- |
| Default scope | Global, current note, or current folder |
| Watchlist | Words you always want counted |
| Stopwords | Hidden from the most-used list and the graph. Still counted if they are on the watchlist |
| Exclude folders | Skip Templates, attachments, trash, and similar folders |
| Minimum word length | Ignore tiny tokens |
| Minimum count | Floor for the most-used list |
| Top N | Length of the leaderboard |
| Graph nodes | How many words the 3D graph draws |
| Case sensitive | Treat Focus and focus as different words |
| Include code / frontmatter | Count those regions too |

## Support

If this plugin is useful, you can [buy me a coffee](https://buymeacoffee.com/chrostn).

## License

MIT
