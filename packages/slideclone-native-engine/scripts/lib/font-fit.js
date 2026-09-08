"use strict";

function normalizeTextRole(textBox = {}) {
  const explicit = typeof textBox.role === "string"
    ? textBox.role.trim().toLowerCase()
    : typeof textBox.source?.textRole === "string"
      ? textBox.source.textRole.trim().toLowerCase()
      : "";
  if (explicit) return canonicalRole(explicit);
  return inferRoleFromId(textBox.id || "");
}

function normalizeFontTargetRole(item = {}, kind = "text") {
  if (kind === "table") {
    const explicit = typeof item.role === "string" ? item.role.trim().toLowerCase() : "";
    if (explicit) return canonicalRole(explicit);
    return inferTableRoleFromId(item.id || "");
  }
  return normalizeTextRole(item);
}

function preservesTypography(item = {}) {
  return item?.source?.preserveTypography === true
    || item?.style?.preserveTypography === true;
}

function canonicalRole(role) {
  if (["heading", "headline"].includes(role)) return "title";
  if (["card", "card-heading"].includes(role)) return "card-title";
  if (["cta", "button-label"].includes(role)) return "button";
  if (["subtitle", "note", "description"].includes(role)) return "caption";
  return role || "body";
}

function inferRoleFromId(id) {
  const value = String(id || "").toLowerCase();
  if (!value) return "body";
  if (value.includes("card-title") || value.includes("engine-title")) return "card-title";
  if (value === "title" || /(^|-)title$/.test(value)) return "title";
  if (value.includes("banner")) return "banner";
  if (value.includes("button") || value.includes("portal-text")) return "button";
  if (value.includes("caption") || value.includes("note") || value.includes("desc")) return "caption";
  return "body";
}

function inferTableRoleFromId(id) {
  const value = String(id || "").toLowerCase();
  if (!value) return "table";
  if (value.includes("table")) return "table";
  return "table";
}

function collectTextRoleStats(ir) {
  const stats = new Map();
  for (const page of ir.pages || []) {
    for (const box of page.textBoxes || []) {
      if (preservesTypography(box)) continue;
      collectRoleStatsEntry(stats, normalizeFontTargetRole(box, "text"), box.font || {});
    }
    for (const table of page.tables || []) {
      if (preservesTypography(table)) continue;
      collectRoleStatsEntry(stats, normalizeFontTargetRole(table, "table"), {
        family: table.style?.fontFamily || null,
        weight: table.style?.fontWeight || null,
        sizePt: table.style?.fontSizePt || null
      });
    }
  }
  return [...stats.values()].map((entry) => ({
    role: entry.role,
    count: entry.count,
    families: [...entry.families],
    weights: [...entry.weights],
    averageSizePt: entry.sizePts.length
      ? round(entry.sizePts.reduce((sum, value) => sum + value, 0) / entry.sizePts.length)
      : null
  }));
}

function getRoleFitPlan(ir, config = {}) {
  const roleStats = collectTextRoleStats(ir);
  const statsByRole = new Map(roleStats.map((entry) => [entry.role, entry]));
  const roleConfig = config.roleCandidates || {};
  const configuredDefaultFamilies = Array.isArray(config.candidates) ? config.candidates : [];
  const configuredOrder = Array.isArray(config.roleOrder) ? config.roleOrder.map((role) => canonicalRole(String(role).trim().toLowerCase())) : [];
  const onlyRoles = Array.isArray(config.onlyRoles)
    ? new Set(config.onlyRoles.map((role) => canonicalRole(String(role).trim().toLowerCase())))
    : null;
  const roles = unique([
    ...configuredOrder,
    ...roleStats.map((entry) => entry.role)
  ]).filter((role) =>
    Number((statsByRole.get(role)?.count || 0)) > 0
    && (!onlyRoles || onlyRoles.has(role)));

  return roles.map((role) => {
    const stats = statsByRole.get(role) || { families: [], weights: [], count: 0 };
    const roleSettings = roleConfig[role] || {};
    const families = unique([...(roleSettings.families || []), ...stats.families, ...configuredDefaultFamilies]);
    const weights = unique([...(roleSettings.weights || []), ...stats.weights]);
    const sizeAdjustPt = uniqueNumbers([...(roleSettings.sizeAdjustPt || []), 0]);
    return {
      role,
      count: stats.count || 0,
      families,
      weights: weights.length ? weights : ["regular"],
      sizeAdjustPt: sizeAdjustPt.length ? sizeAdjustPt : [0]
    };
  });
}

