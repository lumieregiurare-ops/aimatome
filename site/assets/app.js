(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 60;
  const TOPICS_FIRST = 6;
  const STATE_KEY = "aimc:state";

  let data = { items: [], topics: [], categories: [], sources: [] };
  let shown = PAGE;
  let topicsShown = TOPICS_FIRST;

  const state = Object.assign(
    { size: "m", cat: "all", source: "all", period: "2", q: "", hidePR: true },
    load(STATE_KEY, {})
  );

  function load(k, fb) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fb;
    } catch {
      return fb;
    }
  }
  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  // ---------- 日付まわり（すべて日本時間で扱う） ----------
  const jst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600000);
  const dayKey = (iso) => jst(iso).toISOString().slice(0, 10);
  const hhmm = (iso) => {
    const d = jst(iso);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };
  function dayLabel(key) {
    const today = dayKey(new Date().toISOString());
    const y = dayKey(new Date(Date.now() - 86400000).toISOString());
    if (key === today) return "今日";
    if (key === y) return "昨日";
    const [, m, d] = key.split("-");
    const w = ["日", "月", "火", "水", "木", "金", "土"][new Date(key + "T00:00:00Z").getUTCDay()];
    return `${Number(m)}月${Number(d)}日（${w}）`;
  }
  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    return `${Math.floor(diff / 86400)}日前`;
  }
  const catLabel = (id) => data.categories.find((c) => c.id === id)?.label || "";

  // ---------- 文字サイズ ----------
  function applySize() {
    document.documentElement.dataset.size = state.size;
    for (const b of document.querySelectorAll(".size-switch button")) {
      b.setAttribute("aria-pressed", String(b.dataset.size === state.size));
    }
  }

  // ---------- 絞り込み ----------
  function visible() {
    const q = state.q.trim().toLowerCase();
    const since = state.period === "all" ? 0 : Date.now() - Number(state.period) * 86400000;
    return data.items.filter((it) => {
      if (state.hidePR && it.isPR) return false;
      if (state.cat !== "all" && !it.categories.includes(state.cat)) return false;
      if (state.source !== "all" && it.source !== state.source) return false;
      if (since && new Date(it.publishedAt).getTime() < since) return false;
      if (q && !`${it.title} ${it.summary} ${it.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---------- トピック ----------
  function renderTopics() {
    const list = data.topics || [];
    if (!list.length) return;
    $("#topicsSection").hidden = false;
    const grid = $("#topicGrid");
    grid.innerHTML = "";
    for (const t of list.slice(0, topicsShown)) {
      const el = document.createElement("article");
      el.className = "topic";

      const top = document.createElement("div");
      top.className = "topic-top";
      const cnt = document.createElement("span");
      cnt.className = "topic-count";
      cnt.textContent = `${t.sourceCount}媒体が報道`;
      top.appendChild(cnt);
      for (const k of (t.keywords || []).slice(0, 2)) {
        const kw = document.createElement("span");
        kw.className = "topic-kw";
        kw.textContent = k;
        top.appendChild(kw);
      }
      const time = document.createElement("span");
      time.className = "topic-time";
      time.textContent = relTime(t.publishedAt);
      top.appendChild(time);

      const h = document.createElement("h3");
      h.className = "topic-title";
      const a = document.createElement("a");
      a.href = t.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = t.title;
      h.appendChild(a);

      const sum = document.createElement("p");
      sum.className = "topic-sum";
      sum.textContent = t.summary || "";

      el.append(top, h, sum);

      if (t.articles?.length) {
        const btn = document.createElement("button");
        btn.className = "topic-more";
        const ul = document.createElement("ul");
        ul.className = "topic-links";
        ul.hidden = true;
        for (const ar of t.articles) {
          const li = document.createElement("li");
          const src = document.createElement("span");
          src.className = "src";
          src.textContent = ar.source;
          const link = document.createElement("a");
          link.href = ar.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = ar.title;
          link.title = ar.title;
          li.append(src, link);
          ul.appendChild(li);
        }
        const sync = () => (btn.textContent = ul.hidden ? `関連記事 ${t.articles.length} 本を見る` : "閉じる");
        sync();
        btn.addEventListener("click", () => {
          ul.hidden = !ul.hidden;
          sync();
        });
        el.append(btn, ul);
      }
      grid.appendChild(el);
    }
    const more = $("#topicMore");
    more.hidden = list.length <= topicsShown;
    more.textContent = `ほかの話題を見る（残り ${list.length - topicsShown} 件）`;
  }

  // ---------- 記事一覧（日付ごとにまとめる） ----------
  function renderList() {
    const all = visible();
    const rows = all.slice(0, shown);
    $("#count").textContent = `${all.length} 件${all.length > rows.length ? `（${rows.length} 件を表示中）` : ""}`;
    $("#empty").hidden = all.length > 0;

    const box = $("#list");
    box.innerHTML = "";
    const groups = new Map();
    for (const it of rows) {
      const k = dayKey(it.publishedAt);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }

    for (const [key, list] of groups) {
      const sec = document.createElement("section");
      sec.className = "day";
      const h = document.createElement("h3");
      h.className = "day-head";
      h.innerHTML = `${dayLabel(key)}<span class="n">${list.length} 件</span>`;
      const rowsEl = document.createElement("div");
      rowsEl.className = "rows";
      for (const it of list) rowsEl.appendChild(makeRow(it));
      sec.append(h, rowsEl);
      box.appendChild(sec);
    }

    const more = $("#listMore");
    more.hidden = all.length <= rows.length;
    more.textContent = `さらに表示（残り ${all.length - rows.length} 件）`;
  }

  function makeRow(it) {
    const row = document.createElement("div");
    row.className = "row";

    const time = document.createElement("span");
    time.className = "row-time";
    time.textContent = hhmm(it.publishedAt);

    const src = document.createElement("span");
    src.className = "row-src";
    src.textContent = it.source;
    src.title = it.source;

    const main = document.createElement("div");
    main.className = "row-main";
    const a = document.createElement("a");
    a.className = "row-title";
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = it.title;
    const sum = document.createElement("p");
    sum.className = "row-sum";
    sum.textContent = it.summary || "";
    main.append(a, sum);

    const tail = document.createElement("span");
    tail.className = it.isPR ? "row-pr" : "row-cat";
    tail.textContent = it.isPR ? "PR" : catLabel(it.categories[0]);

    row.append(time, src, main, tail);
    return row;
  }

  // ---------- 絞り込み UI ----------
  function renderFilters() {
    const chips = $("#catChips");
    chips.innerHTML = "";
    const opts = [{ id: "all", label: "すべて" }, ...data.categories.filter((c) => c.count > 0)];
    for (const c of opts) {
      const b = document.createElement("button");
      b.className = "chip" + (state.cat === c.id ? " active" : "");
      b.innerHTML = c.id === "all" ? c.label : `${c.label}<span class="n">${c.count}</span>`;
      b.addEventListener("click", () => set({ cat: c.id }));
      chips.appendChild(b);
    }

    const sel = $("#sourceSel");
    sel.innerHTML = `<option value="all">すべて</option>` + data.sources.map((s) => `<option value="${s.name}">${s.name}（${s.count}）</option>`).join("");
    sel.value = data.sources.some((s) => s.name === state.source) ? state.source : "all";
    state.source = sel.value;

    $("#sourceList").textContent = data.sources.slice(0, 22).map((s) => s.name).join(" / ");
  }

  function set(patch) {
    Object.assign(state, patch);
    shown = PAGE;
    save();
    renderFilters();
    renderList();
  }

  // ---------- 起動 ----------
  async function boot() {
    $("#year").textContent = new Date().getFullYear();
    applySize();
    $("#q").value = state.q;
    $("#periodSel").value = state.period;
    $("#hidePR").checked = state.hidePR;

    try {
      const r = await fetch(`data/news.json?t=${Math.floor(Date.now() / 300000)}`);
      data = await r.json();
    } catch {
      $("#meta").textContent = "データを読み込めませんでした。";
      return;
    }
    const u = new Date(data.updatedAt);
    $("#meta").textContent = `${data.total} 本の記事 ・ 今日 ${data.todayCount} 本 ・ ${data.topics.length} の話題 ・ 最終更新 ${u.getMonth() + 1}/${u.getDate()} ${String(u.getHours()).padStart(2, "0")}:${String(u.getMinutes()).padStart(2, "0")}`;
    renderTopics();
    renderFilters();
    renderList();
  }

  // ---------- イベント ----------
  for (const b of document.querySelectorAll(".size-switch button")) {
    b.addEventListener("click", () => {
      state.size = b.dataset.size;
      save();
      applySize();
    });
  }
  let timer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => set({ q: e.target.value }), 180);
  });
  $("#sourceSel").addEventListener("change", (e) => set({ source: e.target.value }));
  $("#periodSel").addEventListener("change", (e) => set({ period: e.target.value }));
  $("#hidePR").addEventListener("change", (e) => set({ hidePR: e.target.checked }));
  $("#listMore").addEventListener("click", () => {
    shown += PAGE;
    renderList();
  });
  $("#topicMore").addEventListener("click", () => {
    topicsShown += 6;
    renderTopics();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#q")) {
      e.preventDefault();
      $("#q").focus();
    }
  });
  const toTop = $("#toTop");
  const onScroll = () => (toTop.hidden = window.scrollY < 500);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  boot();
})();
