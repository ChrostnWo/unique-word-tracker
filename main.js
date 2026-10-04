const { Plugin, ItemView, PluginSettingTab, Setting, Notice } = require("obsidian");

const VIEW_TYPE = "unique-word-tracker-view";

const DEFAULT_STOPWORDS = [
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "by",
  "for", "with", "about", "against", "between", "into", "through", "during",
  "before", "after", "above", "below", "to", "from", "up", "down", "in", "out",
  "on", "off", "over", "under", "again", "further", "once", "here", "there",
  "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can",
  "will", "just", "don", "should", "now", "is", "am", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "of", "it", "its",
  "this", "that", "these", "those", "i", "you", "he", "she", "we", "they", "me",
  "him", "her", "us", "them", "my", "your", "his", "our", "their", "what", "which",
  "who", "whom", "as", "also", "because", "while"
].join(", ");

const DEFAULT_SETTINGS = {
  watchlist: "focus, habit, project, idea, goal",
  stopwords: DEFAULT_STOPWORDS,
  excludeFolders: "Templates, template, .trash, attachments",
  minLength: 3,
  minCount: 2,
  caseSensitive: false,
  topN: 60,
  includeCode: false,
  includeFrontmatter: false,
  scope: "global"
};

function parseList(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripMarkdownNoise(text, settings) {
  let out = text || "";
  if (!settings.includeFrontmatter) {
    out = out.replace(/^---\n[\s\S]*?\n---\n/, "");
  }
  if (!settings.includeCode) {
    out = out.replace(/```[\s\S]*?```/g, " ");
    out = out.replace(/`[^`]*`/g, " ");
  }
  out = out.replace(/!\[[^\]]*\]\([^)]+\)/g, " ");
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  out = out.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1");
  out = out.replace(/\[\[([^\]]+)\]\]/g, "$1");
  out = out.replace(/<[^>]+>/g, " ");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^\s*[-*+]\s+/gm, "");
  out = out.replace(/^\s*\d+\.\s+/gm, "");
  out = out.replace(/[*_~]+/g, "");
  return out;
}

function tokenize(text, settings) {
  const cleaned = stripMarkdownNoise(text, settings);
  const source = settings.caseSensitive ? cleaned : cleaned.toLowerCase();
  const matches = source.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
  const min = Number(settings.minLength) || 1;
  return matches.filter((w) => w.length >= min);
}

function parentFolder(path) {
  const norm = String(path || "").replace(/\\/g, "/");
  const cut = norm.lastIndexOf("/");
  return cut === -1 ? "" : norm.slice(0, cut);
}

class WordTrackerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = "";
    this.selectedWord = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Unique Word Tracker";
  }

  getIcon() {
    return "hash";
  }

  async onOpen() {
    this.render();
  }

  refresh() {
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("wt-wrap");

    const header = root.createDiv({ cls: "wt-header" });
    const titles = header.createDiv();
    titles.createEl("h2", { text: "Unique Word Tracker" });
    const scanned = this.plugin.stats.files || 0;
    const stamp = this.plugin.stats.updatedAt
      ? new Date(this.plugin.stats.updatedAt).toLocaleString()
      : "not scanned yet";
    titles.createDiv({ cls: "wt-muted", text: `${scanned} notes in view · last scan ${stamp}` });

    const actions = header.createDiv({ cls: "wt-actions" });
    const refreshBtn = actions.createEl("button", { text: "Rescan" });
    refreshBtn.onclick = async () => {
      refreshBtn.setText("Scanning…");
      await this.plugin.fullScan();
      this.render();
    };

    const scopeBar = root.createDiv({ cls: "wt-scope" });
    const scopes = [
      { id: "global", label: "Global" },
      { id: "file", label: "This note" },
      { id: "folder", label: "This folder" }
    ];
    for (const scope of scopes) {
      const btn = scopeBar.createEl("button", { text: scope.label });
      if (this.plugin.settings.scope === scope.id) btn.addClass("is-active");
      btn.onclick = async () => {
        this.plugin.settings.scope = scope.id;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      };
    }

    root.createDiv({ cls: "wt-scope-label", text: this.plugin.describeScope() });

    const search = root.createEl("input", {
      cls: "wt-search",
      type: "search",
      placeholder: "Filter words…"
    });
    search.value = this.filter;
    search.oninput = () => {
      this.filter = search.value.trim();
      this.renderBody(body);
    };

    const stats = root.createDiv({ cls: "wt-stats" });
    this.statCard(stats, "Unique words", String(this.plugin.stats.unique || 0));
    this.statCard(stats, "Total tokens", String(this.plugin.stats.tokens || 0));
    this.statCard(stats, "Watchlist hits", String(this.plugin.stats.watchHits || 0));

    const body = root.createDiv({ cls: "wt-body" });
    this.renderBody(body);
  }

  statCard(parent, label, value) {
    const card = parent.createDiv({ cls: "wt-stat" });
    card.createDiv({ cls: "wt-stat-label", text: label });
    card.createDiv({ cls: "wt-stat-value", text: value });
  }

  renderBody(body) {
    body.empty();
    const filter = this.plugin.normalize(this.filter);
    const watch = this.plugin.getWatchlist();
    const maxWatch = Math.max(1, ...watch.map((w) => this.plugin.counts[w] || 0));

    body.createDiv({ cls: "wt-section-title", text: "Watched words" });
    const watchedRows = watch
      .map((word) => ({ word, count: this.plugin.counts[word] || 0 }))
      .filter((row) => !filter || row.word.includes(filter));

    if (!watch.length) {
      body.createDiv({
        cls: "wt-empty",
        text: "Add words in Settings → Unique Word Tracker → Watchlist."
      });
    } else if (!watchedRows.length) {
      body.createDiv({ cls: "wt-empty", text: "No watched words match the filter." });
    } else {
      for (const row of watchedRows.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))) {
        this.wordRow(body, row.word, row.count, maxWatch, true);
      }
    }

    body.createDiv({ cls: "wt-section-title", text: "Most used words" });
    const minCount = Number(this.plugin.settings.minCount) || 1;
    const topN = Number(this.plugin.settings.topN) || 60;
    const stop = this.plugin.getStopwords();
    const localMin = this.plugin.settings.scope === "file" ? 1 : minCount;
    const top = Object.entries(this.plugin.counts)
      .filter(([word, count]) => count >= localMin && !stop.has(word) && !watch.includes(word))
      .filter(([word]) => !filter || word.includes(filter))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, topN);

    if (!top.length) {
      const why = this.plugin.settings.scope !== "global" && !this.plugin.getActiveMarkdownFile()
        ? "Open a note first, then tap This note or This folder."
        : this.plugin.stats.files
          ? "No words match the current filters."
          : "Click Rescan to index your vault.";
      body.createDiv({ cls: "wt-empty", text: why });
    } else {
      const maxTop = top[0][1] || 1;
      for (const [word, count] of top) {
        this.wordRow(body, word, count, maxTop, false);
      }
    }

    if (this.selectedWord) {
      this.renderNotes(body, this.selectedWord);
    }
  }

  wordRow(parent, word, count, max, watched) {
    const row = parent.createDiv({ cls: "wt-row" + (watched ? " wt-watch" : "") });
    row.createDiv({ cls: "wt-word", text: word });
    row.createDiv({ cls: "wt-count", text: String(count) });
    const barWrap = row.createDiv({ cls: "wt-bar-wrap" });
    const bar = barWrap.createDiv({ cls: "wt-bar" });
    bar.style.width = `${Math.max(4, Math.round((count / Math.max(max, 1)) * 100))}%`;
    row.onclick = () => {
      this.selectedWord = word;
      this.render();
    };
  }

  renderNotes(parent, word) {
    const box = parent.createDiv({ cls: "wt-notes" });
    box.createEl("h3", { text: `Notes using “${word}”` });
    const hits = [];
    const scoped = this.plugin.getScopedFileCounts();
    for (const [path, bag] of Object.entries(scoped)) {
      const n = bag[word] || 0;
      if (n > 0) hits.push({ path, n });
    }
    hits.sort((a, b) => b.n - a.n);
    if (!hits.length) {
      box.createDiv({ cls: "wt-muted", text: "Not found in the current scope." });
      return;
    }
    for (const hit of hits.slice(0, 25)) {
      const line = box.createDiv({ cls: "wt-note-row" });
      const file = this.app.vault.getAbstractFileByPath(hit.path);
      const link = line.createEl("a", {
        text: file ? file.basename : hit.path,
        href: hit.path
      });
      link.onclick = (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(hit.path, "", false);
      };
      line.createSpan({ cls: "wt-muted", text: String(hit.n) });
    }
    if (hits.length > 25) {
      box.createDiv({ cls: "wt-muted", text: `+ ${hits.length - 25} more notes` });
    }
  }
}

class WordTrackerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Unique Word Tracker" });

    new Setting(containerEl)
      .setName("Default scope")
      .setDesc("Global = whole vault. This note = the file you are looking at. This folder = notes next to that file.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("global", "Global vault")
          .addOption("file", "This note")
          .addOption("folder", "This folder")
          .setValue(this.plugin.settings.scope)
          .onChange(async (value) => {
            this.plugin.settings.scope = value;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName("Watchlist")
      .setDesc("Comma or newline separated words you want to track specifically.")
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.watchlist).onChange(async (value) => {
          this.plugin.settings.watchlist = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
        text.inputEl.rows = 4;
        text.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Stopwords")
      .setDesc("Common words hidden from the most-used list. They still count if they are on the watchlist.")
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.stopwords).onChange(async (value) => {
          this.plugin.settings.stopwords = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Exclude folders")
      .setDesc("Folder names or path prefixes to skip, comma separated. Used in Global and This folder.")
      .addText((text) => {
        text.setValue(this.plugin.settings.excludeFolders).onChange(async (value) => {
          this.plugin.settings.excludeFolders = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Minimum word length")
      .addSlider((slider) => {
        slider.setLimits(1, 8, 1)
          .setValue(this.plugin.settings.minLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.minLength = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Minimum count for most-used list")
      .addSlider((slider) => {
        slider.setLimits(1, 20, 1)
          .setValue(this.plugin.settings.minCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.minCount = value;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName("Top N words")
      .addSlider((slider) => {
        slider.setLimits(10, 200, 10)
          .setValue(this.plugin.settings.topN)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.topN = value;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName("Case sensitive")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
          this.plugin.settings.caseSensitive = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Include code blocks")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.includeCode).onChange(async (value) => {
          this.plugin.settings.includeCode = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Include frontmatter")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.includeFrontmatter).onChange(async (value) => {
          this.plugin.settings.includeFrontmatter = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Rescan vault")
      .setDesc("Rebuild the hidden full-vault index. Switching Global / This note / This folder does not need a rescan.")
      .addButton((btn) => {
        btn.setButtonText("Rescan now").onClick(async () => {
          btn.setButtonText("Scanning…");
          await this.plugin.fullScan();
          btn.setButtonText("Rescan now");
          new Notice("Unique Word Tracker finished scanning.");
        });
      });
  }
}

class WordTrackerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.counts = {};
    this.fileCounts = {};
    this.stats = { files: 0, tokens: 0, unique: 0, watchHits: 0, updatedAt: 0 };
    this._scanTimer = null;

    this.registerView(VIEW_TYPE, (leaf) => new WordTrackerView(leaf, this));
    this.addRibbonIcon("hash", "Open Unique Word Tracker", () => this.activateView());

    this.addCommand({ id: "open", name: "Open panel", callback: () => this.activateView() });
    this.addCommand({
      id: "rescan",
      name: "Rescan vault",
      callback: async () => {
        await this.fullScan();
        new Notice("Unique Word Tracker finished scanning.");
      }
    });
    this.addCommand({ id: "scope-global", name: "Count in whole vault", callback: () => this.setScope("global") });
    this.addCommand({ id: "scope-file", name: "Count in current note", callback: () => this.setScope("file") });
    this.addCommand({ id: "scope-folder", name: "Count in current folder", callback: () => this.setScope("folder") });

    this.addSettingTab(new WordTrackerSettingTab(this.app, this));

    this.registerEvent(this.app.vault.on("modify", (file) => this.scheduleFile(file)));
    this.registerEvent(this.app.vault.on("create", (file) => this.scheduleFile(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file && file.path) this.removeFile(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (oldPath) this.removeFile(oldPath);
      this.scheduleFile(file);
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (this.settings.scope !== "global") this.refreshViews();
    }));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      if (this.settings.scope !== "global") this.refreshViews();
    }));

    this.app.workspace.onLayoutReady(() => this.fullScan());
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!["global", "file", "folder"].includes(this.settings.scope)) {
      this.settings.scope = "global";
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async setScope(scope) {
    this.settings.scope = scope;
    await this.saveSettings();
    this.refreshViews();
    new Notice(`Unique Word Tracker: ${this.describeScope()}`);
  }

  normalize(word) {
    return this.settings.caseSensitive ? String(word || "") : String(word || "").toLowerCase();
  }

  getWatchlist() {
    return parseList(this.settings.watchlist).map((w) => this.normalize(w));
  }

  getStopwords() {
    return new Set(parseList(this.settings.stopwords).map((w) => this.normalize(w)));
  }

  getActiveMarkdownFile() {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") return file;
    return null;
  }

  describeScope() {
    const file = this.getActiveMarkdownFile();
    if (this.settings.scope === "file") {
      return file ? `Local note: ${file.basename}` : "Local note: open a markdown file";
    }
    if (this.settings.scope === "folder") {
      if (!file) return "Local folder: open a markdown file";
      return `Local folder: ${parentFolder(file.path) || "(vault root)"}`;
    }
    return "Global: every scanned note in the vault";
  }

  pathInScope(path) {
    if (!path) return false;
    const scope = this.settings.scope || "global";
    if (scope === "global") return true;
    const file = this.getActiveMarkdownFile();
    if (!file) return false;
    if (scope === "file") return path === file.path;
    const folder = parentFolder(file.path);
    if (!folder) return parentFolder(path) === "";
    const norm = path.replace(/\\/g, "/");
    return norm.startsWith(folder + "/") && parentFolder(norm) === folder;
  }

  getScopedFileCounts() {
    const out = {};
    for (const [path, bag] of Object.entries(this.fileCounts)) {
      if (this.pathInScope(path)) out[path] = bag;
    }
    return out;
  }

  shouldSkip(path) {
    if (!path || !path.endsWith(".md")) return true;
    const excludes = parseList(this.settings.excludeFolders).map((s) => s.replace(/\\/g, "/"));
    const norm = path.replace(/\\/g, "/");
    return excludes.some((ex) => {
      const needle = ex.replace(/^\/+|\/+$/g, "");
      return needle && (norm === needle || norm.startsWith(needle + "/") || norm.split("/").includes(needle));
    });
  }

  scheduleFile(file) {
    if (!file || this.shouldSkip(file.path)) return;
    clearTimeout(this._scanTimer);
    this._scanTimer = setTimeout(() => this.indexFile(file), 400);
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  refreshViews() {
    this.recomputeTotals();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view && leaf.view.refresh) leaf.view.refresh();
    }
  }

  removeFile(path) {
    delete this.fileCounts[path];
    this.refreshViews();
  }

  async indexFile(file) {
    if (!file || this.shouldSkip(file.path)) return;
    try {
      const text = await this.app.vault.cachedRead(file);
      const bag = {};
      for (const word of tokenize(text, this.settings)) {
        bag[word] = (bag[word] || 0) + 1;
      }
      this.fileCounts[file.path] = bag;
      this.refreshViews();
    } catch (err) {
      console.error("Unique Word Tracker failed on", file.path, err);
    }
  }

  async fullScan() {
    const files = this.app.vault.getMarkdownFiles().filter((f) => !this.shouldSkip(f.path));
    this.fileCounts = {};
    for (const file of files) {
      try {
        const text = await this.app.vault.cachedRead(file);
        const bag = {};
        for (const word of tokenize(text, this.settings)) {
          bag[word] = (bag[word] || 0) + 1;
        }
        this.fileCounts[file.path] = bag;
      } catch (err) {
        console.error("Unique Word Tracker failed on", file.path, err);
      }
    }
    this.refreshViews();
  }

  recomputeTotals() {
    const scoped = this.getScopedFileCounts();
    const counts = {};
    let tokens = 0;
    let files = 0;
    for (const bag of Object.values(scoped)) {
      files += 1;
      for (const [word, n] of Object.entries(bag)) {
        counts[word] = (counts[word] || 0) + n;
        tokens += n;
      }
    }
    const watch = this.getWatchlist();
    const watchHits = watch.reduce((sum, word) => sum + (counts[word] || 0), 0);
    this.counts = counts;
    this.stats = {
      files,
      tokens,
      unique: Object.keys(counts).length,
      watchHits,
      updatedAt: Date.now()
    };
  }
}

module.exports = WordTrackerPlugin;
