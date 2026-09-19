"use strict";

const DOMAIN_LABELS = Object.freeze({
  "product-journey": "产品闭环",
  "visual-interaction": "视觉、交互与无障碍",
  "data-security": "数据、权限与可靠性",
  "engineering-delivery": "工程与交付"
});
const FINDING_DOMAIN = Object.freeze({
  "product-entrypoints": "product-journey",
  "product-flow-evidence": "product-journey",
  "journey-state-evidence": "product-journey",
  "visual-interaction-evidence": "visual-interaction",
  "interaction-feedback-evidence": "visual-interaction",
  "responsive-evidence": "visual-interaction",
  "accessibility-evidence": "visual-interaction",
  "experience-review": "visual-interaction",
  "input-validation-evidence": "data-security",
  "error-recovery-evidence": "data-security",
  "api-contract-evidence": "data-security",
  "authorization-evidence": "data-security",
  "data-lifecycle-evidence": "data-security",
  "worker-reliability-evidence": "data-security",
  "possible-secrets": "data-security",
  "package-manifest": "engineering-delivery",
  "dependency-lock": "engineering-delivery",
  "automated-tests": "engineering-delivery",
  "declared-quality-gates": "engineering-delivery",
  "ci-workflows": "engineering-delivery",
  "ci-gate-coverage-evidence": "engineering-delivery",
  "observability-evidence": "engineering-delivery",
  "operations-evidence": "engineering-delivery",
  "release-governance-evidence": "engineering-delivery",
  "release-safety-evidence": "engineering-delivery",
  "repository-governance-evidence": "engineering-delivery",
  "runtime-gates": "engineering-delivery"
});
const PRIORITY_ORDER = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });

function createAuditDiagnostics({ findings, reviewDomains, scope, gates, experience } = {}) {
  const normalizedFindings = Array.isArray(findings) ? findings : [];
  const findingById = new Map(normalizedFindings.map((finding) => [finding.id, finding]));
  const domains = Array.isArray(reviewDomains) && reviewDomains.length
    ? reviewDomains
    : selectedDomainsFromFindings(normalizedFindings);
  const capabilityMatrix = domains.map((domain) => domainCapability(domain, findingById));
  const bottlenecks = prioritizeBottlenecks([
    ...confirmedBottlenecks(normalizedFindings),
    ...experienceBottlenecks(experience),
    ...domainEvidenceBottlenecks(capabilityMatrix, scope)
  ]).slice(0, 8);
  const recommendations = recommendationsForBottlenecks(bottlenecks, normalizedFindings).slice(0, 8);
  const acceptanceChecklist = acceptanceChecks({ capabilityMatrix, bottlenecks, recommendations, scope });
  return Object.freeze({
    confidence: overallConfidence({ scope, findings: normalizedFindings, gates, experience }),
    evidenceBoundary: evidenceBoundary({ scope, gates, experience }),
    capabilityMatrix: Object.freeze(capabilityMatrix),
    bottlenecks: Object.freeze(bottlenecks),
    recommendations: Object.freeze(recommendations),
    acceptanceChecklist: Object.freeze(acceptanceChecklist)
  });
}

function experienceBottlenecks(experience) {
  const issues = Array.isArray(experience?.diagnostics?.issues) ? experience.diagnostics.issues : [];
  return issues.map((issue) => Object.freeze({
    id: issue.id,
    domain: "visual-interaction",
    priority: issue.priority || "P2",
    classification: issue.classification || "suspected-issue",
    confidence: issue.confidence || "medium",
    signal: `${issue.scenarioId}: ${issue.signal}`,
    impact: "Reviewed browser artifacts need attention before the scenario can support experience health.",
    recommendation: issue.recommendation || "Inspect the referenced browser evidence and either fix or rule out the suspected issue.",
    verification: issue.verification || "Re-run the approved scenario and confirm the diagnostic issue is absent."
  }));
}

