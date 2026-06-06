const api = {
  async get(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  },
  async post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  },
};

const state = {
  health: null,
  stats: null,
  lastQuery: null,
};

function text(id, value) {
  document.getElementById(id).textContent = value;
}

function setHealth(ok, detail) {
  const dot = document.getElementById("status-dot");
  dot.className = `status-dot ${ok ? "status-ok" : "status-error"}`;
  text("status-label", ok ? "API conectada" : "API sin conexion");
  text("status-detail", detail);
}

function renderStats(stats) {
  const corpus = stats.corpus;
  const evalReport = stats.eval?.results ? stats.eval : stats.eval?.report;
  const total = evalReport?.scenarios_total ?? 0;
  const passed = evalReport?.scenarios_passed ?? 0;
  const events = stats.events ?? [];

  text("documents-count", corpus.documents);
  text("chunks-count", corpus.chunks);
  text("corpus-path", corpus.directory);
  text("corpus-hash", `hash ${corpus.hash.slice(0, 12)}`);
  text("eval-score", total ? `${passed}/${total}` : "0/0");
  text("eval-detail", total && passed === total ? "Todos los escenarios pasan" : "Hay escenarios para revisar");
  text("events-count", events.length);

  renderFailures(evalReport?.results ?? []);
  renderEvents(events);
  text("raw-json", JSON.stringify(stats, null, 2));
}

function renderFailures(results) {
  const container = document.getElementById("failures-list");
  const failures = results.filter((result) => result.status !== "PASS");
  if (failures.length === 0) {
    container.innerHTML = `<div class="notice success">No hay fallos activos en la evaluacion actual.</div>`;
    return;
  }
  container.innerHTML = failures.map((failure) => `
    <div class="notice danger">
      <strong>${escapeHtml(failure.id)}</strong>
      <span>Faltan chunks: ${escapeHtml(failure.missing_chunk_ids.join(", ") || "sin detalle")}</span>
    </div>
  `).join("");
}

function renderEvents(events) {
  const container = document.getElementById("events-list");
  if (!events.length) {
    container.innerHTML = `<div class="notice warn">No se encontraron reportes historicos.</div>`;
    return;
  }
  container.innerHTML = events.slice(0, 8).map((event) => `
    <div class="event ${event.status === "PASS" ? "event-pass" : "event-check"}">
      <strong>${escapeHtml(event.phase)} / ${escapeHtml(event.file)}</strong>
      <span>${escapeHtml(event.status)}${event.summary ? ` · ${escapeHtml(String(event.summary))}` : ""}</span>
    </div>
  `).join("");
}

function renderQueryResults(result) {
  const container = document.getElementById("query-results");
  if (!result.results?.length) {
    container.innerHTML = `<p class="empty">La consulta no devolvio resultados.</p>`;
    return;
  }
  container.innerHTML = result.results.map((item) => `
    <article class="result-card">
      <div class="result-topline">
        <strong>${escapeHtml(item.chunk_id)}</strong>
        <span>${Number(item.score).toFixed(5)}</span>
      </div>
      <p>${escapeHtml(item.snippet)}</p>
      <small>${escapeHtml(item.citation.title)} · ${escapeHtml(item.citation.source_path)}</small>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refresh() {
  try {
    const [health, stats] = await Promise.all([
      api.get("/api/health"),
      api.get("/api/stats"),
    ]);
    state.health = health;
    state.stats = stats;
    setHealth(true, `${health.service} · uptime ${health.uptime_seconds}s`);
    renderStats(stats);
  } catch (error) {
    setHealth(false, error.message);
    text("raw-json", JSON.stringify({ ok: false, error: error.message }, null, 2));
  }
}

async function runQuery(event) {
  event.preventDefault();
  const query = document.getElementById("query-input").value;
  const mode = document.getElementById("mode-input").value;
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  button.textContent = "Consultando...";
  try {
    const result = await api.post("/api/query", { query, mode, top_k: 5 });
    state.lastQuery = result;
    renderQueryResults(result);
  } catch (error) {
    document.getElementById("query-results").innerHTML = `<div class="notice danger">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Consultar";
  }
}

document.getElementById("query-form").addEventListener("submit", runQuery);
document.getElementById("refresh-button").addEventListener("click", refresh);
refresh();
