# Usage

Open the panel from the hash icon on the left ribbon, or Command palette → **Open panel**.

## Scopes

- **Global** counts every scanned markdown note in the vault
- **This note** counts only the file you have open
- **This folder** counts notes sitting in the same folder as that file

Switching scope does not need a rescan. The vault is already indexed.

## Watchlist

Add the words you care about under **Settings → Unique Word Tracker → Watchlist**. Separate them with commas or new lines.

Those words stay at the top of the panel even if they are also stopwords.

## Most-used list

The rest of the writing is ranked below the watchlist. Stopwords are hidden from that list. Click a word to see which notes use it.

## What gets counted

- Markdown notes only
- Frontmatter and code blocks are skipped unless you turn those settings on
- Wiki-link aliases and markdown link labels are kept
- Case does not matter unless Case sensitive is on

Use **Rescan** after you change minimum length, case sensitivity, excluded folders, or the code and frontmatter toggles.
