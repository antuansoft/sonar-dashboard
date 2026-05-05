import { useState, useCallback } from "react";

const API = "/api";

const METRICS = [
  "bugs", "vulnerabilities", "code_smells",
  "coverage", "duplicated_lines_density", "ncloc",
  "alert_status", "reliability_rating", "security_rating", "sqale_rating"
];

const RATING_LABEL = { "1": "A", "2": "B", "3": "C", "4": "D", "5": "E" };
const RATING_COLOR = {
  "1": { bg: "#EAF3DE", text: "#27500A", border: "#97C459" },
  "2": { bg: "#FAEEDA", text: "#633806", border: "#EF9F27" },
  "3": { bg: "#FAEEDA", text: "#633806", border: "#BA7517" },
  "4": { bg: "#FAECE7", text: "#712B13", border: "#D85A30" },
  "5": { bg: "#FCEBEB", text: "#791F1F", border: "#E24B4A" },
};

function fmtNum(val, metric) {
  if (val === undefined || val === null || val === "") return "—";
  if (metric === "coverage" || metric === "duplicated_lines_density") {
    return parseFloat(val).toFixed(1) + "%";
  }
  if (metric === "ncloc") {
    const n = parseInt(val);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return Math.round(n / 1000) + "k";
    return String(n);
  }
  return String(val);
}

function fmtTotal(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function fmtRelative(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtDuration(ms) {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function GateBadge({ status }) {
  const cfg = {
    OK:    { bg: "var(--color-background-success)", color: "var(--color-text-success)", label: "Passed" },
    ERROR: { bg: "var(--color-background-danger)",  color: "var(--color-text-danger)",  label: "Failed" },
    WARN:  { bg: "var(--color-background-warning)", color: "var(--color-text-warning)", label: "Warning" },
  }[status] || { bg: "var(--color-background-secondary)", color: "var(--color-text-secondary)", label: "—" };

  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 500, padding: "2px 8px",
      borderRadius: "var(--border-radius-md)", whiteSpace: "nowrap"
    }}>
      {cfg.label}
    </span>
  );
}

function RatingBadge({ value }) {
  if (!value) return <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>—</span>;
  const key = String(Math.round(parseFloat(value)));
  const c = RATING_COLOR[key] || RATING_COLOR["5"];
  return (
    <span style={{
      background: c.bg, color: c.text, border: `0.5px solid ${c.border}`,
      fontSize: 11, fontWeight: 500, padding: "1px 7px",
      borderRadius: "var(--border-radius-md)", fontFamily: "var(--font-mono)"
    }}>
      {RATING_LABEL[key]}
    </span>
  );
}

function MetricCell({ value, metric, label }) {
  const color = (() => {
    if (!value || value === "—") return "var(--color-text-secondary)";
    if (metric === "bugs" || metric === "vulnerabilities") {
      const n = parseInt(value);
      if (n === 0) return "var(--color-text-success)";
      if (n <= 5) return "var(--color-text-warning)";
      return "var(--color-text-danger)";
    }
    if (metric === "coverage") {
      const n = parseFloat(value);
      if (n >= 80) return "var(--color-text-success)";
      if (n >= 50) return "var(--color-text-warning)";
      return "var(--color-text-danger)";
    }
    return "var(--color-text-primary)";
  })();

  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
      <div style={{ fontSize: 16, fontWeight: 500, color, fontFamily: "var(--font-mono)", marginBottom: 2 }}>
        {fmtNum(value, metric)}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

function TaskStatusIcon({ status }) {
  const cfg = {
    SUCCESS:  { symbol: "✓", color: "var(--color-text-success)" },
    FAILED:   { symbol: "✗", color: "var(--color-text-danger)" },
    CANCELED: { symbol: "○", color: "var(--color-text-secondary)" },
  }[status] || { symbol: "·", color: "var(--color-text-secondary)" };
  return <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, flexShrink: 0 }}>{cfg.symbol}</span>;
}

