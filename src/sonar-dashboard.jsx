import { useState, useCallback } from "react";
import ExcelJS from "exceljs";

const API = "/api";

const METRICS = [
  "bugs", "vulnerabilities", "code_smells",
  "coverage", "duplicated_lines_density", "ncloc",
  "alert_status", "reliability_rating", "security_rating", "sqale_rating",
  "security_hotspots", "security_hotspots_reviewed", "security_review_rating"
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
  if (metric === "coverage" || metric === "duplicated_lines_density" || metric === "security_hotspots_reviewed") {
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

async function exportToExcel(projects, measures, branches, pullRequests, ceActivity, analysisQG, org) {
  const GREEN = "FFC8E6C9";
  const RED = "FFFFCDD2";
  const HEADER_BG = "FFE0E0E0";
  const TITLE_BG = "FFD9D9D9";
  const REPO_HEADER_BG = "FFFAD4D4";
  const PERIOD_HEADER_BG = "FFD0E4F5";
  const NO_DATA_BG = "FFEEEEEE";

  const jenkinsColor = (ratio) => {
    if (ratio === null || ratio === undefined || isNaN(ratio)) return NO_DATA_BG;
    if (ratio >= 1.0) return "FF00C853";
    if (ratio >= 0.8) return "FFA5D6A7";
    if (ratio >= 0.6) return "FFCDDC39";
    if (ratio >= 0.4) return "FFFFC107";
    if (ratio >= 0.2) return "FFFF9800";
    return "FFF44336";
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sonar Dashboard";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Análisis");

  sheet.columns = [
    { width: 55 },
    { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 },
    { width: 10 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 },
    { width: 10 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 },
  ];

  sheet.mergeCells("B1:G1");
  const titleCell = sheet.getCell("B1");
  titleCell.value = "RESULTADO DEL ANALISIS";
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.font = { bold: true, size: 12 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };

  sheet.mergeCells("H1:L1");
  const weekTitle = sheet.getCell("H1");
  weekTitle.value = "ÚLTIMA SEMANA";
  weekTitle.alignment = { horizontal: "center", vertical: "middle" };
  weekTitle.font = { bold: true, size: 12 };
  weekTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PERIOD_HEADER_BG } };

  sheet.mergeCells("M1:Q1");
  const twoWeekTitle = sheet.getCell("M1");
  twoWeekTitle.value = "SEMANA ANTERIOR";
  twoWeekTitle.alignment = { horizontal: "center", vertical: "middle" };
  twoWeekTitle.font = { bold: true, size: 12 };
  twoWeekTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PERIOD_HEADER_BG } };

  sheet.getRow(1).height = 22;

  const ramasLegend = "Ramas analizadas\nen el periodo\n(sin código de color)";
  const prsTotalLegend = "PRs analizadas\nen el periodo\n(sin código de color)";
  const prsPFLegend = "Passed / Failed (QG)\nGradiente Jenkins:\n✓ Verde → 100%\n⚠ Amarillo → 40-79%\n✗ Rojo → < 40%";
  const analLegend = "Análisis con QG\nevaluada en el periodo\n(sin código de color)";
  const analPFLegend = "Passed / Failed (QG)\nGradiente Jenkins:\n✓ Verde → 100%\n⚠ Amarillo → 40-79%\n✗ Rojo → < 40%";

  const allLegends = [
    "VALOR OPTIMO = A (0)\n✓ Verde → valor = 0 (no issues)\n✗ Rojo/ámbar → valor > 0",
    "VALOR OPTIMO = A (0)\n✓ Verde → valor = 0 (no issues)\n✗ Rojo/ámbar → valor > 0",
    "VALOR OPTIMO = A (0)\n✓ Verde → valor = 0 (no issues)\n✗ Rojo/ámbar → valor > 0",
    "VALOR OPTIMO = 100%\n✓ Verde → 100%\n✗ Rojo → < 100%",
    "VALOR OPTIMO = 100%\n✓ Verde → 100%\n✗ Rojo → < 100%",
    "VALOR OPTIMO <= 3%\n✓ Verde → <= 3%\n✗ Rojo → > 3%",
    ramasLegend, prsTotalLegend, prsPFLegend, analLegend, analPFLegend,
    ramasLegend, prsTotalLegend, prsPFLegend, analLegend, analPFLegend,
  ];

  for (let i = 0; i < allLegends.length; i++) {
    const cell = sheet.getCell(2, i + 2);
    cell.value = allLegends[i];
    cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    cell.font = { size: 8 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  }
  sheet.getRow(2).height = 80;

  const headers = [
    "REPOSITORIO",
    "SECURITY", "RELIABILITY", "MAINTAINABILITY", "HOTSPOT", "COVERAGE", "DUPLICATIONS",
    "RAMAS", "PRs TOTAL", "PRs P/F", "ANÁLISIS", "ANÁL P/F",
    "RAMAS", "PRs TOTAL", "PRs P/F", "ANÁLISIS", "ANÁL P/F",
  ];
  const headerRow = sheet.getRow(4);
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPO_HEADER_BG } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });
  headerRow.height = 24;

  const fillFor = (color) => ({ type: "pattern", pattern: "solid", fgColor: { argb: color } });
  const thinBorder = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };

  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

  const computePeriod = (projKey, startMs, endMs) => {
    const inWindow = (dateStr) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return t >= startMs && t < endMs;
    };

    const projBranches = branches[projKey] || [];
    const projPRs = pullRequests[projKey] || [];
    const projTasks = ceActivity[projKey] || [];
    const projQG = analysisQG[projKey] || {};

    const ramas = projBranches.filter(b => inWindow(b.analysisDate)).length;

    const prsInWindow = projPRs.filter(pr => inWindow(pr.analysisDate));
    const prsTotal = prsInWindow.length;
    const prsPassed = prsInWindow.filter(pr => pr.status?.qualityGateStatus === "OK").length;
    const prsFailed = prsInWindow.filter(pr => pr.status?.qualityGateStatus === "ERROR").length;

    const tasksInWindow = projTasks.filter(t => inWindow(t.submittedAt));
    const tasksWithQG = tasksInWindow.filter(t => t.analysisId && projQG[t.analysisId]);
    const analTotal = tasksWithQG.length;
    const analPassed = tasksWithQG.filter(t => projQG[t.analysisId] === "OK").length;
    const analFailed = tasksWithQG.filter(t => projQG[t.analysisId] === "ERROR").length;

    return { ramas, prsTotal, prsPassed, prsFailed, analTotal, analPassed, analFailed };
  };

  projects.forEach((proj, idx) => {
    const m = measures[proj.key] || {};
    const row = sheet.getRow(5 + idx);

    const has = (v) => v !== undefined && v !== null && v !== "";
    const vulns = has(m.vulnerabilities) ? parseInt(m.vulnerabilities) : null;
    const bugs = has(m.bugs) ? parseInt(m.bugs) : null;
    const smells = has(m.code_smells) ? parseInt(m.code_smells) : null;
    const hotspots = has(m.security_hotspots) ? parseInt(m.security_hotspots) : null;
    const reviewed = has(m.security_hotspots_reviewed) ? parseFloat(m.security_hotspots_reviewed) : null;
    const coverage = has(m.coverage) ? parseFloat(m.coverage) : null;
    const duplications = has(m.duplicated_lines_density) ? parseFloat(m.duplicated_lines_density) : null;

    row.getCell(1).value = proj.key;

    if (vulns === null) row.getCell(2).value = "—";
    else { row.getCell(2).value = vulns; row.getCell(2).fill = fillFor(vulns === 0 ? GREEN : RED); }

    if (bugs === null) row.getCell(3).value = "—";
    else { row.getCell(3).value = bugs; row.getCell(3).fill = fillFor(bugs === 0 ? GREEN : RED); }

    if (smells === null) row.getCell(4).value = "—";
    else { row.getCell(4).value = smells; row.getCell(4).fill = fillFor(smells === 0 ? GREEN : RED); }

    if (hotspots === null && reviewed === null) {
      row.getCell(5).value = "—";
    } else {
      const pct = reviewed === null ? "—" : reviewed.toFixed(1) + "%";
      row.getCell(5).value = `${hotspots ?? 0} (${pct})`;
      const ok = (hotspots ?? 0) === 0 || reviewed === 100;
      row.getCell(5).fill = fillFor(ok ? GREEN : RED);
    }

    if (coverage === null) row.getCell(6).value = "—";
    else { row.getCell(6).value = coverage.toFixed(1) + "%"; row.getCell(6).fill = fillFor(coverage === 100 ? GREEN : RED); }

    if (duplications === null) row.getCell(7).value = "—";
    else { row.getCell(7).value = duplications.toFixed(1) + "%"; row.getCell(7).fill = fillFor(duplications <= 3 ? GREEN : RED); }

    const writePeriod = (startCol, data) => {
      row.getCell(startCol).value = data.ramas;
      row.getCell(startCol + 1).value = data.prsTotal;

      const prSum = data.prsPassed + data.prsFailed;
      row.getCell(startCol + 2).value = `${data.prsPassed} / ${data.prsFailed}`;
      const prRatio = prSum > 0 ? data.prsPassed / prSum : null;
      row.getCell(startCol + 2).fill = fillFor(jenkinsColor(prRatio));

      row.getCell(startCol + 3).value = data.analTotal;

      row.getCell(startCol + 4).value = `${data.analPassed} / ${data.analFailed}`;
      const analRatio = data.analTotal > 0 ? data.analPassed / data.analTotal : null;
      row.getCell(startCol + 4).fill = fillFor(jenkinsColor(analRatio));
    };

    writePeriod(8, computePeriod(proj.key, now - ONE_WEEK, now));
    writePeriod(13, computePeriod(proj.key, now - TWO_WEEKS, now - ONE_WEEK));

    for (let i = 1; i <= 17; i++) {
      const cell = row.getCell(i);
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center" };
      if (i === 1) cell.font = { size: 11 };
    }
    row.height = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `sonar-report-${org}-${date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function LoadingOverlay({ progress }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999,
    }}>
      <div style={{
        background: "var(--color-background-primary, #fff)",
        padding: "22px 28px",
        borderRadius: "var(--border-radius-md, 8px)",
        minWidth: 380,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        border: "0.5px solid var(--color-border-default, #e0e0e0)",
      }}>
        <h3 style={{ margin: 0, marginBottom: 14, fontSize: 14, fontWeight: 600 }}>
          Cargando datos de SonarCloud
        </h3>
        <div style={{
          background: "var(--color-background-secondary, #f0f0f0)",
          borderRadius: 4, height: 10, overflow: "hidden", marginBottom: 10,
        }}>
          <div style={{
            background: "var(--color-text-info, #2196F3)",
            height: "100%", width: `${pct}%`,
            transition: "width 0.2s ease-out",
          }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 12, color: "var(--color-text-secondary)",
        }}>
          <span>
            {progress.total > 0
              ? `Proyectos procesados: ${progress.done} / ${progress.total}`
              : "Inicializando..."}
          </span>
          <span style={{ fontWeight: 600 }}>{pct}%</span>
        </div>
        {progress.phase && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
            Fase: {progress.phase}
          </div>
        )}
      </div>
    </div>
  );
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

function RatingCell({ ratingVal, mainVal, mainMetric, subVal, label }) {
  const key = ratingVal ? String(Math.round(parseFloat(ratingVal))) : null;
  const rc = key ? (RATING_COLOR[key] || RATING_COLOR["5"]) : null;

  const valueColor = (() => {
    if (rc) return rc.text;
    if (mainMetric === "coverage") {
      if (!mainVal || mainVal === "—") return "var(--color-text-secondary)";
      const n = parseFloat(mainVal);
      if (n >= 80) return "var(--color-text-success)";
      if (n >= 50) return "var(--color-text-warning)";
      return "var(--color-text-danger)";
    }
    return "var(--color-text-primary)";
  })();

  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, flexWrap: "wrap" }}>
        {key && (
          <span style={{
            background: rc.bg, color: rc.text, border: `0.5px solid ${rc.border}`,
            fontSize: 10, fontWeight: 600, padding: "1px 5px",
            borderRadius: "var(--border-radius-md)", fontFamily: "var(--font-mono)", flexShrink: 0
          }}>
            {RATING_LABEL[key]}
          </span>
        )}
        <span style={{ fontSize: 15, fontWeight: 500, color: valueColor, fontFamily: "var(--font-mono)" }}>
          {mainVal ?? "—"}
        </span>
        {subVal && (
          <span style={{ fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
            {subVal} rev.
          </span>
        )}
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
                    → {pr.target}
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
        <RatingCell ratingVal={m?.security_rating}    mainVal={fmtNum(m?.vulnerabilities, "vulnerabilities")}           label="Security" />
        <RatingCell ratingVal={m?.reliability_rating} mainVal={fmtNum(m?.bugs, "bugs")}                                  label="Reliability" />
        <RatingCell ratingVal={m?.sqale_rating}       mainVal={fmtNum(m?.code_smells, "code_smells")}                    label="Maintainab." />
        <RatingCell ratingVal={m?.security_review_rating}
                    mainVal={fmtNum(m?.security_hotspots, "security_hotspots")}
                    subVal={fmtNum(m?.security_hotspots_reviewed, "security_hotspots_reviewed")}                          label="Hotspots" />
        <RatingCell mainVal={fmtNum(m?.coverage, "coverage")}                          mainMetric="coverage"             label="Coverage" />
        <RatingCell mainVal={fmtNum(m?.duplicated_lines_density, "duplicated_lines_density")}                            label="Duplic." />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          {fmtNum(m?.ncloc, "ncloc")} líneas de código
        </span>
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
  const [loadingProgress, setLoadingProgress] = useState({ done: 0, total: 0, phase: "" });
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async (t, o) => {
    setLoading(true);
    setLoadingProgress({ done: 0, total: 0, phase: "Conectando..." });
    setError(null);
    try {
      const headers = { Authorization: `Basic ${btoa(t + ":")}` };

      const r1 = await fetch(`${API}/components/search_projects?organization=${encodeURIComponent(o)}&ps=500`, { headers });
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
        setLoadingProgress({ done: 0, total: comps.length, phase: "Datos básicos (ramas, PRs, actividad)" });
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
          } finally {
            setLoadingProgress(prev => ({ ...prev, done: prev.done + 1 }));
          }
        }));
        setBranches(branchMap);
        setCeActivity(ceMap);
        setPullRequests(prMap);

        // Segunda pasada: QG por análisis.
        // Ramas LONG: correlacionar project_analyses/search (keys+fechas) con
        //   measures/search_history (valor real de QG por análisis, sin depender de eventos de cambio).
        // PRs: usar pr.status.qualityGateStatus directamente desde prMap.
        const qgMap = {};
        setLoadingProgress({ done: 0, total: comps.length, phase: "Historial de Quality Gate" });
        await Promise.all(comps.map(async (comp) => {
          const aMap = {};
          const longBranches = (branchMap[comp.key] || []).filter(br => br.isMain || br.type === "LONG");

          await Promise.all(longBranches.map(async (br) => {
            try {
              const branchParam = br.isMain ? "" : `&branch=${encodeURIComponent(br.name)}`;
              const [analysesRes, historyRes] = await Promise.all([
                fetch(`${API}/project_analyses/search?project=${encodeURIComponent(comp.key)}&ps=100${branchParam}`, { headers }),
                fetch(`${API}/measures/search_history?component=${encodeURIComponent(comp.key)}&metrics=alert_status&ps=100${branchParam}`, { headers }),
              ]);
              if (!analysesRes.ok || !historyRes.ok) return;
              const [analysesJson, historyJson] = await Promise.all([analysesRes.json(), historyRes.json()]);
              const analyses = analysesJson.analyses || [];
              const history = historyJson.measures?.[0]?.history || [];
              const dateToKey = {};
              for (const a of analyses) {
                dateToKey[new Date(a.date).toISOString()] = a.key;
              }
              for (const h of history) {
                if (!h.value) continue;
                const key = dateToKey[new Date(h.date).toISOString()];
                if (key) aMap[key] = h.value;
              }
            } catch {}
          }));

          for (const pr of (prMap[comp.key] || [])) {
            const qg = pr.status?.qualityGateStatus;
            if (!qg || qg === "NONE") continue;
            for (const task of (ceMap[comp.key] || [])) {
              if (String(task.pullRequest) === String(pr.key) && task.analysisId) {
                aMap[task.analysisId] = qg;
              }
            }
          }

          qgMap[comp.key] = aMap;
          setLoadingProgress(prev => ({ ...prev, done: prev.done + 1 }));
        }));
        setAnalysisQG(qgMap);
      }

      setConnected(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingProgress({ done: 0, total: 0, phase: "" });
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
        {loading && <LoadingOverlay progress={loadingProgress} />}
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
      {loading && <LoadingOverlay progress={loadingProgress} />}
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
        <button
          onClick={() => exportToExcel(filtered, measures, branches, pullRequests, ceActivity, analysisQG, org)}
          disabled={filtered.length === 0}
          style={{ fontSize: 12, marginLeft: "auto" }}
          title="Exportar los proyectos filtrados a un fichero Excel"
        >
          ⬇ Exportar a Excel ({filtered.length})
        </button>
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
