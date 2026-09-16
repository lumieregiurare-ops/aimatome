(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 60;
  const TOPICS_FIRST = 6;
  const STATE_KEY = "aimc:state";
  const FAV_KEY = "aimc:favs";
  const READ_KEY = "aimc:read";
  const READ_MAX = 400;

  let data = { items: [], topics: [], categories: [], sources: [] };
  let shown = PAGE;
  let topicsShown = TOPICS_FIRST;

  // ブラウザにだけ残る保存物。サーバーには何も送らない。
  let favs = load(FAV_KEY, {});
  let read = load(READ_KEY, []);
  let pickupId = "";

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
    store(STATE_KEY, state);
  }
  function store(k, value) {
    try {
      localStorage.setItem(k, JSON.stringify(value));
    } catch {
      /* 保存できない設定のブラウザでは黙って諦める */
    }
  }

  const isFav = (id) => !!favs[id];
  const favCount = () => Object.keys(favs).length;

  function toggleFav(it) {
    if (favs[it.id]) delete favs[it.id];
    else {
      // 記事は数日で一覧から消えるので、表示に必要な分を控えておく
      favs[it.id] = {
        id: it.id,
        title: it.title,
        url: it.url,
        source: it.source,
        summary: it.summary || "",
        publishedAt: it.publishedAt,
        categories: it.categories || [],
        savedAt: new Date().toISOString(),
      };
    }
    store(FAV_KEY, favs);
  }

  function markRead(id) {
    if (read.includes(id)) return;
    read.push(id);
    if (read.length > READ_MAX) read = read.slice(-READ_MAX);
    store(READ_KEY, read);
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
  // お気に入りは保存したものを表示する。一覧に残っていれば最新の内容に差し替える。
  function favItems() {
    const byId = new Map(data.items.map((i) => [i.id, i]));
    return Object.values(favs)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .map((f) => ({ ...(byId.get(f.id) || { ...f, isPR: false, gone: true }), savedAt: f.savedAt }));
  }

  function visible() {
    const q = state.q.trim().toLowerCase();
    const since = state.period === "all" ? 0 : Date.now() - Number(state.period) * 86400000;
    // お気に入りは期間やカテゴリではなく、保存したものをすべて出す
    if (state.cat === "fav") {
      return favItems().filter((it) => !q || `${it.title} ${it.summary} ${it.source}`.toLowerCase().includes(q));
    }
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

    // 前回の収集になかった記事は目印を付ける
    if (it.isNew && state.cat !== "fav") {
      const badge = document.createElement("span");
      badge.className = "row-new";
      badge.textContent = "NEW";
      a.before(badge);
    }
    a.addEventListener("click", () => markRead(it.id));

    const fav = document.createElement("button");
    fav.type = "button";
    fav.className = "row-fav" + (isFav(it.id) ? " on" : "");
    fav.textContent = "★";
    fav.title = isFav(it.id) ? "お気に入りから外す" : "お気に入りに追加";
    fav.addEventListener("click", () => {
      toggleFav(it);
      renderFilters();
      if (state.cat === "fav") renderList();
      else {
        fav.classList.toggle("on", isFav(it.id));
        fav.title = isFav(it.id) ? "お気に入りから外す" : "お気に入りに追加";
      }
    });

    row.append(time, src, main, tail, fav);
    return row;
  }

  // ---------- 絞り込み UI ----------
  function renderFilters() {
    const chips = $("#catChips");
    chips.innerHTML = "";
    const opts = [{ id: "all", label: "すべて" }, ...data.categories.filter((c) => c.count > 0), { id: "fav", label: "★ お気に入り", count: favCount() }];
    for (const c of opts) {
      const b = document.createElement("button");
      b.className = "chip" + (state.cat === c.id ? " active" : "");
      b.innerHTML = c.id === "all" ? c.label : `${c.label}<span class="n">${c.count}</span>`;
      if (c.id === "fav") b.classList.add("chip-fav");
      b.addEventListener("click", () => set({ cat: c.id }));
      chips.appendChild(b);
    }

    const sel = $("#sourceSel");
    sel.innerHTML = `<option value="all">すべて</option>` + data.sources.map((s) => `<option value="${s.name}">${s.name}（${s.count}）</option>`).join("");
    sel.value = data.sources.some((s) => s.name === state.source) ? state.source : "all";
    state.source = sel.value;

    $("#sourceList").textContent = data.sources.slice(0, 22).map((s) => s.name).join(" / ");
  }

  // ---------- いま読むならこれ ----------
  function renderPickup() {
    const pool = data.items.filter((it) => !it.isPR);
    if (!pool.length) {
      $("#pickupSection").hidden = true;
      return;
    }
    // まだ開いていない記事を優先する（毎回同じものが出ないように）
    const unread = pool.filter((it) => !read.includes(it.id) && it.id !== pickupId);
    const from = unread.length ? unread : pool;
    const it = from[Math.floor(Math.random() * from.length)];
    pickupId = it.id;

    const box = $("#pickupBody");
    box.innerHTML = "";
    const meta = document.createElement("div");
    meta.className = "pickup-meta";
    meta.textContent = `${it.source} ・ ${hhmm(it.publishedAt)}`;
    const a = document.createElement("a");
    a.className = "pickup-title";
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = it.title;
    a.addEventListener("click", () => markRead(it.id));
    const sum = document.createElement("p");
    sum.className = "pickup-sum";
    sum.textContent = it.summary || "";
    box.append(meta, a, sum);
    $("#pickupSection").hidden = false;
  }

  // ---------- 更新の様子 ----------
  function renderChurn() {
    const c = data.churn;
    const el = $("#churn");
    if (!c || !c.previousCount) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `前回から <b>${c.newCount}</b> 本が新着<span class="next" id="nextUpdate"></span>`;
    tickCountdown();
  }

  function tickCountdown() {
    const el = $("#nextUpdate");
    if (!el) return;
    const left = data.nextUpdateAt ? new Date(data.nextUpdateAt).getTime() - Date.now() : 0;
    if (left > 0) {
      const m = Math.round(left / 60000);
      el.textContent = m >= 60 ? `次の更新まで約 ${Math.round(m / 60)} 時間` : `次の更新まで約 ${Math.max(1, m)} 分`;
      return;
    }
    // 目安を過ぎたら「まもなく更新されます」と言い続けず、最後に更新した時刻を出す。
    // 収集は遅れることがあり、待たせ続ける表示のほうが止まって見えるため。
    const min = Math.max(0, Math.round((Date.now() - new Date(data.updatedAt).getTime()) / 60000));
    el.textContent = min < 120 ? `最終更新 ${min} 分前` : `最終更新 ${Math.round(min / 60)} 時間前`;
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
    renderChurn();
    renderPickup();
    renderTopics();
    renderFilters();
    renderList();
    setInterval(tickCountdown, 60000);
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
  $("#pickupAgain").addEventListener("click", renderPickup);
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