function AnalysisPanel({ branches = [], tasks = [], prs = [], analysisQG = {} }) {
  const mainBranchName = branches.find(b => b.isMain)?.name;
  // Cuando un análisis es de PR, ce/activity no devuelve 'branch' sino 'pullRequest' (nº de PR).
  // Este mapa permite resolver el nombre de la rama a partir del número de PR.
  const prBranchByKey = Object.fromEntries(prs.map(p => [String(p.key), p.branch]));

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)" }}>

      {branches.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 11, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7
          }}>
            Ramas analizadas ({branches.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {branches.map(br => (
              <div key={br.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: br.isMain ? "var(--color-text-info)" : "var(--color-border-secondary)"
                  }} />
                  <span style={{
                    fontSize: 12, fontFamily: "var(--font-mono)",
                    color: br.isMain ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {br.name}
                  </span>
                  {br.isMain && (
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3,
                      background: "var(--color-background-info)", color: "var(--color-text-info)",
                      flexShrink: 0
                    }}>
                      principal
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <GateBadge status={br.status?.qualityGateStatus} />
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {fmtRelative(br.analysisDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pull Requests */}
      {prs.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 11, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7
          }}>
            Pull Requests ({prs.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {prs.map(pr => (
              <div key={pr.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                    #{pr.key}
                  </span>
                  <span style={{
                    fontSize: 12, fontFamily: "var(--font-mono)",
                    color: "var(--color-text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {pr.branch}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                    → {pr.base}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <GateBadge status={pr.status?.qualityGateStatus} />
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {fmtRelative(pr.analysisDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7
          }}>
            Historial de análisis ({tasks.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tasks.slice(0, 15).map(task => {
              const branchLabel = task.branch || prBranchByKey[String(task.pullRequest)] || mainBranchName || "—";
              const qgStatus = task.analysisId ? analysisQG[task.analysisId] : undefined;
              return (
                <div key={task.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <TaskStatusIcon status={task.status} />
                    <span style={{
                      fontSize: 11, fontFamily: "var(--font-mono)",
                      color: "var(--color-text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {branchLabel}
                    </span>
                    {task.pullRequest && (
                      <span style={{
                        fontSize: 9, padding: "1px 4px", borderRadius: 3,
                        background: "var(--color-background-secondary)", color: "var(--color-text-secondary)",
                        flexShrink: 0, whiteSpace: "nowrap"
                      }}>
                        PR #{task.pullRequest}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    {qgStatus
                      ? <GateBadge status={qgStatus} />
                      : <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>—</span>
                    }
                    <span style={{ fontSize: 11, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                      {fmtRelative(task.completedAt || task.submittedAt)}
                    </span>
                    {task.executionTimeMs && (
                      <>
                        <span style={{ color: "var(--color-border-secondary)", fontSize: 11 }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {fmtDuration(task.executionTimeMs)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--color-text-secondary)", fontStyle: "italic" }}>
            ✓ / ✗ = ejecución del análisis completada / fallida &nbsp;·&nbsp; Passed / Failed = resultado del Quality Gate
          </div>
        </div>
      )}

      {branches.length === 0 && tasks.length === 0 && prs.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", margin: "4px 0" }}>
          Sin datos de análisis disponibles
        </p>
      )}
    </div>
  );
}

function ProjectCard({ project, m, branches = [], tasks = [], prs = [], analysisQG = {} }) {
  const [showAnalysis, setShowAnalysis] = useState(false);

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding: "16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.key}
          </div>
        </div>
        <GateBadge status={m?.alert_status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
        <MetricCell value={m?.bugs} metric="bugs" label="Bugs" />
        <MetricCell value={m?.vulnerabilities} metric="vulnerabilities" label="Vulns" />
        <MetricCell value={m?.code_smells} metric="code_smells" label="Smells" />
        <MetricCell value={m?.coverage} metric="coverage" label="Coverage" />
        <MetricCell value={m?.duplicated_lines_density} metric="duplicated_lines_density" label="Duplic." />
        <MetricCell value={m?.ncloc} metric="ncloc" label="Líneas" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { key: "reliability_rating", label: "Reliability" },
            { key: "security_rating", label: "Security" },
            { key: "sqale_rating", label: "Maint." },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <RatingBadge value={m?.[key]} />
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAnalysis(v => !v)}
          style={{ fontSize: 11, padding: "2px 8px", opacity: 0.75 }}
        >
          {showAnalysis
            ? "Ocultar ▴"
            : `Análisis${branches.length > 0 ? ` (${branches.length} rama${branches.length > 1 ? "s" : ""}${prs.length > 0 ? `, ${prs.length} PR` : ""})` : ""} ▾`}
        </button>
      </div>

      {showAnalysis && <AnalysisPanel branches={branches} tasks={tasks} prs={prs} analysisQG={analysisQG} />}
    </div>
  );
}

function StatCard({ label, value, note }) {
  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 16px", flex: "1 1 120px", minWidth: 110 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>{note}</div>}
    </div>
  );
}

export default function SonarDashboard() {
  const [token, setToken] = useState("");
  const [org, setOrg] = useState("");
  const [projects, setProjects] = useState([]);
  const [measures, setMeasures] = useState({});
  const [branches, setBranches] = useState({});
  const [ceActivity, setCeActivity] = useState({});
  const [pullRequests, setPullRequests] = useState({});
  const [analysisQG, setAnalysisQG] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async (t, o) => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Basic ${btoa(t + ":")}` };

      const r1 = await fetch(`${API}/components/search_projects?organization=${encodeURIComponent(o)}&ps=50`, { headers });
      if (!r1.ok) {
        const body = await r1.json().catch(() => ({}));
        const msg = body?.errors?.[0]?.msg || r1.statusText;
        throw new Error(`HTTP ${r1.status} — ${msg}`);
      }
      const d1 = await r1.json();
      const comps = d1.components || [];
      setProjects(comps);

      if (comps.length > 0) {
        const keys = comps.map(c => c.key).join(",");
        const r2 = await fetch(`${API}/measures/search?projectKeys=${encodeURIComponent(keys)}&metricKeys=${METRICS.join(",")}`, { headers });
        const d2 = await r2.json();
        const grouped = {};
        for (const item of (d2.measures || [])) {
          if (!grouped[item.component]) grouped[item.component] = {};
          grouped[item.component][item.metric] = item.value;
        }
        setMeasures(grouped);

        // Fetch branches, PRs and CE activity for each project in parallel
        const branchMap = {};
        const ceMap = {};
        const prMap = {};
        await Promise.all(comps.map(async (comp) => {
          try {
            const [brRes, ceRes, prRes] = await Promise.all([
              fetch(`${API}/project_branches/list?project=${encodeURIComponent(comp.key)}`, { headers }),
              fetch(`${API}/ce/activity?component=${encodeURIComponent(comp.key)}&ps=50`, { headers }),
              fetch(`${API}/project_pull_requests/list?project=${encodeURIComponent(comp.key)}`, { headers }),
            ]);
            if (brRes.ok) {
              const brJson = await brRes.json();
              branchMap[comp.key] = brJson.branches || [];
            }
            if (ceRes.ok) {
              const ceJson = await ceRes.json();
              ceMap[comp.key] = ceJson.tasks || [];
            }
            if (prRes.ok) {
              const prJson = await prRes.json();
              prMap[comp.key] = prJson.pullRequests || [];
            }
          } catch {
            // no bloquear si falla para un proyecto concreto
          }
        }));
        setBranches(branchMap);
        setCeActivity(ceMap);
        setPullRequests(prMap);

        // Segunda pasada: obtener QG por análisis usando project_analyses/search.
        // Los eventos QG solo aparecen cuando el estado CAMBIA, así que propagamos
        // el último estado conocido hacia adelante (de más antiguo a más reciente).
        const qgMap = {};
        await Promise.all(comps.map(async (comp) => {
          const aMap = {};

          const processAnalyses = (analyses) => {
            const sorted = [...analyses].sort((a, b) => new Date(a.date) - new Date(b.date));
            let lastQG = null;
            for (const a of sorted) {
              const qgEvt = a.events?.find(e => e.category === "QUALITY_GATE");
              if (qgEvt) {
                lastQG = ["Passed", "Fixed"].includes(qgEvt.name) ? "OK" : "ERROR";
              }
              if (lastQG) aMap[a.key] = lastQG;
            }
          };

          const fetchAnalyses = async (params) => {
            try {
              const res = await fetch(
                `${API}/project_analyses/search?project=${encodeURIComponent(comp.key)}&ps=100&${params}`,
                { headers }
              );
              if (res.ok) processAnalyses((await res.json()).analyses || []);
            } catch {}
          };

          await Promise.all([
            ...(branchMap[comp.key] || []).map(br =>
              br.isMain
                ? fetchAnalyses("")
                : fetchAnalyses(`branch=${encodeURIComponent(br.name)}`)
            ),
            ...(prMap[comp.key] || []).map(pr =>
              fetchAnalyses(`pullRequest=${encodeURIComponent(pr.key)}`)
            ),
          ]);

          qgMap[comp.key] = aMap;
        }));
        setAnalysisQG(qgMap);
      }

      setConnected(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConnect = () => { if (token && org) load(token, org); };

  const disconnect = () => {
    setConnected(false);
    setProjects([]);
    setMeasures({});
    setBranches({});
    setCeActivity({});
    setPullRequests({});
    setAnalysisQG({});
    setError(null);
  };

  const filtered = projects.filter(p => {
    if (filter === "all") return true;
    const s = measures[p.key]?.alert_status;
    if (filter === "pass") return s === "OK";
    if (filter === "fail") return s === "ERROR";
    return true;
  });

  const passCount  = projects.filter(p => measures[p.key]?.alert_status === "OK").length;
  const failCount  = projects.filter(p => measures[p.key]?.alert_status === "ERROR").length;
  const totalLines = projects.reduce((acc, p) => acc + parseInt(measures[p.key]?.ncloc || 0), 0);
  const totalBugs  = projects.reduce((acc, p) => acc + parseInt(measures[p.key]?.bugs || 0), 0);

  if (!connected) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>SonarCloud dashboard</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 28 }}>
            Introduce tu token y clave de organización para empezar.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5 }}>
              Token de acceso
            </label>
            <input
              type="password"
              placeholder="squ_xxxxxxxxxxxx"
              value={token}
              onChange={e => setToken(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
              Genera uno en My Account → Security en sonarcloud.io
            </p>
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5 }}>
              Clave de organización
            </label>
            <input
              type="text"
              placeholder="mi-organizacion"
              value={org}
              onChange={e => setOrg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              style={{ width: "100%" }}
            />
          </div>

          {error && (
            <div style={{
              background: "var(--color-background-danger)", color: "var(--color-text-danger)",
              border: "0.5px solid var(--color-border-danger)",
              borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontSize: 13, marginBottom: 16
            }}>
              {error}
              {error.includes("401") && (
                <span style={{ display: "block", fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                  Revisa que el token sea válido y tenga permisos de lectura.
                </span>
              )}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={!token || !org || loading}
            style={{ width: "100%" }}
          >
            {loading ? "Conectando..." : "Conectar ↗"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ visibility: "hidden", position: "absolute" }}>SonarCloud dashboard</h2>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Organización: </span>
          <span style={{ fontSize: 15, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{org}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => load(token, org)} disabled={loading} style={{ fontSize: 13 }}>
            {loading ? "Cargando..." : "↺ Actualizar"}
          </button>
          <button onClick={disconnect} style={{ fontSize: 13 }}>Desconectar</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <StatCard label="Proyectos" value={projects.length} />
        <StatCard label="Quality gate ✓" value={passCount} note={`${Math.round(passCount / projects.length * 100) || 0}% del total`} />
        <StatCard label="Quality gate ✗" value={failCount} />
        <StatCard label="Bugs totales" value={totalBugs} />
        <StatCard label="Líneas de código" value={fmtTotal(totalLines)} note="de 1.9M disponibles" />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "1.25rem", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginRight: 4 }}>Filtrar:</span>
        {[
          { key: "all",  label: `Todos (${projects.length})` },
          { key: "pass", label: `Passed (${passCount})` },
          { key: "fail", label: `Failed (${failCount})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              fontSize: 12,
              background: filter === f.key ? "var(--color-background-info)" : undefined,
              color: filter === f.key ? "var(--color-text-info)" : undefined,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center", padding: "3rem 0" }}>
          No hay proyectos que mostrar.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map(proj => (
            <ProjectCard
              key={proj.key}
              project={proj}
              m={measures[proj.key]}
              branches={branches[proj.key] || []}
              tasks={ceActivity[proj.key] || []}
              prs={pullRequests[proj.key] || []}
              analysisQG={analysisQG[proj.key] || {}}
            />
          ))}
        </div>
      )}

      <p style={{ marginTop: "1.5rem", fontSize: 11, color: "var(--color-text-secondary)" }}>
        Datos obtenidos en tiempo real desde sonarcloud.io · {new Date().toLocaleTimeString("es-ES")}
      </p>
    </div>
  );
}