function applyRoleFontOption(ir, role, option = {}) {
  const next = JSON.parse(JSON.stringify(ir));
  const canonical = canonicalRole(String(role || "").trim().toLowerCase());
  let changed = false;
  for (const page of next.pages || []) {
    for (const box of page.textBoxes || []) {
      if (preservesTypography(box)) continue;
      if (normalizeFontTargetRole(box, "text") !== canonical) continue;
      box.font = box.font || {};
      if (option.family && box.font.family !== option.family) {
        box.font.family = option.family;
        changed = true;
      }
      if (option.weight && box.font.weight !== option.weight) {
        box.font.weight = option.weight;
        changed = true;
      }
      if (typeof option.sizeAdjustPt === "number" && typeof box.font.sizePt === "number") {
        const nextSize = Math.max(1, round(box.font.sizePt + option.sizeAdjustPt));
        if (nextSize !== box.font.sizePt) {
          box.font.sizePt = nextSize;
          changed = true;
        }
      }
    }
    for (const table of page.tables || []) {
      if (preservesTypography(table)) continue;
      if (normalizeFontTargetRole(table, "table") !== canonical) continue;
      table.style = table.style || {};
      if (option.family && table.style.fontFamily !== option.family) {
        table.style.fontFamily = option.family;
        changed = true;
      }
      if (option.weight && table.style.fontWeight !== option.weight) {
        table.style.fontWeight = option.weight;
        table.style.headerWeight = option.weight;
        changed = true;
      }
      if (typeof option.sizeAdjustPt === "number") {
        if (typeof table.style.fontSizePt === "number") {
          const nextSize = Math.max(1, round(table.style.fontSizePt + option.sizeAdjustPt));
          if (nextSize !== table.style.fontSizePt) {
            table.style.fontSizePt = nextSize;
            changed = true;
          }
        }
        if (typeof table.style.headerFontSizePt === "number") {
          const nextHeaderSize = Math.max(1, round(table.style.headerFontSizePt + option.sizeAdjustPt));
          if (nextHeaderSize !== table.style.headerFontSizePt) {
            table.style.headerFontSizePt = nextHeaderSize;
            changed = true;
          }
        }
      }
      for (const row of Array.isArray(table.style.cellStyles) ? table.style.cellStyles : []) {
        for (const cellStyle of Array.isArray(row) ? row : []) {
          if (!cellStyle || typeof cellStyle !== "object") continue;
          if (option.family && cellStyle.fontFamily && cellStyle.fontFamily !== option.family) {
            cellStyle.fontFamily = option.family;
            changed = true;
          }
          if (option.weight && cellStyle.fontWeight && cellStyle.fontWeight !== option.weight) {
            cellStyle.fontWeight = option.weight;
            changed = true;
          }
          if (typeof option.sizeAdjustPt === "number" && typeof cellStyle.fontSizePt === "number") {
            const nextCellSize = Math.max(1, round(cellStyle.fontSizePt + option.sizeAdjustPt));
            if (nextCellSize !== cellStyle.fontSizePt) {
              cellStyle.fontSizePt = nextCellSize;
              changed = true;
            }
          }
        }
      }
    }
  }
  return { ir: next, changed };
}

function describeRoleOption(role, option = {}) {
  const parts = [];
  if (option.family) parts.push(`family=${option.family}`);
  if (option.weight) parts.push(`weight=${option.weight}`);
  if (typeof option.sizeAdjustPt === "number") parts.push(`sizeAdjustPt=${round(option.sizeAdjustPt)}`);
  return `${role}: ${parts.join(", ")}`;
}

function unique(values) {
  return [...new Set(values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim()))];
}

function uniqueNumbers(values) {
  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => round(value)))];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function collectRoleStatsEntry(stats, role, font = {}) {
  if (!stats.has(role)) {
    stats.set(role, {
      role,
      count: 0,
      families: new Set(),
      weights: new Set(),
      sizePts: []
    });
  }
  const entry = stats.get(role);
  entry.count += 1;
  if (font.family) entry.families.add(font.family);
  if (font.weight) entry.weights.add(font.weight);
  if (typeof font.sizePt === "number") entry.sizePts.push(font.sizePt);
}

module.exports = {
  applyRoleFontOption,
  collectTextRoleStats,
  describeRoleOption,
  getRoleFitPlan,
  normalizeFontTargetRole,
  normalizeTextRole,
  preservesTypography
};