function selectedDomainsFromFindings(findings) {
  const selected = [];
  const seen = new Set();
  for (const finding of findings) {
    const id = FINDING_DOMAIN[finding.id];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    selected.push({ id, label: DOMAIN_LABELS[id] || id, findingIds: Object.keys(FINDING_DOMAIN).filter((findingId) => FINDING_DOMAIN[findingId] === id) });
  }
  return selected;
}

function domainCapability(domain, findingById) {
  const findingIds = Array.isArray(domain.findingIds) ? domain.findingIds : [];
  const domainFindings = findingIds.map((id) => findingById.get(id)).filter(Boolean);
  const warningCount = domainFindings.filter((finding) => finding.severity === "warn" || (finding.passed === false && finding.assessment === "missing")).length;
  const evidenceGapCount = domainFindings.filter((finding) => finding.assessment === "not-verified").length;
  const candidateCount = domainFindings.filter((finding) => finding.assessment === "observed").length;
  const notApplicableCount = domainFindings.filter((finding) => finding.assessment === "not-applicable").length;
  const status = domainFindings.length > 0 && notApplicableCount === domainFindings.length
    ? "not-applicable"
    : warningCount > 0
      ? "needs-action"
      : evidenceGapCount > 0
        ? "evidence-gap"
        : candidateCount > 0
          ? "candidate-covered"
          : "not-verified";
  const score = domainScore({ status, findingCount: domainFindings.length, warnings: warningCount, evidenceGaps: evidenceGapCount, candidateSignals: candidateCount, notApplicable: notApplicableCount });
  return Object.freeze({
    domain: domain.id,
    label: domain.label || DOMAIN_LABELS[domain.id] || domain.id,
    status,
    maturityScore: score,
    maturityLevel: maturityLevel(score, status),
    candidateSignals: candidateCount,
    warnings: warningCount,
    evidenceGaps: evidenceGapCount,
    notApplicable: notApplicableCount,
    findingCount: domainFindings.length
  });
}

function domainScore({ status, findingCount, warnings, evidenceGaps, candidateSignals, notApplicable }) {
  if (status === "not-applicable") return null;
  const applicable = Math.max(1, findingCount - notApplicable);
  const coverage = Math.min(1, candidateSignals / applicable);
  let score = Math.round(35 + coverage * 45 - warnings * 25 - evidenceGaps * 10);
  if (status === "not-verified") score = Math.min(score, 30);
  if (status === "evidence-gap") score = Math.min(score, 60);
  if (status === "needs-action") score = Math.min(score, 45);
  if (status === "candidate-covered") score = Math.min(score, 75);
  return Math.max(0, Math.min(100, score));
}

function maturityLevel(score, status) {
  if (status === "not-applicable") return "not-applicable";
  if (!Number.isSafeInteger(score)) return "unknown";
  if (score >= 80) return "verified";
  if (score >= 60) return "candidate-covered";
  if (score >= 35) return "partial";
  return "at-risk";
}

function confirmedBottlenecks(findings) {
  return findings
    .filter((finding) => finding && (finding.severity === "warn" || (finding.passed === false && finding.assessment === "missing")))
    .map((finding) => bottleneckFromFinding(finding));
}

function domainEvidenceBottlenecks(capabilityMatrix, scope) {
  const requiredRuntimeGates = scope?.requiresRuntimeGates === true;
  const requiredExperience = Array.isArray(scope?.requiredExperienceScenarios) && scope.requiredExperienceScenarios.length > 0;
  return capabilityMatrix
    .filter((domain) => domain.status === "evidence-gap")
    .map((domain) => {
      const priority = domain.domain === "engineering-delivery" && requiredRuntimeGates
        ? "P1"
        : domain.domain === "visual-interaction" && requiredExperience
          ? "P1"
          : "P2";
      return Object.freeze({
        id: `${domain.domain}-verification-gap`,
        domain: domain.domain,
        priority,
        classification: "not-verified",
        confidence: "medium",
        signal: `${domain.evidenceGaps} evidence gap(s) remain in ${domain.label}`,
        impact: "The audit cannot distinguish real capability from static candidate presence for this domain.",
        recommendation: "Collect the missing runtime, journey, gate, or focused implementation evidence before treating the domain as healthy.",
        verification: "Re-run the selected audit scope with reviewed evidence or authorized gates and confirm the gap count is reduced."
      });
    });
}

