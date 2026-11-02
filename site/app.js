(function () {
  "use strict";

  const ENGINES = ["SCALPER", "QUANT", "LONGTERM"];
  const NAMES = { SCALPER: "Scalper", QUANT: "Quant", LONGTERM: "Longterm" };
  const COLORS = { TOTAL: "#f3f7f2", SCALPER: "#39d0d8", QUANT: "#67d38e", LONGTERM: "#f0b84d", SPY: "#8a8f99" };
  const PAGE = 200;
  let data = null;
  let filter = "ALL";
  let shown = PAGE;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const isNum = (v) => typeof v === "number" && isFinite(v);

  function money(v, sign) {
    if (!isNum(v)) return "-";
    const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!sign) return "$" + s;
    return (v > 0 ? "+$" : v < 0 ? "-$" : "$") + s;
  }
  function pct(v, sign) {
    if (!isNum(v)) return "-";
    const s = Math.abs(v).toFixed(2) + "%";
    if (sign === false) return s;
    return v > 0 ? "+" + s : v < 0 ? "-" + s : s;
  }
  function price(v) {
    return isNum(v) ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "-";
  }
  function tone(v) {
    return !isNum(v) || v === 0 ? "flat" : v > 0 ? "pos" : "neg";
  }
  function dateLabel(iso) {
    if (!iso) return "-";
    const d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function timeET(utc) {
    if (!utc) return "-";
    return new Date(utc).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: "America/New_York" }) + " ET";
  }
  function hold(seconds) {
    if (!isNum(seconds)) return "-";
    if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + " min";
    if (seconds < 86400 * 2) return (seconds / 3600).toFixed(1) + " h";
    return Math.round(seconds / 86400) + " d";
  }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.append(c));
    return node;
  }
  function get(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function bind() {
    const map = {
      record_start: dateLabel(data.record_start),
      as_of: data.status === "PENDING" ? "Not yet" : dateLabel(data.as_of_date),
      label: data.label || "Paper accounts: simulated money, real market prices.",
      generated: data.generated_utc ? "Updated " + timeET(data.generated_utc) : "",
    };
    $$("[data-bind]").forEach((n) => { if (map[n.dataset.bind] !== undefined) n.textContent = map[n.dataset.bind]; });
    const fmt = {
      "total.equity": (v) => money(v), "total.pnl": (v) => money(v, true), "total.return_pct": (v) => "(" + pct(v) + ")",
      "spy.return_pct": (v) => pct(v), "total.trades_closed": (v) => (isNum(v) ? String(v) : "-"),
      "total.win_rate_pct": (v) => (isNum(v) ? v.toFixed(1) + "%" : "-"), "total.realized_pnl": (v) => money(v, true),
      "total.max_drawdown_pct": (v) => pct(v),
    };
    $$("[data-stat]").forEach((n) => {
      const key = n.dataset.stat;
      const v = get(data, key);
      n.textContent = (fmt[key] || String)(v);
      if (/pnl|return_pct|drawdown/.test(key)) n.classList.add(tone(v));
    });
  }

  function chart() {
    const box = $("#equityChart");
    const legend = $("#chartLegend");
    box.textContent = "";
    legend.textContent = "";
    const daily = data.daily || [];
    if (daily.length < 1 || !data.engines) {
      box.append(el("div", { class: "empty", text: "The chart starts with the first published close." }));
      return;
    }
    const base = {};
    (data.engines || []).forEach((e) => { base[e.engine] = e.start_equity; });
    const totalBase = data.total && data.total.start_equity;
    const series = [{ key: "TOTAL", name: "All engines", pts: [0].concat(daily.map((d) => totalBase ? 100 * (d.total_equity / totalBase - 1) : null)) }];
    ENGINES.forEach((e) => {
      if (base[e]) series.push({ key: e, name: NAMES[e], pts: [0].concat(daily.map((d) => isNum(d.equity[e]) ? 100 * (d.equity[e] / base[e] - 1) : null)) });
    });
    if (daily.some((d) => isNum(d.spy_return_pct))) series.push({ key: "SPY", name: "SPY", dash: true, pts: [0].concat(daily.map((d) => d.spy_return_pct)) });
    const labels = [data.baseline_date ? "Start" : ""].concat(daily.map((d) => d.date));
    const all = series.flatMap((s) => s.pts).filter(isNum);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const W = Math.max(300, Math.floor(box.getBoundingClientRect().width || 900));
    const H = W < 560 ? 220 : 300, L = 46, R = 12, T = 12, B = 28;
    const x = (i) => L + (labels.length === 1 ? 0 : (i * (W - L - R)) / (labels.length - 1));
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    };
    const step = niceStep((hi - lo) / 5);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      add("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: Math.abs(v) < 1e-9 ? "rgba(220,232,224,0.35)" : "rgba(220,232,224,0.08)", "stroke-width": 1 });
      add("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "#65716d", "font-size": 11 }, (v > 0 ? "+" : "") + v.toFixed(step < 1 ? 1 : 0) + "%");
    }
    const every = Math.max(1, Math.ceil(labels.length / Math.max(3, Math.floor(W / 110))));
    labels.forEach((lab, i) => {
      const last = labels.length - 1;
      if (i === last || (i % every === 0 && last - i >= Math.ceil(every / 2))) {
        add("text", { x: x(i), y: H - 8, "text-anchor": i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle", fill: "#65716d", "font-size": 11 },
          i === 0 ? "Start" : new Date(lab + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
      }
    });
    series.forEach((s) => {
      const pts = s.pts.map((v, i) => (isNum(v) ? [x(i), y(v)] : null)).filter(Boolean);
      if (!pts.length) return;
      add("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: COLORS[s.key],
        "stroke-width": s.key === "TOTAL" ? 2.6 : 1.6, "stroke-dasharray": s.dash ? "5 4" : "none", "stroke-linejoin": "round" });
      const last = pts[pts.length - 1];
      add("circle", { cx: last[0], cy: last[1], r: s.key === "TOTAL" ? 3.5 : 2.5, fill: COLORS[s.key] });
      const swatch = el("i");
      swatch.style.background = COLORS[s.key];                  // CSSOM, allowed by the page's content policy
      const item = el("span", {}, [swatch, s.name + " " + pct(s.pts[s.pts.length - 1])]);
      legend.append(item);
    });
    box.append(svg);
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  function engines() {
    const grid = $("#engineGrid");
    grid.textContent = "";
    (data.engines || []).forEach((e) => {
      const rows = [
        ["Equity", money(e.equity)],
        ["Profit / loss", money(e.pnl, true), tone(e.pnl)],
        ["Return", pct(e.return_pct), tone(e.return_pct)],
        ["Closed trades", isNum(e.trades_closed) ? String(e.trades_closed) : "-"],
        ["Winners", isNum(e.win_rate_pct) ? e.win_rate_pct.toFixed(1) + "%" : "-"],
        ["Average win / loss", (isNum(e.avg_win) ? money(e.avg_win) : "-") + " / " + (isNum(e.avg_loss) ? money(e.avg_loss, true) : "-")],
        ["Open positions", isNum(e.trades_open) ? String(e.trades_open) : "-"],
        ["Worst drop from a high", pct(e.max_drawdown_pct), tone(e.max_drawdown_pct)],
      ];
      const dl = el("dl");
      rows.forEach(([k, v, t]) => { dl.append(el("dt", { text: k })); dl.append(el("dd", { text: v, class: t || "" })); });
      grid.append(el("article", { class: "engine-card" }, [
        el("header", {}, [el("h3", { text: e.name }), el("span", { class: "badge " + e.engine, text: "Started " + money(e.start_equity) })]),
        dl,
      ]));
    });
  }

  function table(id, head, rows, emptyText) {
    const t = $(id);
    t.textContent = "";
    const thead = el("thead", {}, [el("tr", {}, head.map(([h, cls]) => el("th", { text: h, class: cls || "" })))]);
    const tbody = el("tbody");
    if (!rows.length) {
      tbody.append(el("tr", {}, [el("td", { class: "empty-row", colspan: String(head.length), text: emptyText })]));
    }
    rows.forEach((cells) => {
      tbody.append(el("tr", {}, cells.map((c) => {
        if (c instanceof Node) return el("td", { class: "l" }, [c]);
        const [text, cls] = Array.isArray(c) ? c : [c, ""];
        return el("td", { text, class: cls });
      })));
    });
    t.append(thead, tbody);
  }
  const badge = (e) => el("span", { class: "badge " + e, text: NAMES[e] || e });

  function daily() {
    const rows = (data.daily || []).slice().reverse().map((d) => {
      const total = ENGINES.reduce((s, e) => s + (isNum(d.day_pnl[e]) ? d.day_pnl[e] : 0), 0);
      return [dateLabel(d.date)].concat(ENGINES.map((e) => [money(d.day_pnl[e], true), tone(d.day_pnl[e])]),
        [[money(total, true), tone(total)], money(d.total_equity), [pct(d.spy_return_pct), tone(d.spy_return_pct)]]);
    });
    table("#dailyTable", [["Date"], ["Scalper"], ["Quant"], ["Longterm"], ["Day total"], ["Equity"], ["SPY since start"]],
      rows, "No closes published yet.");
  }

  function holdings() {
    const rows = (data.holdings || []).map((h) => [badge(h.engine), [h.symbol, "l"], String(h.qty), price(h.avg_cost),
      price(h.close), money(h.market_value), [money(h.unrealized_pnl, true), tone(h.unrealized_pnl)],
      [pct(h.unrealized_pct), tone(h.unrealized_pct)], dateLabel(h.opened_date)]);
    table("#holdingsTable", [["Engine"], ["Symbol", "l"], ["Shares"], ["Avg cost"], ["Close"], ["Value"], ["Unrealized"], ["%"], ["Since"]],
      rows, data.status === "PENDING" ? "No holdings published yet. The first snapshot comes after the first published close."
        : "No open positions at the last close.");
  }

  function trades() {
    const list = (data.trades || []).filter((t) => filter === "ALL" || t.engine === filter || (filter === "OPEN" && t.status === "OPEN"));
    const rows = list.slice(0, shown).map((t) => [badge(t.engine), [t.symbol, "l"], timeET(t.opened_utc), String(t.qty),
      price(t.avg_entry), t.status === "OPEN" ? [t.sold_qty ? "Partly sold" : "Open", "l"] : [timeET(t.closed_utc), "l"],
      price(t.avg_exit), [t.sold_qty ? money(t.realized_pnl, true) : "-", tone(t.realized_pnl)],
      [t.sold_qty ? pct(t.return_pct) : "-", tone(t.return_pct)], hold(t.hold_seconds), [t.exit_reason || "-", "l"]]);
    table("#tradesTable", [["Engine"], ["Symbol", "l"], ["Bought"], ["Shares"], ["Entry"], ["Sold", "l"], ["Exit"], ["P&L"], ["%"], ["Held"], ["Exit reason", "l"]],
      rows, data.status === "PENDING" ? "Trades appear after the first published close." : "No trades in this view yet.");
    const foot = $("#tradesFoot");
    foot.textContent = list.length > shown ? `Showing ${shown} of ${list.length}. ` : `${list.length} trade${list.length === 1 ? "" : "s"}.`;
    if (list.length > shown) {
      const more = el("button", { type: "button", class: "chip", text: "Show more" });
      more.addEventListener("click", () => { shown += PAGE; trades(); });
      foot.append(more);
    }
  }

  function beforeRecord() {
    const panel = $("#beforePanel");
    const b = data.before_record;
    if (!b || !b.count) { panel.hidden = true; return; }
    panel.hidden = false;
    const span = b.first_date === b.last_date ? dateLabel(b.first_date) : dateLabel(b.first_date) + " - " + dateLabel(b.last_date);
    $("#beforeSummary").textContent = `Before the record started: ${b.count} test trade${b.count === 1 ? "" : "s"} (${span}), net ${money(b.realized_pnl, true)}`;
    const rows = b.trades.map((t) => [badge(t.engine), [t.symbol, "l"], timeET(t.opened_utc), String(t.qty), price(t.avg_entry),
      t.status === "OPEN" ? ["Open", "l"] : [timeET(t.closed_utc), "l"], price(t.avg_exit),
      [t.sold_qty ? money(t.realized_pnl, true) : "-", tone(t.realized_pnl)], [t.sold_qty ? pct(t.return_pct) : "-", tone(t.return_pct)]]);
    table("#beforeTable", [["Engine"], ["Symbol", "l"], ["Bought"], ["Shares"], ["Entry"], ["Sold", "l"], ["Exit"], ["P&L"], ["%"]],
      rows, "");
  }

  function notices() {
    const pending = data.status === "PENDING";
    $("#pendingNotice").hidden = !pending;
    ["#totalBoard", ".chart-panel", "#engineGrid", "#dailyPanel"].forEach((s) => { $(s).hidden = pending; });
    $("#sampleNotice").hidden = !data.sample;
    const notes = $("#notes");
    notes.textContent = "";
    (data.notes || []).forEach((n) => notes.append(el("li", { text: n })));
    notes.hidden = !(data.notes || []).length;
    const repo = data.repository_url;
    if (repo) {
      const p = $("#repoLink");
      p.textContent = "Every daily update: ";
      p.append(el("a", { href: repo + "/commits/main/site/data/results.json", text: "public update history", rel: "noopener" }));
    }
  }

  function render() {
    bind();
    notices();
    chart();
    engines();
    daily();
    holdings();
    trades();
    beforeRecord();
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (data) chart(); }, 150);
  });

  $$(".chip[data-filter]").forEach((b) => b.addEventListener("click", () => {
    $$(".chip[data-filter]").forEach((x) => x.classList.toggle("active", x === b));
    filter = b.dataset.filter;
    shown = PAGE;
    trades();
  }));

  function events(list) {
    const panel = $("#eventsPanel");
    const items = (Array.isArray(list) ? list : []).filter((e) => e && typeof e.date === "string" && typeof e.text === "string")
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    panel.hidden = !items.length;
    if (!items.length) return;
    const ol = $("#eventsList");
    const more = $("#eventsMore");
    const draw = (n) => {
      ol.textContent = "";
      items.slice(0, n).forEach((e) => {
        const head = el("p", { class: "event-head" }, [el("time", { datetime: e.date, text: dateLabel(e.date) })]);
        (Array.isArray(e.engines) ? e.engines : []).forEach((g) => { if (NAMES[g]) head.append(badge(g)); });
        if (typeof e.title === "string" && e.title) head.append(el("strong", { text: e.title }));
        ol.append(el("li", { class: "event" }, [head, el("p", { class: "event-text", text: e.text })]));
      });
      more.hidden = items.length <= n;
    };
    draw(5);
    more.addEventListener("click", () => draw(items.length));
  }

  fetch("./data/events.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => events(json && json.events))
    .catch(() => events([]));

  fetch("./data/results.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((json) => { data = json; render(); })
    .catch(() => {
      data = { status: "PENDING", record_start: "2026-11-02" };
      render();
    });
})();
