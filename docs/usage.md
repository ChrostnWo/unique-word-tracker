# Usage

Open the panel from the hash icon on the left ribbon, or Command palette → **Open panel**.

## Scopes

- **Global** counts every scanned markdown note in the vault
- **This note** counts only the file you have open
- **This folder** counts notes sitting in the same folder as that file

Switching scope does not need a rescan. The vault is already indexed.

## Watchlist

Add the words you care about under **Settings → Unique Word Tracker → Watchlist**. Separate them with commas or new lines.

Those words stay at the top of the panel even if they are also stopwords. On the graph they are kept first and drawn with a ring.

## Most-used list

The rest of the writing is ranked below the watchlist. Stopwords are hidden from that list. Click a word to see which notes use it.

## 3D graph

Switch the panel to **3D graph**, or run **Open 3D graph** from the command palette. It opens on **Galaxy**.

Words are placed like a star-forming spiral. The brightest, most frequent words sit nearer the core. Three arms rotate slowly. A filament means those two words appear in the same note. Click a star to dim the rest and list its connections.

Size and color still follow a metric:

| Channel | What it changes |
| --- | --- |
| X, Y, Z | Position in Metric space |
| Height | Vertical position in Connections layout |
| Size | Star radius, and how close a word sits to the core in Galaxy |
| Color | Stellar color. Hotter, brighter stars are higher on the metric |

**Connections** still links words that share a note, but the forces are capped so the cloud stays on screen. **Metric space** places words on the chosen axes. Drag to orbit, scroll or pinch to zoom.

Metrics:

- **Count** — occurrences in the current scope
- **Notes** — how many notes contain the word
- **Spread** — notes divided by count. High means the word is used once across many notes
- **Links** — how many other graph words share a note with it
- **Length** — character length
- **Watchlist** — on or off

## What gets counted

- Markdown notes only
- Frontmatter and code blocks are skipped unless you turn those settings on
- Wiki-link aliases and markdown link labels are kept
- Case does not matter unless Case sensitive is on

Use **Rescan** after you change minimum length, case sensitivity, excluded folders, or the code and frontmatter toggles.