function bottleneckFromFinding(finding) {
  const preset = BOTTLENECK_PRESETS[finding.id] || {};
  return Object.freeze({
    id: preset.id || finding.id,
    domain: preset.domain || FINDING_DOMAIN[finding.id] || "cross-cutting",
    priority: preset.priority || (finding.severity === "warn" ? "P1" : "P2"),
    classification: finding.assessment === "missing" ? "confirmed-issue" : finding.assessment,
    confidence: finding.severity === "warn" ? "high" : "medium",
    signal: finding.message,
    impact: preset.impact || "The current evidence indicates a capability or verification weakness in the selected audit scope.",
    recommendation: preset.recommendation || nextActionForFinding(finding.id),
    verification: preset.verification || "Add or inspect focused evidence, then re-run the same scoped audit to confirm the finding changes."
  });
}

const BOTTLENECK_PRESETS = Object.freeze({
  "possible-secrets": Object.freeze({
    id: "secret-handling-risk",
    domain: "data-security",
    priority: "P0",
    impact: "A committed credential-like assignment can create account, data, or supply-chain exposure.",
    recommendation: "Inspect the referenced assignment without exposing the value; remove or rotate any real secret and add a secret-scan regression.",
    verification: "Confirm the report contains no possible-secret evidence and the secret value is absent from source and generated reports."
  }),
  "runtime-gates": Object.freeze({
    id: "delivery-gate-failure",
    domain: "engineering-delivery",
    priority: "P1",
    impact: "The project cannot prove its declared checks, tests, build, or delivery gates under the selected audit level.",
    recommendation: "Run and fix the declared gates, or make missing required gates explicit in CI before release decisions.",
    verification: "Authorized gate execution reports at least one configured gate and every executed required gate passes."
  }),
  "experience-review": Object.freeze({
    id: "experience-evidence-failure",
    domain: "visual-interaction",
    priority: "P1",
    impact: "The primary journey, responsive behavior, keyboard path, or recovery flow is not proven by reviewed evidence.",
    recommendation: "Capture and review the required scenarios, reject unsuitable artifacts, and keep failed scenarios as actionable UX findings.",
    verification: "The reviewed experience manifest covers the required scenario IDs with inspected passed evidence."
  }),
  "automated-tests": Object.freeze({
    id: "missing-regression-safety-net",
    domain: "engineering-delivery",
    priority: "P1",
    impact: "Core behavior changes can regress without a repeatable safety net.",
    recommendation: "Add focused unit, integration, or browser tests for critical paths and wire them into the unified CI entrypoint.",
    verification: "The audit detects test files, CI invokes the relevant test script, and an authorized gate run records passing status."
  }),
  "declared-quality-gates": Object.freeze({
    id: "missing-quality-gate-entrypoints",
    domain: "engineering-delivery",
    priority: "P1",
    impact: "Developers, CI, and release automation lack stable commands for repeatable verification.",
    recommendation: "Declare package scripts for check, lint, typecheck, test, and build, or document why an entrypoint is intentionally not applicable.",
    verification: "The audit detects all expected quality gate scripts and an authorized gate run records their actual status."
  }),
  "ci-workflows": Object.freeze({
    id: "missing-ci-entrypoint",
    domain: "engineering-delivery",
    priority: "P1",
    impact: "Local success is not enough to protect collaborative changes or release decisions.",
    recommendation: "Add a CI workflow that runs the declared lint, type, test, build, and security gates appropriate to the project.",
    verification: "The audit detects workflow evidence and a current CI run proves the configured gates."
  }),
  "ci-gate-coverage-evidence": Object.freeze({
    id: "ci-gates-not-wired",
    domain: "engineering-delivery",
    priority: "P1",
    impact: "Declared local gates can drift from CI, so pull requests may merge without running the checks maintainers expect.",
    recommendation: "Wire every declared check, lint, typecheck, test, and build script into the CI workflow or document why a gate is intentionally out of scope.",
    verification: "The audit detects workflow invocations for every declared gate script and a current CI run proves they execute on the target branch."
  }),
  "dependency-lock": Object.freeze({
    id: "non-reproducible-dependencies",
    domain: "engineering-delivery",
    priority: "P2",
    impact: "Dependency resolution can drift between machines and CI runs.",
    recommendation: "Commit a supported lockfile and ensure CI installs from the lockfile.",
    verification: "A supported lockfile is present and the CI install command enforces locked dependency resolution."
  }),
  "release-safety-evidence": Object.freeze({
    id: "release-safety-gap",
    domain: "engineering-delivery",
    priority: "P1",
    impact: "A deployment path without visible health, rollback, and artifact controls makes release failure detection and recovery ambiguous.",
    recommendation: "Add or verify release safety controls covering post-deploy health or smoke checks, rollback or recovery, and artifact version or provenance.",
    verification: "The audit detects evidence for health/smoke, rollback/recovery, and artifact/provenance controls, then a reviewer confirms the controls are current and exercised."
  }),
  "product-entrypoints": Object.freeze({
    id: "unclear-product-entrypoint",
    domain: "product-journey",
    priority: "P1",
    impact: "Reviewers and users cannot reliably identify or exercise the primary product surface.",
    recommendation: "Document and expose the primary entrypoint, setup path, and success condition for the project profile.",
    verification: "The audit detects entrypoint evidence and a reviewed journey proves the primary path starts from it."
  }),
  "product-flow-evidence": Object.freeze({
    id: "missing-product-flow",
    domain: "product-journey",
    priority: "P2",
    impact: "The audit cannot connect implementation signals to a user goal or acceptance path.",
    recommendation: "Add a concise user journey or acceptance flow that names the target user, goal, states, and success condition.",
    verification: "The report links product-flow evidence to the selected scope and core-flow evidence."
  }),
  "repository-governance-evidence": Object.freeze({
    id: "missing-repository-governance",
    domain: "engineering-delivery",
    priority: "P2",
    impact: "GitHub collaboration, dependency update, ownership, security reporting, and release note practices are not visible from the repository surface.",
    recommendation: "Add or review CODEOWNERS, Dependabot, SECURITY, issue or PR templates, and changelog/release-note evidence that matches the project risk.",
    verification: "The audit detects repository governance evidence and a reviewer confirms each file is current and enforced where needed."
  })
});

