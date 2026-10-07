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

const GRAPH_METRICS = [
  { id: "count", label: "Count" },
  { id: "notes", label: "Notes" },
  { id: "spread", label: "Spread" },
  { id: "links", label: "Links" },
  { id: "length", label: "Length" },
  { id: "watch", label: "Watchlist" }
];

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
  scope: "global",
  panelMode: "list",
  graphLayout: "galaxy",
  graphNodes: 42,
  graphShowEdges: true,
  graphX: "count",
  graphY: "notes",
  graphZ: "spread",
  graphSize: "count",
  graphColor: "notes",
  graphHeight: "spread"
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

function metricLabel(id) {
  const found = GRAPH_METRICS.find((m) => m.id === id);
  return found ? found.label : id;
}

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function mixHex(t) {
  const stops = [[78, 168, 255], [72, 196, 168], [224, 161, 0], [224, 96, 72]];
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function hashUnit(word, salt) {
  let h = 2166136261 ^ (Number(salt) || 0);
  const s = String(word || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function wordJitter(word) {
  return {
    x: (hashUnit(word, 1) - 0.5) * 18,
    y: (hashUnit(word, 2) - 0.5) * 18,
    z: (hashUnit(word, 3) - 0.5) * 18
  };
}

function starColor(t) {
  const stops = [[255, 244, 230], [176, 210, 255], [255, 196, 112], [255, 118, 78]];
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return { rgb: `rgb(${c[0]}, ${c[1]}, ${c[2]})`, r: c[0], g: c[1], b: c[2] };
}

function galaxyPlacement(word, index, total, coreBias) {
  const arms = 3;
  const arm = index % arms;
  const along = (Math.floor(index / arms) + 0.35) / Math.max(1, Math.ceil(total / arms));
  const turns = 1.75;
  const jitter = (hashUnit(word, 7) - 0.5) * 0.42;
  const angle = arm * (Math.PI * 2 / arms) + along * turns * Math.PI * 2 + jitter;
  const radial = 0.16 + 0.84 * (0.38 * along + 0.62 * (1 - clamp01(coreBias)));
  const radius = 48 + radial * 236 + (hashUnit(word, 11) - 0.5) * 16;
  const y = (hashUnit(word, 13) - 0.5) * (8 + radial * 26);
  return {
    angle,
    radius,
    y,
    arm,
    phase: hashUnit(word, 17) * Math.PI * 2,
    omega: 0.0024 / Math.sqrt(Math.max(0.4, radius / 70)),
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius
  };
}

function fibonacciSphere(index, total, radius) {
  const n = Math.max(1, total);
  const y = 1 - (index + 0.5) / n * 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (3 - Math.sqrt(5)) * index;
  return {
    x: Math.cos(theta) * ring * radius,
    y: y * radius * 0.72,
    z: Math.sin(theta) * ring * radius
  };
}

class WordTrackerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = "";
    this.selectedWord = null;
    this.hoverWord = null;
    this._cam = { yaw: 0.4, pitch: 0.78, dist: 680 };
    this._spin = 0;
    this._pos = {};
    this._raf = 0;
    this._graphCleanup = null;
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
    if (this.plugin._openGraph) {
      this.plugin.settings.panelMode = "graph";
      this.plugin._openGraph = false;
    }
    this.render();
  }

  async onClose() {
    this.stopGraph();
  }

  refresh() {
    this.render();
  }

  stopGraph() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._graphCleanup) this._graphCleanup();
    this._graphCleanup = null;
  }

  render() {
    this.stopGraph();
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

    const modeBar = root.createDiv({ cls: "wt-scope" });
    for (const mode of [
      { id: "list", label: "List" },
      { id: "graph", label: "3D graph" }
    ]) {
      const btn = modeBar.createEl("button", { text: mode.label });
      if ((this.plugin.settings.panelMode || "list") === mode.id) btn.addClass("is-active");
      btn.onclick = async () => {
        this.plugin.settings.panelMode = mode.id;
        if (mode.id === "graph") {
          this.plugin.settings.graphLayout = "galaxy";
          this.plugin.settings.graphShowEdges = true;
        }
        await this.plugin.saveSettings();
        this.render();
      };
    }

    const scopeBar = root.createDiv({ cls: "wt-scope" });
    for (const scope of [
      { id: "global", label: "Global" },
      { id: "file", label: "This note" },
      { id: "folder", label: "This folder" }
    ]) {
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
    if (this._focusSearch) {
      search.focus();
      this._focusSearch = false;
    }
    search.oninput = () => {
      this.filter = search.value.trim();
      this._focusSearch = true;
      if ((this.plugin.settings.panelMode || "list") === "graph") this.render();
      else this.renderBody(body);
    };

    const stats = root.createDiv({ cls: "wt-stats" });
    this.statCard(stats, "Unique words", String(this.plugin.stats.unique || 0));
    this.statCard(stats, "Total tokens", String(this.plugin.stats.tokens || 0));
    this.statCard(stats, "Watchlist hits", String(this.plugin.stats.watchHits || 0));

    const body = root.createDiv({ cls: "wt-body" });
    if ((this.plugin.settings.panelMode || "list") === "graph") this.renderGraph(body);
    else this.renderBody(body);
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
      for (const [word, count] of top) this.wordRow(body, word, count, maxTop, false);
    }

    if (this.selectedWord) this.renderNotes(body, this.selectedWord);
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

  metricSelect(parent, label, key) {
    const wrap = parent.createDiv({ cls: "wt-metric" });
    wrap.createSpan({ text: label });
    const select = wrap.createEl("select", { cls: "wt-select" });
    for (const metric of GRAPH_METRICS) {
      const opt = select.createEl("option", { text: metric.label, value: metric.id });
      if (this.plugin.settings[key] === metric.id) opt.selected = true;
    }
    select.onchange = async () => {
      this.plugin.settings[key] = select.value;
      await this.plugin.saveSettings();
      this.render();
    };
    return select;
  }

  renderGraph(body) {
    body.empty();
    const graph = this.plugin.buildWordGraph(this.filter);
    const toolbar = body.createDiv({ cls: "wt-graph-toolbar" });

    const layoutWrap = toolbar.createDiv({ cls: "wt-metric" });
    layoutWrap.createSpan({ text: "Layout" });
    const layout = layoutWrap.createEl("select", { cls: "wt-select" });
    layout.createEl("option", { text: "Galaxy", value: "galaxy" });
    layout.createEl("option", { text: "Connections", value: "links" });
    layout.createEl("option", { text: "Metric space", value: "metric" });
    layout.value = this.plugin.settings.graphLayout === "metric" ? "metric" : this.plugin.settings.graphLayout === "links" ? "links" : "galaxy";
    layout.onchange = async () => {
      this.plugin.settings.graphLayout = layout.value;
      await this.plugin.saveSettings();
      this.render();
    };

    if (this.plugin.settings.graphLayout === "links") {
      this.metricSelect(toolbar, "Height", "graphHeight");
    } else if (this.plugin.settings.graphLayout === "metric") {
      this.metricSelect(toolbar, "X", "graphX");
      this.metricSelect(toolbar, "Y", "graphY");
      this.metricSelect(toolbar, "Z", "graphZ");
    }
    this.metricSelect(toolbar, "Size", "graphSize");
    this.metricSelect(toolbar, "Color", "graphColor");

    const edgeBtn = toolbar.createEl("button", {
      text: this.plugin.settings.graphShowEdges ? "Edges on" : "Edges off",
      cls: "wt-edge-btn" + (this.plugin.settings.graphShowEdges ? " is-on" : "")
    });
    edgeBtn.onclick = async () => {
      this.plugin.settings.graphShowEdges = !this.plugin.settings.graphShowEdges;
      await this.plugin.saveSettings();
      this.render();
    };

    const reset = toolbar.createEl("button", { text: "Reset view", cls: "wt-edge-btn" });
    reset.onclick = () => {
      this._cam = { yaw: 0.4, pitch: 0.78, dist: 680 };
      this._spin = 0;
      this._pos = {};
      this.render();
    };

    if (!graph.nodes.length) {
      const why = this.plugin.settings.scope !== "global" && !this.plugin.getActiveMarkdownFile()
        ? "Open a note first, then switch scope."
        : this.plugin.stats.files
          ? "No words match the current filters."
          : "Click Rescan to index your vault.";
      body.createDiv({ cls: "wt-empty", text: why });
      return;
    }

    const stage = body.createDiv({ cls: "wt-graph-stage" });
    const canvas = stage.createEl("canvas", { cls: "wt-graph-canvas" });
    const hud = stage.createDiv({ cls: "wt-graph-hud", text: "Drag to orbit · scroll or pinch to zoom · click a word to see its connections" });

    const legend = body.createDiv({ cls: "wt-legend" });
    const layoutMode = this.plugin.settings.graphLayout === "metric" ? "metric" : this.plugin.settings.graphLayout === "links" ? "links" : "galaxy";
    const layoutName = layoutMode === "metric" ? "Metric space" : layoutMode === "links" ? "Connections" : "Galaxy";
    const axes = layoutMode === "metric"
      ? `X ${metricLabel(this.plugin.settings.graphX)} · Y ${metricLabel(this.plugin.settings.graphY)} · Z ${metricLabel(this.plugin.settings.graphZ)}`
      : layoutMode === "links"
        ? `Height ${metricLabel(this.plugin.settings.graphHeight)} · ${graph.edges.length} links`
        : `Core ${metricLabel(this.plugin.settings.graphSize)} · ${graph.edges.length} filaments`;
    legend.createSpan({ text: `${layoutName} · ${axes} · Size ${metricLabel(this.plugin.settings.graphSize)} · Color ${metricLabel(this.plugin.settings.graphColor)}` });
    legend.createDiv({
      cls: "wt-muted",
      text: layoutMode === "galaxy"
        ? "Words sit in a spiral like a star-forming galaxy. Frequent words stay nearer the core. A filament means those words share a note."
        : "A line means those words appear in the same note. Thicker lines share more notes. Click a word to isolate its connections."
    });

    this.mountGraph(canvas, hud, graph);
    this.renderConnections(body, graph);
    if (this.selectedWord) this.renderNotes(body, this.selectedWord);
  }

  renderConnections(parent, graph) {
    const word = this.selectedWord || this.hoverWord;
    const box = parent.createDiv({ cls: "wt-notes" });
    box.createEl("h3", { text: word ? `Connections for “${word}”` : "Strongest connections" });
    const rows = graph.edges
      .filter((edge) => !word || edge.a === word || edge.b === word)
      .slice(0, word ? 20 : 12);
    if (!rows.length) {
      box.createDiv({ cls: "wt-muted", text: "No shared notes between the words in this graph." });
      return;
    }
    for (const edge of rows) {
      const other = word ? (edge.a === word ? edge.b : edge.a) : null;
      const line = box.createDiv({ cls: "wt-note-row" });
      const label = other || `${edge.a} — ${edge.b}`;
      const link = line.createEl("a", { text: label, href: "#" });
      link.onclick = (e) => {
        e.preventDefault();
        this.selectedWord = other || edge.a;
        this.render();
      };
      line.createSpan({ cls: "wt-muted", text: `${edge.w} shared ${edge.w === 1 ? "note" : "notes"}` });
    }
  }

  mountGraph(canvas, hud, graph) {
    const view = this;
    const settings = this.plugin.settings;
    const layoutMode = settings.graphLayout === "metric" ? "metric" : settings.graphLayout === "links" ? "links" : "galaxy";
    const nodes = graph.nodes.map((node, index) => {
      const stored = this._pos[node.id];
      const exploded = stored && (Math.abs(stored.x) > 620 || Math.abs(stored.y) > 620 || Math.abs(stored.z) > 620);
      const place = galaxyPlacement(node.id, index, graph.nodes.length, clamp01((Number(node.count) || 0) / (graph.nodes[0] && graph.nodes[0].count ? graph.nodes[0].count : 1)));
      const fib = fibonacciSphere(index, graph.nodes.length, 168);
      let copy;
      if (layoutMode === "galaxy") {
        copy = Object.assign({}, node, stored && stored.angle != null && !exploded ? stored : place, { id: node.id });
        copy.radius = place.radius;
        copy.baseY = place.y;
        copy.omega = place.omega;
        copy.phase = place.phase;
        if (copy.angle == null) copy.angle = place.angle;
      } else if (!stored || exploded) {
        copy = Object.assign({}, node, { x: fib.x, y: fib.y, z: fib.z, vx: 0, vy: 0, vz: 0 });
      } else {
        copy = Object.assign({}, node, stored);
      }
      copy.vx = copy.vx || 0;
      copy.vy = copy.vy || 0;
      copy.vz = copy.vz || 0;
      return copy;
    });
    const byId = {};
    for (const node of nodes) byId[node.id] = node;
    const edges = graph.edges.filter((e) => byId[e.a] && byId[e.b]);
    const ranges = {};
    for (const metric of GRAPH_METRICS) {
      let min = Infinity;
      let max = -Infinity;
      for (const node of nodes) {
        const v = Number(node[metric.id]) || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ranges[metric.id] = { min, max: max === min ? min + 1 : max };
    }
    const normFixed = (node, key) => {
      const range = ranges[key] || { min: 0, max: 1 };
      return clamp01(((Number(node[key]) || 0) - range.min) / (range.max - range.min));
    };

    const dust = [];
    for (let i = 0; i < 170; i++) {
      const a = hashUnit("dust" + i, 1) * Math.PI * 2;
      const b = (hashUnit("dust" + i, 2) - 0.5) * Math.PI;
      const r = 280 + hashUnit("dust" + i, 3) * 520;
      dust.push({
        x: Math.cos(a) * Math.cos(b) * r,
        y: Math.sin(b) * r * 0.55,
        z: Math.sin(a) * Math.cos(b) * r,
        s: 0.4 + hashUnit("dust" + i, 4) * 1.5,
        tw: hashUnit("dust" + i, 5) * Math.PI * 2
      });
    }

    const pointers = new Map();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinch = 0;
    const projected = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = rect.width || canvas.clientWidth || 640;
      const height = rect.height || canvas.clientHeight || 460;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
    };
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(canvas);

    const onDown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = Array.from(pointers.values());
      if (pts.length >= 2) {
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);
        if (pinch) view._cam.dist = Math.max(220, Math.min(1400, view._cam.dist * (pinch / dist)));
        pinch = dist;
        return;
      }
      pinch = 0;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      view._cam.yaw += dx * 0.008;
      view._cam.pitch = Math.max(-1.2, Math.min(1.35, view._cam.pitch + dy * 0.008));
    };
    const onUp = (e) => {
      const start = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      dragging = pointers.size > 0;
      if (!start || pointers.size) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > 6) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let best = null;
      let bestD = 28;
      for (const hit of projected) {
        const d = Math.hypot(hit.sx - x, hit.sy - y);
        if (d < Math.max(hit.r, 10) + 8 && d < bestD) {
          best = hit;
          bestD = d;
        }
      }
      if (best) {
        view.selectedWord = best.id;
        view.render();
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      view._cam.dist = Math.max(220, Math.min(1400, view._cam.dist * (e.deltaY > 0 ? 1.08 : 0.92)));
    };
    const onLeave = () => {
      view.hoverWord = null;
      dragging = false;
    };
    const onHover = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let best = null;
      let bestD = 24;
      for (const hit of projected) {
        const d = Math.hypot(hit.sx - x, hit.sy - y);
        if (d < Math.max(hit.r, 8) + 6 && d < bestD) {
          best = hit;
          bestD = d;
        }
      }
      view.hoverWord = best ? best.id : null;
      canvas.style.cursor = best ? "pointer" : "grab";
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointermove", onHover);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    this._graphCleanup = () => {
      resizeObs.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointermove", onHover);
      canvas.removeEventListener("wheel", onWheel);
    };

    const step = () => {
      if (layoutMode === "galaxy") {
        view._spin = (view._spin || 0) + 0.004;
        for (const node of nodes) {
          node.angle += node.omega || 0.002;
          node.x = Math.cos(node.angle) * node.radius;
          node.z = Math.sin(node.angle) * node.radius;
          node.y = node.baseY + Math.sin(view._spin + node.phase) * 3.2;
        }
      } else if (layoutMode === "metric") {
        for (const node of nodes) {
          const j = wordJitter(node.id);
          const tx = (normFixed(node, settings.graphX) - 0.5) * 280 + j.x;
          const ty = (normFixed(node, settings.graphY) - 0.5) * 280 + j.y;
          const tz = (normFixed(node, settings.graphZ) - 0.5) * 280 + j.z;
          node.x += (tx - node.x) * 0.12;
          node.y += (ty - node.y) * 0.12;
          node.z += (tz - node.z) * 0.12;
        }
      } else {
        for (let i = 0; i < nodes.length; i++) {
          for (let k = i + 1; k < nodes.length; k++) {
            const a = nodes[i];
            const b = nodes[k];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let dz = a.z - b.z;
            let dist = Math.hypot(dx, dy, dz);
            if (dist < 36) dist = 36;
            const force = Math.min(1.6, 900 / (dist * dist));
            dx /= dist; dy /= dist; dz /= dist;
            a.vx += dx * force; a.vy += dy * force; a.vz += dz * force;
            b.vx -= dx * force; b.vy -= dy * force; b.vz -= dz * force;
          }
        }
        for (const edge of edges) {
          const a = byId[edge.a];
          const b = byId[edge.b];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dy, dz) || 0.01;
          const mag = Math.max(-1.2, Math.min(1.2, (dist - 108) * 0.01 * Math.min(2, edge.w)));
          a.vx += dx / dist * mag;
          a.vy += dy / dist * mag;
          a.vz += dz / dist * mag;
          b.vx -= dx / dist * mag;
          b.vy -= dy / dist * mag;
          b.vz -= dz / dist * mag;
        }
        for (const node of nodes) {
          const tz = (normFixed(node, settings.graphHeight) - 0.5) * 180;
          node.vz += (tz - node.z) * 0.015;
          node.vx += -node.x * 0.012;
          node.vy += -node.y * 0.012;
          node.vz += -node.z * 0.004;
          node.vx *= 0.74; node.vy *= 0.74; node.vz *= 0.74;
          node.x += node.vx; node.y += node.vy; node.z += node.vz;
          const span = Math.hypot(node.x, node.y, node.z);
          if (span > 340) {
            const s = 340 / span;
            node.x *= s; node.y *= s; node.z *= s;
          }
        }
      }
      for (const node of nodes) {
        this._pos[node.id] = {
          x: node.x, y: node.y, z: node.z,
          vx: node.vx, vy: node.vy, vz: node.vz,
          angle: node.angle, radius: node.radius, baseY: node.baseY, phase: node.phase, omega: node.omega
        };
      }
    };

    const draw = () => {
      step();
      if (layoutMode === "galaxy" && !dragging) view._cam.yaw += 0.0016;
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const style = getComputedStyle(canvas);
      const fg = layoutMode === "galaxy" ? "#f4f7ff" : (style.getPropertyValue("--text-normal").trim() || "#ddd");
      const muted = layoutMode === "galaxy" ? "#9eb0c8" : (style.getPropertyValue("--text-muted").trim() || "#888");
      const cx = w / 2;
      const cy = h / 2 + 8;
      const yaw = view._cam.yaw;
      const pitch = view._cam.pitch;
      const dist = view._cam.dist;
      const syaw = Math.sin(yaw);
      const cyaw = Math.cos(yaw);
      const sp = Math.sin(pitch);
      const cp = Math.cos(pitch);

      const project = (x, y, z) => {
        const x1 = x * cyaw - z * syaw;
        const z1 = x * syaw + z * cyaw;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const denom = dist - z2;
        if (denom < 48) return { sx: cx, sy: cy, depth: z2, scale: 0.02, hidden: true };
        const scale = 540 / denom;
        return { sx: cx + x1 * scale, sy: cy - y2 * scale, depth: z2, scale, hidden: false };
      };

      if (layoutMode === "galaxy") {
        const bg = ctx.createRadialGradient(cx, cy - 10, 18, cx, cy, Math.max(w, h) * 0.72);
        bg.addColorStop(0, "#243456");
        bg.addColorStop(0.38, "#10192c");
        bg.addColorStop(1, "#070910");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        for (const star of dust) {
          const p = project(star.x, star.y, star.z);
          if (p.hidden) continue;
          const twinkle = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(view._spin * 3 + star.tw));
          ctx.globalAlpha = 0.18 + twinkle * 0.45;
          ctx.fillStyle = "#d7e4ff";
          ctx.fillRect(p.sx, p.sy, star.s, star.s);
        }
        ctx.globalAlpha = 1;
        const core = project(0, 0, 0);
        if (!core.hidden) {
          const glow = ctx.createRadialGradient(core.sx, core.sy, 0, core.sx, core.sy, 78 * core.scale);
          glow.addColorStop(0, "rgba(255, 236, 210, 0.55)");
          glow.addColorStop(0.35, "rgba(120, 160, 255, 0.18)");
          glow.addColorStop(1, "rgba(80, 110, 200, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(core.sx, core.sy, 78 * core.scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineWidth = 1.4;
        for (let arm = 0; arm < 3; arm++) {
          ctx.beginPath();
          let started = false;
          for (let t = 0; t <= 1; t += 0.035) {
            const angle = arm * (Math.PI * 2 / 3) + t * 1.75 * Math.PI * 2;
            const radius = 48 + (0.16 + 0.84 * t) * 236;
            const p = project(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            if (p.hidden) { started = false; continue; }
            if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.strokeStyle = "rgba(186, 206, 255, 0.22)";
          ctx.stroke();
        }
      } else if (layoutMode === "metric") {
        const axis = [
          { key: settings.graphX, dir: [1, 0, 0], name: "X" },
          { key: settings.graphY, dir: [0, 1, 0], name: "Y" },
          { key: settings.graphZ, dir: [0, 0, 1], name: "Z" }
        ];
        ctx.save();
        ctx.strokeStyle = muted;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        for (const item of axis) {
          const a = project(-150 * item.dir[0], -150 * item.dir[1], -150 * item.dir[2]);
          const b = project(160 * item.dir[0], 160 * item.dir[1], 160 * item.dir[2]);
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = muted;
          ctx.font = "11px sans-serif";
          ctx.fillText(`${item.name} ${metricLabel(item.key)}`, b.sx + 4, b.sy);
          ctx.globalAlpha = 0.35;
        }
        ctx.restore();
      }

      projected.length = 0;
      const pts = nodes.map((node) => {
        const p = project(node.x, node.y, node.z);
        const size = layoutMode === "galaxy" ? 2.4 + normFixed(node, settings.graphSize) * 6.5 : 5 + normFixed(node, settings.graphSize) * 14;
        return Object.assign({ node, r: Math.max(layoutMode === "galaxy" ? 2.2 : 4, size * Math.max(0.35, p.scale)) }, p);
      }).filter((pt) => !pt.hidden).sort((a, b) => a.depth - b.depth);

      if (settings.graphShowEdges) {
        const focus = view.hoverWord || view.selectedWord;
        const accent = style.getPropertyValue("--interactive-accent").trim() || "#d7e4ff";
        for (const edge of edges) {
          const a = byId[edge.a];
          const b = byId[edge.b];
          const linked = !focus || edge.a === focus || edge.b === focus;
          if (layoutMode === "galaxy" && !linked && edge.w < 2) continue;
          const pa = project(a.x, a.y, a.z);
          const pb = project(b.x, b.y, b.z);
          if (pa.hidden || pb.hidden) continue;
          ctx.strokeStyle = linked && focus ? accent : (layoutMode === "galaxy" ? "rgba(255, 214, 170, 0.9)" : muted);
          ctx.globalAlpha = linked ? Math.min(0.75, 0.12 + edge.w * 0.1) : 0.05;
          ctx.lineWidth = linked ? Math.min(2.4, 0.6 + edge.w * 0.28) : 0.5;
          ctx.beginPath();
          ctx.moveTo(pa.sx, pa.sy);
          ctx.lineTo(pb.sx, pb.sy);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      const focusId = view.hoverWord || view.selectedWord;
      for (const pt of pts) {
        const node = pt.node;
        const heat = 1 - normFixed(node, settings.graphColor);
        const stellar = starColor(layoutMode === "galaxy" ? heat * 0.85 : normFixed(node, settings.graphColor));
        const color = layoutMode === "galaxy" ? stellar.rgb : mixHex(normFixed(node, settings.graphColor));
        const hot = node.id === focusId;
        const neighbor = !focusId || hot || edges.some((edge) => (edge.a === focusId && edge.b === node.id) || (edge.b === focusId && edge.a === node.id));
        if (layoutMode === "galaxy") {
          const glowR = pt.r * (hot ? 7 : 4.6);
          const glow = ctx.createRadialGradient(pt.sx, pt.sy, 0, pt.sx, pt.sy, glowR);
          glow.addColorStop(0, `rgba(255,255,255,${neighbor ? 0.95 : 0.45})`);
          glow.addColorStop(0.22, `rgba(${stellar.r}, ${stellar.g}, ${stellar.b}, ${neighbor ? 0.8 : 0.28})`);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 1;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, glowR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.fillStyle = layoutMode === "galaxy" ? "#fffaf2" : color;
        ctx.globalAlpha = neighbor ? 0.95 : 0.28;
        ctx.arc(pt.sx, pt.sy, pt.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = neighbor ? 1 : 0.35;
        if (node.watch || hot) {
          ctx.strokeStyle = node.watch ? "#f0c14a" : fg;
          ctx.lineWidth = hot ? 1.6 : 1.1;
          ctx.stroke();
        }
        if (neighbor && (hot || node.watch || pt.r > (layoutMode === "galaxy" ? 3.4 : 11))) {
          ctx.fillStyle = fg;
          ctx.font = "12px sans-serif";
          ctx.fillText(node.id, pt.sx + pt.r + 5, pt.sy + 4);
        }
        projected.push({ id: node.id, sx: pt.sx, sy: pt.sy, r: pt.r });
      }
      ctx.globalAlpha = 1;

      const focusNode = focusId ? byId[focusId] : null;
      if (focusNode) {
        const names = edges
          .filter((edge) => edge.a === focusId || edge.b === focusId)
          .slice(0, 4)
          .map((edge) => edge.a === focusId ? edge.b : edge.a);
        const extra = names.length ? ` · with ${names.join(", ")}` : "";
        hud.setText(`${focusNode.id} · ${focusNode.links} connections · count ${focusNode.count}${extra}`);
      } else if (layoutMode === "galaxy") {
        hud.setText("Galaxy · drag to orbit · scroll to zoom · frequent words sit nearer the core");
      } else {
        hud.setText("Drag to orbit · scroll or pinch to zoom · click a word to see its connections");
      }
      view._raf = requestAnimationFrame(draw);
    };
    this._raf = requestAnimationFrame(draw);
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
      .setDesc("Common words hidden from the most-used list and the graph. They still count if they are on the watchlist.")
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
      .setName("Graph nodes")
      .setDesc("How many words to draw in the 3D graph. Watchlist words are kept first.")
      .addSlider((slider) => {
        slider.setLimits(12, 80, 2)
          .setValue(this.plugin.settings.graphNodes || 42)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.graphNodes = value;
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
      id: "open-graph",
      name: "Open 3D graph",
      callback: async () => {
        this._openGraph = true;
        this.settings.panelMode = "graph";
        this.settings.graphLayout = "galaxy";
        this.settings.graphShowEdges = true;
        await this.saveSettings();
        await this.activateView();
        this.refreshViews();
      }
    });
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
    if (!["global", "file", "folder"].includes(this.settings.scope)) this.settings.scope = "global";
    if (!["list", "graph"].includes(this.settings.panelMode)) this.settings.panelMode = "list";
    if (!["metric", "links", "galaxy"].includes(this.settings.graphLayout) || !this.settings.sawGalaxy) {
      this.settings.graphLayout = "galaxy";
      this.settings.sawGalaxy = true;
    }
    for (const key of ["graphX", "graphY", "graphZ", "graphSize", "graphColor", "graphHeight"]) {
      if (!GRAPH_METRICS.some((m) => m.id === this.settings[key])) this.settings[key] = DEFAULT_SETTINGS[key];
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

  buildWordGraph(filterText) {
    const filter = this.normalize(filterText);
    const watch = this.getWatchlist();
    const watchSet = new Set(watch);
    const stop = this.getStopwords();
    const minCount = this.settings.scope === "file" ? 1 : (Number(this.settings.minCount) || 1);
    const limit = Math.max(8, Number(this.settings.graphNodes) || 42);
    const ranked = Object.entries(this.counts)
      .filter(([word, count]) => (!filter || word.includes(filter)) && (watchSet.has(word) || (!stop.has(word) && count >= minCount)))
      .sort((a, b) => {
        const wa = watchSet.has(a[0]) ? 1 : 0;
        const wb = watchSet.has(b[0]) ? 1 : 0;
        return wb - wa || b[1] - a[1] || a[0].localeCompare(b[0]);
      })
      .slice(0, limit)
      .map(([word]) => word);
    const chosen = new Set(ranked);
    const noteCount = {};
    const pair = {};
    for (const [path, bag] of Object.entries(this.getScopedFileCounts())) {
      const present = ranked.filter((word) => bag[word]);
      for (const word of present) noteCount[word] = (noteCount[word] || 0) + 1;
      for (let i = 0; i < present.length; i++) {
        for (let k = i + 1; k < present.length; k++) {
          const a = present[i] < present[k] ? present[i] : present[k];
          const b = present[i] < present[k] ? present[k] : present[i];
          const key = a + "\0" + b;
          pair[key] = (pair[key] || 0) + 1;
        }
      }
    }
    const degree = {};
    const allEdges = Object.entries(pair).map(([key, w]) => {
      const parts = key.split("\0");
      return { a: parts[0], b: parts[1], w };
    }).sort((a, b) => b.w - a.w);
    const kept = [];
    const seen = new Set();
    const perNode = {};
    for (const edge of allEdges) {
      const key = edge.a + "\0" + edge.b;
      const left = perNode[edge.a] || 0;
      const right = perNode[edge.b] || 0;
      if (left >= 4 && right >= 4) continue;
      if (kept.length >= 140 && left >= 1 && right >= 1) continue;
      kept.push(edge);
      seen.add(key);
      perNode[edge.a] = left + 1;
      perNode[edge.b] = right + 1;
      degree[edge.a] = (degree[edge.a] || 0) + 1;
      degree[edge.b] = (degree[edge.b] || 0) + 1;
    }
    const edges = kept;
    const nodes = ranked.filter((word) => chosen.has(word)).map((word) => {
      const count = this.counts[word] || 0;
      const notes = noteCount[word] || 0;
      return {
        id: word,
        count,
        notes,
        spread: count ? notes / count : 0,
        links: degree[word] || 0,
        length: word.length,
        watch: watchSet.has(word) ? 1 : 0
      };
    });
    return { nodes, edges };
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
      for (const word of tokenize(text, this.settings)) bag[word] = (bag[word] || 0) + 1;
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
        for (const word of tokenize(text, this.settings)) bag[word] = (bag[word] || 0) + 1;
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