function recommendationsForBottlenecks(bottlenecks, findings) {
  const recommendations = bottlenecks.map((bottleneck) => Object.freeze({
    id: `${bottleneck.id}-recommendation`,
    priority: bottleneck.priority,
    domain: bottleneck.domain,
    action: bottleneck.recommendation,
    acceptance: bottleneck.verification,
    expectedImpact: bottleneck.impact,
    effort: effortForPriority(bottleneck.priority)
  }));
  if (!recommendations.length && findings.some((finding) => finding.assessment === "not-verified")) {
    return [Object.freeze({
      id: "close-evidence-gaps-recommendation",
      priority: "P2",
      domain: "cross-cutting",
      action: "Close the remaining not-verified evidence gaps before using this audit as a production readiness decision.",
      acceptance: "The next report has reviewed evidence or an explicit not-applicable rationale for each previously not-verified item.",
      expectedImpact: "Raises confidence from static inventory to decision-grade audit evidence.",
      effort: "medium"
    })];
  }
  return recommendations;
}

function acceptanceChecks({ capabilityMatrix, bottlenecks, recommendations, scope }) {
  const checks = [];
  for (const item of bottlenecks.slice(0, 8)) checks.push(Object.freeze({
    id: `${item.id}-acceptance`,
    priority: item.priority,
    domain: item.domain,
    requirement: item.recommendation,
    evidence: item.verification,
    status: "open"
  }));
  for (const domain of capabilityMatrix) {
    if (domain.status === "not-applicable" || checks.some((check) => check.domain === domain.domain)) continue;
    if (domain.maturityLevel !== "candidate-covered" && domain.maturityLevel !== "verified") checks.push(Object.freeze({
      id: `${domain.domain}-maturity-acceptance`,
      priority: domain.maturityLevel === "at-risk" ? "P1" : "P2",
      domain: domain.domain,
      requirement: `Raise ${domain.label} from ${domain.maturityLevel} to candidate-covered or verified for the selected audit scope.`,
      evidence: "Provide reviewed implementation, runtime, gate, or journey evidence matching the selected audit level.",
      status: "open"
    }));
  }
  if (!checks.length && recommendations.length === 0 && scope?.requiresRuntimeGates === true) checks.push(Object.freeze({
    id: "runtime-gate-confirmation-acceptance",
    priority: "P2",
    domain: "engineering-delivery",
    requirement: "Keep runtime gate evidence current for release decisions.",
    evidence: "Run authorized gates and archive the report artifacts for the same revision.",
    status: "open"
  }));
  return checks.slice(0, 10);
}

function effortForPriority(priority) {
  if (priority === "P0") return "low-to-medium";
  if (priority === "P1") return "medium";
  return "low";
}

function prioritizeBottlenecks(values) {
  return values
    .filter(Boolean)
    .sort((left, right) => (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9) || left.id.localeCompare(right.id));
}

function overallConfidence({ scope, findings, gates, experience }) {
  const hasUnverified = findings.some((finding) => finding.assessment === "not-verified");
  const hasWarnings = findings.some((finding) => finding.severity === "warn");
  const needsGates = scope?.requiresRuntimeGates === true && Array.isArray(scope?.auditDomains) && scope.auditDomains.includes("engineering-delivery");
  const gatesClosed = !needsGates || gates?.requested === true;
  const needsExperience = Array.isArray(scope?.requiredExperienceScenarios) && scope.requiredExperienceScenarios.length > 0 && Array.isArray(scope?.auditDomains) && scope.auditDomains.includes("visual-interaction");
  const experienceClosed = !needsExperience || (experience && Array.isArray(experience.scenarios) && experience.scenarios.some((scenario) => scenario.status === "passed"));
  if (hasWarnings) return "high-for-issues-low-for-health";
  if (hasUnverified || !gatesClosed || !experienceClosed) return "medium-for-gaps-low-for-health";
  return "medium-for-static-signals";
}

function evidenceBoundary({ scope, gates, experience }) {
  return Object.freeze({
    staticAnalysis: scope?.staticAnalysis || "unknown",
    runtimeGates: gates?.requested === true ? "executed" : "not-executed",
    experienceEvidence: experience && Array.isArray(experience.scenarios) && experience.scenarios.length > 0 ? "manifest-supplied" : "not-supplied",
    healthClaimLimit: "candidate evidence and generated diagnostics do not prove production health without reviewed runtime, gate, journey, and security evidence"
  });
}

function nextActionForFinding(id) {
  const actions = {
    "runtime-gates": "Run the declared check, lint, typecheck, test, and build gates only with explicit authorization.",
    "declared-quality-gates": "Declare stable check, lint, typecheck, test, and build scripts before treating local or CI verification as complete.",
    "ci-gate-coverage-evidence": "Wire every declared local quality gate into CI and verify the workflow runs on the target branch.",
    "experience-review": "Capture and inspect the primary journey, responsive, keyboard, accessibility, console, and network scenarios.",
    "visual-interaction-evidence": "Exercise the primary flow in a browser and inspect stable screenshots plus interaction states.",
    "responsive-evidence": "Verify narrow, wide, zoomed, and reflowed layouts with captured evidence.",
    "accessibility-evidence": "Verify keyboard order, visible focus, labels, contrast, state announcements, and assistive-technology behavior.",
    "release-governance-evidence": "Provide and inspect release, health-check, rollback, artifact, and recovery evidence.",
    "release-safety-evidence": "Close the release safety loop with health or smoke checks, rollback or recovery controls, and artifact provenance evidence."
  };
  return actions[id] || "Inspect the referenced candidate evidence, confirm the boundary is complete, and add a focused verification or regression test.";
}

module.exports = { createAuditDiagnostics };
