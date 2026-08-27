"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLegacyLayerComponentSeed,
  buildComponentSearchPlan,
  scoreCandidateDocument,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-candidate-planner");

test("component planner seeds legacy circular arrow layers as cycle-loop before hub-spoke", () => {
  const seed = buildLegacyLayerComponentSeed({
    layerType: "diagram-zone",
    detector: "plugin-circular-arc-arrow-component"
  }, {
    source: {
      detector: "islide-cycle-arrow-download",
      reason: "循环箭头组件"
    }
  }, {
    textBoxes: [{ text: "四项闭环流程" }]
  });

  assert.equal(seed.archetype, "cycle-loop");
  assert.equal(seed.componentStrategy.templateFamily, "cycle-loop");
  assert.equal(seed.componentStrategy.mode, "component-template");
});

test("component planner classifies semantic double-loop diagrams as cycle-loop before generic diagram fallback", () => {
  const family = _private.normalizeTemplateFamily("generic", "unclassified-diagram", {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "DOM 语义 精准克隆" },
      { text: "所见即所得的交互原型" }
    ]
  });

  assert.equal(family, "cycle-loop");
});

test("component planner searches precise loop keywords for semantic cycle diagrams", () => {
  const plan = buildComponentSearchPlan({
    archetype: "unclassified-diagram",
    componentStrategy: {
      mode: "component-template",
      templateFamily: "generic",
      sourcePreference: ["officeplus-search", "islide-search"]
    },
    nodes: [
      { text: "结构化标准文档" },
      { text: "DOM 语义精准克隆" },
      { text: "交互原型" }
    ]
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "痛点" },
      { text: "解决方案" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "cycle-loop");
  assert.deepEqual(
    plan.queries.map((query) => `${query.provider}:${query.kind}`),
    [
      "officeplus:component",
      "officeplus:shape",
      "officeplus:vector",
      "islide:diagram",
      "islide:smartdiagram",
      "islide:vector"
    ]
  );
  assert.ok(plan.queries.some((query) => query.keywords === "闭环流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "循环流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "环形箭头"));
  assert.ok(plan.queries.some((query) => query.keywords === "双环流程"));
});

test("component planner searches segment-counted arc-arrow loop components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "cycle-loop",
    structureSignature: {
      layout: "cycle-loop",
      stepCount: 5,
      direction: "circular",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["arc-arrow", "whole-process-template"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "cycle-loop",
      targetMotifs: ["arc-arrow", "whole-process-template"],
      structureSignature: {
        layout: "cycle-loop",
        stepCount: 5,
        direction: "circular",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "cycle-loop");
  assert.equal(plan.structureSignature.layout, "cycle-loop");
  assert.ok(plan.queries.some((query) => query.keywords === "圆弧箭头"));
  assert.ok(plan.queries.some((query) => query.keywords === "闭环组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "环形箭头组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "5段圆弧箭头"));
  assert.ok(plan.queries.some((query) => query.keywords === "五段圆弧箭头"));
});

test("component planner searches milestone-counted timeline roadmap components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "timeline-roadmap",
    structureSignature: {
      layout: "timeline",
      stepCount: 4,
      rows: 1,
      columns: 4,
      direction: "left-to-right-milestones",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["milestone-roadmap", "linear-arrow-chain", "whole-process-template"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "timeline",
      targetMotifs: ["milestone-roadmap", "linear-arrow-chain", "whole-process-template"],
      structureSignature: {
        layout: "timeline",
        stepCount: 4,
        rows: 1,
        columns: 4,
        direction: "left-to-right-milestones",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "timeline");
  assert.equal(plan.structureSignature.layout, "timeline");
  assert.ok(plan.queries.some((query) => query.keywords === "时间轴"));
  assert.ok(plan.queries.some((query) => query.keywords === "里程碑"));
  assert.ok(plan.queries.some((query) => query.keywords === "路线图"));
  assert.ok(plan.queries.some((query) => query.keywords === "4里程碑时间轴"));
  assert.ok(plan.queries.some((query) => query.keywords === "四阶段路线图"));
});

test("component planner scores exact timeline milestone-count matches above nearby roadmaps", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "timeline-roadmap",
    structureSignature: {
      layout: "timeline",
      stepCount: 4
    },
    targetMotifs: ["milestone-roadmap"],
    componentStrategy: {
      templateFamily: "timeline",
      targetMotifs: ["milestone-roadmap"],
      structureSignature: {
        layout: "timeline",
        stepCount: 4
      }
    }
  };
  const four = scoreCandidateDocument({
    id: "four",
    title: "四阶段路线图 里程碑时间轴组件",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const six = scoreCandidateDocument({
    id: "six",
    title: "6里程碑路线图",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(four.candidateScore > six.candidateScore);
  assert.equal(_private.itemCountFromText("四阶段路线图"), 4);
  assert.equal(_private.itemCountFromText("6里程碑路线图"), 6);
});

test("component planner scores exact cycle segment-count matches above nearby loops", () => {
  const query = { provider: "islide", kind: "smartdiagram" };
  const understanding = {
    archetype: "cycle-loop",
    structureSignature: {
      layout: "cycle-loop",
      stepCount: 5
    },
    targetMotifs: ["arc-arrow", "whole-process-template"],
    componentStrategy: {
      templateFamily: "cycle-loop",
      targetMotifs: ["arc-arrow", "whole-process-template"],
      structureSignature: {
        layout: "cycle-loop",
        stepCount: 5
      }
    }
  };
  const five = scoreCandidateDocument({
    id: "five",
    title: "五段圆弧箭头闭环组件",
    reuseHint: "candidate-polished-diagram-reference"
  }, understanding, query);
  const six = scoreCandidateDocument({
    id: "six",
    title: "6段循环箭头流程",
    reuseHint: "candidate-polished-diagram-reference"
  }, understanding, query);

  assert.ok(five.candidateScore > six.candidateScore);
  assert.equal(_private.itemCountFromText("五段圆弧箭头闭环组件"), 5);
  assert.equal(_private.itemCountFromText("6段循环箭头流程"), 6);
});

test("component planner maps target motifs into precise plugin search keywords", () => {
  const plan = buildComponentSearchPlan({
    archetype: "tree-structure",
    targetMotifs: ["tree-link"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "hub-spoke",
      targetMotifs: ["tree-link"],
      sourcePreference: ["officeplus-search", "islide-search"]
    }
  }, {
    layerType: "diagram-zone",
    size: 4
  });

  assert.deepEqual(plan.targetMotifs, ["tree-link"]);
  assert.ok(plan.queries.some((query) => query.keywords === "树状层级"));
  assert.ok(plan.queries.some((query) => query.keywords === "组织结构图"));
});

test("component planner searches node-counted hierarchy tree components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "tree-structure",
    structureSignature: {
      layout: "tree",
      stepCount: 4,
      rows: 2,
      direction: "top-down-branching",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["tree-link", "org-hierarchy"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "hierarchy-tree",
      targetMotifs: ["tree-link", "org-hierarchy"],
      structureSignature: {
        layout: "tree",
        stepCount: 4,
        rows: 2,
        direction: "top-down-branching",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "hierarchy-tree");
  assert.equal(plan.structureSignature.layout, "tree");
  assert.deepEqual(plan.targetMotifs, ["tree-link", "org-hierarchy"]);
  assert.ok(plan.queries.some((query) => query.keywords === "分支层级组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "组织架构组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "层级结构组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "部门架构图"));
  assert.ok(plan.queries.some((query) => query.keywords === "汇报关系图"));
  assert.ok(plan.queries.some((query) => query.keywords === "4节点树状图"));
  assert.ok(plan.queries.some((query) => query.keywords === "4节点组织架构"));
  assert.ok(plan.queries.some((query) => query.keywords === "四节点组织结构图"));
  assert.ok(plan.queries.some((query) => query.keywords === "四人组织架构"));
  assert.ok(plan.queries.some((query) => query.keywords === "2层组织结构图"));
  assert.ok(plan.queries.some((query) => query.keywords === "二层层级结构"));
  assert.ok(plan.queries.some((query) => query.keywords === "二层组织架构"));
  assert.ok(plan.queries.some((query) => query.keywords === "二层层级关系图"));
});

test("component planner searches row-column matrix card components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "matrix-or-grid",
    structureSignature: {
      layout: "grid",
      stepCount: 6,
      rows: 2,
      columns: 3,
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["card-grid"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "grid-or-matrix",
      targetMotifs: ["card-grid"],
      structureSignature: {
        layout: "grid",
        stepCount: 6,
        rows: 2,
        columns: 3,
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "grid-or-matrix");
  assert.equal(plan.structureSignature.layout, "grid");
  assert.deepEqual(plan.targetMotifs, ["card-grid"]);
  assert.ok(plan.queries.some((query) => query.keywords === "2行3列矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "2行3列卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "2x3 matrix"));
  assert.ok(plan.queries.some((query) => query.keywords === "三列卡片矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "6宫格卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "六宫格卡片"));
});

test("component planner searches dashboard KPI card grid components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "dashboard-card-grid",
    structureSignature: {
      layout: "dashboard-card-grid",
      stepCount: 6,
      rows: 2,
      columns: 3,
      direction: "metric-card-grid",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["dashboard-card-grid", "card-grid"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "grid-or-matrix",
      targetMotifs: ["dashboard-card-grid", "card-grid"],
      structureSignature: {
        layout: "dashboard-card-grid",
        stepCount: 6,
        rows: 2,
        columns: 3,
        direction: "metric-card-grid",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "收入" },
      { text: "转化率" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "grid-or-matrix");
  assert.deepEqual(plan.targetMotifs, ["dashboard-card-grid", "card-grid"]);
  assert.equal(plan.structureSignature.layout, "dashboard-card-grid");
  assert.ok(plan.queries.some((query) => query.keywords === "数据看板组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "KPI卡片组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "2行3列数据看板"));
  assert.ok(plan.queries.some((query) => query.keywords === "6项KPI看板"));
  assert.ok(plan.queries.some((query) => query.keywords === "dashboard cards"));
});

test("component planner searches screenshot card grid and UI showcase components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "screenshot-card-grid",
    structureSignature: {
      layout: "screenshot-card-grid",
      stepCount: 4,
      rows: 2,
      columns: 2,
      direction: "screenshot-gallery-grid",
      wholeGroupTemplatePriority: "medium",
      regularSpacing: true
    },
    targetMotifs: ["screenshot-card-grid", "screenshot-crop", "card-grid"],
    componentStrategy: {
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-card-grid",
      targetMotifs: ["screenshot-card-grid", "screenshot-crop", "card-grid"],
      structureSignature: {
        layout: "screenshot-card-grid",
        stepCount: 4,
        rows: 2,
        columns: 2,
        direction: "screenshot-gallery-grid",
        wholeGroupTemplatePriority: "medium",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "门户首页" },
      { text: "流程配置" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "screenshot-card-grid");
  assert.deepEqual(plan.targetMotifs, ["screenshot-card-grid", "screenshot-crop", "card-grid"]);
  assert.equal(plan.structureSignature.layout, "screenshot-card-grid");
  assert.ok(plan.queries.some((query) => query.keywords === "产品截图展示"));
  assert.ok(plan.queries.some((query) => query.keywords === "截图卡片组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "2行2列截图卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "四个产品截图"));
  assert.ok(plan.queries.some((query) => query.keywords === "mockup cards"));
  assert.ok(plan.queries.some((query) => query.keywords === "screen gallery"));
});

test("component planner searches visual example card grid components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "visual-example-card-grid",
    structureSignature: {
      layout: "visual-example-card-grid",
      stepCount: 2,
      rows: 1,
      columns: 2,
      direction: "pictorial-example-card-grid",
      wholeGroupTemplatePriority: "medium",
      regularSpacing: true
    },
    targetMotifs: ["visual-example-card-grid", "visual-example-crop", "card-grid"],
    componentStrategy: {
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "visual-example-card-grid",
      targetMotifs: ["visual-example-card-grid", "visual-example-crop", "card-grid"],
      structureSignature: {
        layout: "visual-example-card-grid",
        stepCount: 2,
        rows: 1,
        columns: 2,
        direction: "pictorial-example-card-grid",
        wholeGroupTemplatePriority: "medium",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "循环箭头" },
      { text: "流程图示" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "visual-example-card-grid");
  assert.deepEqual(plan.targetMotifs, ["visual-example-card-grid", "visual-example-crop", "card-grid"]);
  assert.equal(plan.structureSignature.layout, "visual-example-card-grid");
  assert.ok(plan.queries.some((query) => query.keywords === "图示样例卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "组件预览卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "1行2列图示样例"));
  assert.ok(plan.queries.some((query) => query.keywords === "2个图示样例"));
  assert.ok(plan.queries.some((query) => query.keywords === "diagram sample cards"));
  assert.ok(plan.queries.some((query) => query.keywords === "component preview cards"));
});

test("component planner searches feature icon card grid components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "feature-icon-card-grid",
    structureSignature: {
      layout: "feature-icon-card-grid",
      stepCount: 6,
      rows: 2,
      columns: 3,
      direction: "icon-card-grid",
      wholeGroupTemplatePriority: "medium",
      regularSpacing: true
    },
    targetMotifs: ["feature-icon-card-grid", "icon-crop", "card-grid"],
    componentStrategy: {
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "feature-icon-card-grid",
      targetMotifs: ["feature-icon-card-grid", "icon-crop", "card-grid"],
      structureSignature: {
        layout: "feature-icon-card-grid",
        stepCount: 6,
        rows: 2,
        columns: 3,
        direction: "icon-card-grid",
        wholeGroupTemplatePriority: "medium",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "智能识别" },
      { text: "自动重建" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "feature-icon-card-grid");
  assert.deepEqual(plan.targetMotifs, ["feature-icon-card-grid", "icon-crop", "card-grid"]);
  assert.equal(plan.structureSignature.layout, "feature-icon-card-grid");
  assert.ok(plan.queries.some((query) => query.kind === "icon"));
  assert.ok(plan.queries.some((query) => query.keywords === "功能卡片组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "图标卡片组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "2行3列功能卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "三列图标卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "6个图标卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "feature cards"));
});

test("component planner searches numbered step card grid components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "numbered-step-card-grid",
    structureSignature: {
      layout: "numbered-step-card-grid",
      stepCount: 3,
      rows: 1,
      columns: 3,
      direction: "horizontal-numbered-steps",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["numbered-step-card-grid", "step-badge", "card-grid", "linear-arrow-chain"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "numbered-step-card-grid",
      targetMotifs: ["numbered-step-card-grid", "step-badge", "card-grid", "linear-arrow-chain"],
      structureSignature: {
        layout: "numbered-step-card-grid",
        stepCount: 3,
        rows: 1,
        columns: 3,
        direction: "horizontal-numbered-steps",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "识别" },
      { text: "匹配" },
      { text: "重建" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "numbered-step-card-grid");
  assert.deepEqual(plan.targetMotifs, ["numbered-step-card-grid", "step-badge", "card-grid", "linear-arrow-chain"]);
  assert.equal(plan.structureSignature.layout, "numbered-step-card-grid");
  assert.ok(plan.queries.some((query) => query.keywords === "步骤卡片组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "编号流程组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "1行3列步骤卡片"));
  assert.ok(plan.queries.some((query) => query.keywords === "3步编号流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "numbered process cards"));
  assert.ok(plan.queries.some((query) => query.keywords === "step badge"));
});

test("component planner searches comparison matrix components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "comparison-matrix",
    structureSignature: {
      layout: "comparison-matrix",
      stepCount: 9,
      rows: 3,
      columns: 3,
      direction: "column-comparison",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["comparison-matrix", "card-grid"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "grid-or-matrix",
      targetMotifs: ["comparison-matrix", "card-grid"],
      structureSignature: {
        layout: "comparison-matrix",
        stepCount: 9,
        rows: 3,
        columns: 3,
        direction: "column-comparison",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "方案A" },
      { text: "方案B" },
      { text: "竞品对比" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "grid-or-matrix");
  assert.deepEqual(plan.targetMotifs, ["comparison-matrix", "card-grid"]);
  assert.equal(plan.structureSignature.layout, "comparison-matrix");
  assert.ok(plan.queries.some((query) => query.keywords === "对比矩阵组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "竞品对比表"));
  assert.ok(plan.queries.some((query) => query.keywords === "3行3列对比矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "三列方案对比"));
  assert.ok(plan.queries.some((query) => query.keywords === "comparison table"));
});

test("component planner searches heatmap matrix components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "heatmap-matrix",
    structureSignature: {
      layout: "heatmap-matrix",
      stepCount: 16,
      rows: 4,
      columns: 4,
      direction: "color-scale-grid",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["heatmap-matrix", "card-grid"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "grid-or-matrix",
      targetMotifs: ["heatmap-matrix", "card-grid"],
      structureSignature: {
        layout: "heatmap-matrix",
        stepCount: 16,
        rows: 4,
        columns: 4,
        direction: "color-scale-grid",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "风险矩阵" },
      { text: "影响程度" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "grid-or-matrix");
  assert.deepEqual(plan.targetMotifs, ["heatmap-matrix", "card-grid"]);
  assert.equal(plan.structureSignature.layout, "heatmap-matrix");
  assert.ok(plan.queries.some((query) => query.keywords === "热力图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "风险矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "色阶矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "4行4列热力图"));
  assert.ok(plan.queries.some((query) => query.keywords === "16格风险矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "heatmap template"));
});

test("component planner searches treemap area composition components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "treemap-chart",
    structureSignature: {
      layout: "treemap",
      stepCount: 5,
      rows: 2,
      columns: 3,
      direction: "proportional-area-tiles",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["treemap-chart"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "treemap-chart",
      targetMotifs: ["treemap-chart"],
      structureSignature: {
        layout: "treemap",
        stepCount: 5,
        rows: 2,
        columns: 3,
        direction: "proportional-area-tiles",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "市场份额" },
      { text: "构成占比" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "treemap-chart");
  assert.deepEqual(plan.targetMotifs, ["treemap-chart"]);
  assert.equal(plan.structureSignature.layout, "treemap");
  assert.ok(plan.queries.some((query) => query.keywords === "矩形树图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "面积占比图"));
  assert.ok(plan.queries.some((query) => query.keywords === "构成分布图"));
  assert.ok(plan.queries.some((query) => query.keywords === "5块矩形树图"));
  assert.ok(plan.queries.some((query) => query.keywords === "五项构成分布"));
  assert.ok(plan.queries.some((query) => query.keywords === "treemap template"));
});

test("component planner searches sankey flow components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "sankey-flow-chart",
    structureSignature: {
      layout: "sankey-flow",
      stepCount: 5,
      rows: 2,
      columns: 3,
      direction: "weighted-source-to-target-flow",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["sankey-flow-chart"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "sankey-flow-chart",
      targetMotifs: ["sankey-flow-chart"],
      structureSignature: {
        layout: "sankey-flow",
        stepCount: 5,
        rows: 2,
        columns: 3,
        direction: "weighted-source-to-target-flow",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "用户流转" },
      { text: "流量分布" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "sankey-flow-chart");
  assert.deepEqual(plan.targetMotifs, ["sankey-flow-chart"]);
  assert.equal(plan.structureSignature.layout, "sankey-flow");
  assert.ok(plan.queries.some((query) => query.keywords === "桑基图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "流向图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "5节点桑基图"));
  assert.ok(plan.queries.some((query) => query.keywords === "三列流向图"));
  assert.ok(plan.queries.some((query) => query.keywords === "sankey diagram"));
});

test("component planner searches axis-aware quadrant matrix components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "quadrant-matrix",
    structureSignature: {
      layout: "quadrant",
      stepCount: 4,
      rows: 2,
      columns: 2,
      direction: "two-axis-positioning",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["quadrant-axis", "card-grid"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "quadrant-matrix",
      targetMotifs: ["quadrant-axis", "card-grid"],
      structureSignature: {
        layout: "quadrant",
        stepCount: 4,
        rows: 2,
        columns: 2,
        direction: "two-axis-positioning",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "高影响" },
      { text: "低成本" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "quadrant-matrix");
  assert.equal(plan.structureSignature.layout, "quadrant");
  assert.ok(plan.queries.some((query) => query.keywords === "四象限"));
  assert.ok(plan.queries.some((query) => query.keywords === "优先级矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "影响成本矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "2x2 quadrant"));
  assert.ok(plan.queries.some((query) => query.keywords === "四象限分析图"));
});

test("component planner searches convergence lens funnel components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "funnel-lens-flow",
    structureSignature: {
      layout: "funnel-lens-flow",
      stepCount: 4,
      rows: 1,
      columns: 4,
      direction: "converge-focus-output",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["lens-funnel-flow", "branch-card-flow"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "funnel-lens-flow",
      targetMotifs: ["lens-funnel-flow", "branch-card-flow"],
      structureSignature: {
        layout: "funnel-lens-flow",
        stepCount: 4,
        rows: 1,
        columns: 4,
        direction: "converge-focus-output",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "需求分析" },
      { text: "聚焦分析" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "funnel-lens-flow");
  assert.equal(plan.structureSignature.layout, "funnel-lens-flow");
  assert.ok(plan.queries.some((query) => query.keywords === "放大镜流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "漏斗流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "收敛流程组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "4步需求分析"));
  assert.ok(plan.queries.some((query) => query.keywords === "四节点放大镜流程"));
});

test("component planner searches lane-based swimlane flow components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "swimlane-flow",
    structureSignature: {
      layout: "swimlane",
      stepCount: 6,
      rows: 3,
      columns: 2,
      direction: "left-to-right-by-lane",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["linear-arrow-chain", "whole-process-template"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "swimlane-flow",
      targetMotifs: ["linear-arrow-chain", "whole-process-template"],
      structureSignature: {
        layout: "swimlane",
        stepCount: 6,
        rows: 3,
        columns: 2,
        direction: "left-to-right-by-lane",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "产品" },
      { text: "研发" },
      { text: "运营" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "swimlane-flow");
  assert.equal(plan.structureSignature.layout, "swimlane");
  assert.ok(plan.queries.some((query) => query.provider === "officeplus" && query.keywords === "泳道流程"));
  assert.ok(plan.queries.some((query) => query.provider === "officeplus" && query.keywords === "跨部门流程"));
  assert.ok(plan.queries.some((query) => query.provider === "islide" && query.keywords === "泳道图"));
  assert.ok(plan.queries.some((query) => query.provider === "islide" && query.keywords === "3泳道流程"));
  assert.ok(plan.queries.some((query) => query.provider === "islide" && query.keywords === "六步泳道流程"));
});

test("component planner searches topology triangle relationship components", () => {
  const family = _private.normalizeTemplateFamily("generic", "topology-diagram", {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "铁三角关系" },
      { text: "闭环拓扑" }
    ]
  });
  const plan = buildComponentSearchPlan({
    archetype: "topology-diagram",
    structureSignature: {
      layout: "topology",
      stepCount: 3,
      rows: 1,
      columns: 3,
      direction: "triangular-closed-loop",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["topology-triangle"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "topology-diagram",
      targetMotifs: ["topology-triangle"],
      structureSignature: {
        layout: "topology",
        stepCount: 3,
        rows: 1,
        columns: 3,
        direction: "triangular-closed-loop",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "业务" },
      { text: "技术" },
      { text: "数据" }
    ],
    size: 6
  });

  assert.equal(family, "topology-diagram");
  assert.equal(plan.templateFamily, "topology-diagram");
  assert.equal(plan.structureSignature.layout, "topology");
  assert.deepEqual(plan.targetMotifs, ["topology-triangle"]);
  assert.ok(plan.queries.some((query) => query.provider === "islide" && query.keywords === "拓扑关系图"));
  assert.ok(plan.queries.some((query) => query.provider === "officeplus" && query.keywords === "铁三角关系"));
  assert.ok(plan.queries.some((query) => query.provider === "officeplus" && query.keywords === "三角关系图"));
  assert.ok(plan.queries.some((query) => query.keywords === "3节点拓扑图"));
  assert.ok(plan.queries.some((query) => query.keywords === "三元关系图"));
});

test("component planner searches fishbone cause-effect components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "fishbone-cause-effect",
    structureSignature: {
      layout: "fishbone",
      stepCount: 6,
      rows: 2,
      columns: 3,
      direction: "spine-with-diagonal-causes",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["fishbone-cause"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "fishbone-cause-effect",
      targetMotifs: ["fishbone-cause"],
      structureSignature: {
        layout: "fishbone",
        stepCount: 6,
        rows: 2,
        columns: 3,
        direction: "spine-with-diagonal-causes",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "鱼骨图" },
      { text: "根因分析" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "fishbone-cause-effect");
  assert.equal(plan.structureSignature.layout, "fishbone");
  assert.ok(plan.queries.some((query) => query.keywords === "鱼骨图"));
  assert.ok(plan.queries.some((query) => query.keywords === "因果分析"));
  assert.ok(plan.queries.some((query) => query.keywords === "根因分析"));
  assert.ok(plan.queries.some((query) => query.keywords === "6M鱼骨图"));
  assert.ok(plan.queries.some((query) => query.keywords === "六分支鱼骨图"));
});

test("component planner maps fishbone semantics before generic tree fallback", () => {
  const family = _private.normalizeTemplateFamily("hub-spoke", "tree-structure", {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "因果分析" },
      { text: "鱼骨图 root cause" }
    ]
  });

  assert.equal(family, "fishbone-cause-effect");
});

test("component planner maps lens funnel semantics before generic process fallback", () => {
  const family = _private.normalizeTemplateFamily("process-chain", "flow-card-chain", {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "需求分析" },
      { text: "收敛流程 放大镜流程" }
    ]
  });

  assert.equal(family, "funnel-lens-flow");
});

test("component planner maps quadrant terms before generic grid fallback", () => {
  const family = _private.normalizeTemplateFamily("generic", "matrix-or-grid", {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "影响 成本" },
      { text: "四象限优先级矩阵" }
    ]
  });

  assert.equal(family, "quadrant-matrix");
});

test("component planner scores exact matrix cell-count matches above nearby grids", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "matrix-or-grid",
    structureSignature: {
      layout: "grid",
      stepCount: 6,
      rows: 2,
      columns: 3
    },
    targetMotifs: ["card-grid"],
    componentStrategy: {
      templateFamily: "grid-or-matrix",
      targetMotifs: ["card-grid"],
      structureSignature: {
        layout: "grid",
        stepCount: 6,
        rows: 2,
        columns: 3
      }
    }
  };
  const six = scoreCandidateDocument({
    id: "six",
    title: "2行3列矩阵卡片组件",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const eight = scoreCandidateDocument({
    id: "eight",
    title: "8宫格卡片矩阵组件",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const zhSix = scoreCandidateDocument({
    id: "zh-six",
    title: "六宫格卡片矩阵",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(six.candidateScore > eight.candidateScore);
  assert.ok(zhSix.candidateScore > eight.candidateScore);
  assert.equal(_private.itemCountFromText("2行3列矩阵卡片组件"), 6);
  assert.equal(_private.itemCountFromText("六宫格卡片矩阵"), 6);
  assert.equal(_private.itemCountFromText("8宫格卡片矩阵组件"), 8);
});

test("component planner searches chart templates with semantic chart structure", () => {
  const plan = buildComponentSearchPlan({
    archetype: "bar-chart",
    structureSignature: {
      layout: "bar-chart",
      stepCount: 5,
      direction: "vertical-bars",
      wholeGroupTemplatePriority: "high"
    },
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "bar-chart",
      structureSignature: {
        layout: "bar-chart",
        stepCount: 5,
        direction: "vertical-bars",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "chart-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "bar-chart");
  assert.equal(plan.structureSignature.layout, "bar-chart");
  assert.ok(plan.queries.some((query) => query.provider === "officeplus" && query.kind === "component"));
  assert.ok(plan.queries.some((query) => query.provider === "islide" && query.kind === "smartdiagram"));
  assert.ok(plan.queries.some((query) => query.keywords === "纵向柱状图"));
  assert.ok(plan.queries.some((query) => query.keywords === "5组柱状图"));
  assert.ok(plan.queries.some((query) => query.keywords === "五柱柱状图"));
  assert.ok(plan.queries.some((query) => query.keywords === "柱状图模板"));
});

test("component planner searches waterfall variance bridge chart templates", () => {
  const plan = buildComponentSearchPlan({
    archetype: "waterfall-chart",
    structureSignature: {
      layout: "waterfall-chart",
      stepCount: 6,
      rows: 1,
      columns: 6,
      direction: "cumulative-positive-negative-bridge",
      wholeGroupTemplatePriority: "high",
      regularSpacing: true
    },
    targetMotifs: ["waterfall-chart"],
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "waterfall-chart",
      targetMotifs: ["waterfall-chart"],
      structureSignature: {
        layout: "waterfall-chart",
        stepCount: 6,
        rows: 1,
        columns: 6,
        direction: "cumulative-positive-negative-bridge",
        wholeGroupTemplatePriority: "high",
        regularSpacing: true
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "收入增减分析" },
      { text: "variance bridge" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "waterfall-chart");
  assert.deepEqual(plan.targetMotifs, ["waterfall-chart"]);
  assert.equal(plan.structureSignature.layout, "waterfall-chart");
  assert.ok(plan.queries.some((query) => query.keywords === "瀑布图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "增减分析图"));
  assert.ok(plan.queries.some((query) => query.keywords === "6柱瀑布图"));
  assert.ok(plan.queries.some((query) => query.keywords === "六项差异桥图"));
  assert.ok(plan.queries.some((query) => query.keywords === "variance bridge"));
});

test("component planner searches map chart components instead of generic shapes", () => {
  const plan = buildComponentSearchPlan({
    archetype: "map-chart",
    structureSignature: {
      layout: "geo-map",
      stepCount: 1,
      rows: 1,
      columns: 1,
      direction: "geographic-region-composition",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["map-chart"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "map-chart",
      targetMotifs: ["map-chart"],
      structureSignature: {
        layout: "geo-map",
        stepCount: 1,
        rows: 1,
        columns: 1,
        direction: "geographic-region-composition",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "中国地图" },
      { text: "区域分布" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "map-chart");
  assert.deepEqual(plan.targetMotifs, ["map-chart"]);
  assert.equal(plan.structureSignature.layout, "geo-map");
  assert.ok(plan.queries.some((query) => query.keywords === "地图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "中国地图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "区域地图"));
  assert.ok(plan.queries.some((query) => query.keywords === "地图热力图"));
  assert.ok(plan.queries.some((query) => query.keywords === "choropleth map"));
  assert.ok(plan.queries.some((query) => query.keywords === "geo map template"));
});

test("component planner searches concentric onion diagram components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "concentric-circles",
    structureSignature: {
      layout: "concentric-circles",
      stepCount: 3,
      rows: 1,
      columns: 3,
      direction: "nested-layer-rings",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["concentric-circles", "ring-node"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "concentric-circles",
      targetMotifs: ["concentric-circles", "ring-node"],
      structureSignature: {
        layout: "concentric-circles",
        stepCount: 3,
        rows: 1,
        columns: 3,
        direction: "nested-layer-rings",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "diagram-zone",
    textBoxes: [
      { text: "圈层模型" },
      { text: "核心能力" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "concentric-circles");
  assert.deepEqual(plan.targetMotifs, ["concentric-circles", "ring-node"]);
  assert.equal(plan.structureSignature.layout, "concentric-circles");
  assert.ok(plan.queries.some((query) => query.keywords === "同心圆组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "洋葱图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "3层同心圆"));
  assert.ok(plan.queries.some((query) => query.keywords === "三层洋葱图"));
  assert.ok(plan.queries.some((query) => query.keywords === "concentric circles"));
  assert.ok(plan.queries.some((query) => query.keywords === "onion diagram"));
});

test("component planner searches annotated screenshot callout components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "screenshot-annotation",
    structureSignature: {
      layout: "screenshot-annotation",
      stepCount: 3,
      rows: 1,
      columns: 3,
      direction: "base-crop-with-editable-overlays",
      wholeGroupTemplatePriority: "medium",
      regularSpacing: false
    },
    targetMotifs: ["screenshot-annotation", "callout-overlay", "highlight-box"],
    componentStrategy: {
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-annotation",
      targetMotifs: ["screenshot-annotation", "callout-overlay", "highlight-box"],
      structureSignature: {
        layout: "screenshot-annotation",
        stepCount: 3,
        rows: 1,
        columns: 3,
        direction: "base-crop-with-editable-overlays",
        wholeGroupTemplatePriority: "medium",
        regularSpacing: false
      }
    }
  }, {
    layerType: "screenshot-zone",
    textBoxes: [
      { text: "点击此处" },
      { text: "重点功能" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "screenshot-annotation");
  assert.deepEqual(plan.targetMotifs, ["screenshot-annotation", "callout-overlay", "highlight-box"]);
  assert.equal(plan.structureSignature.layout, "screenshot-annotation");
  assert.ok(plan.queries.some((query) => query.keywords === "截图标注组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "说明气泡组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "高亮框组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "3处截图标注"));
  assert.ok(plan.queries.some((query) => query.keywords === "三处截图标注"));
  assert.ok(plan.queries.some((query) => query.keywords === "screenshot callout"));
});

test("component planner searches screenshot zoom callout and magnifier components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "screenshot-zoom-callout",
    structureSignature: {
      layout: "screenshot-zoom-callout",
      stepCount: 3,
      rows: 1,
      columns: 2,
      direction: "source-highlight-to-magnified-detail",
      wholeGroupTemplatePriority: "medium",
      regularSpacing: false
    },
    targetMotifs: ["screenshot-zoom-callout", "zoom-lens-overlay", "highlight-box"],
    componentStrategy: {
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-zoom-callout",
      targetMotifs: ["screenshot-zoom-callout", "zoom-lens-overlay", "highlight-box"],
      structureSignature: {
        layout: "screenshot-zoom-callout",
        stepCount: 3,
        rows: 1,
        columns: 2,
        direction: "source-highlight-to-magnified-detail",
        wholeGroupTemplatePriority: "medium",
        regularSpacing: false
      }
    }
  }, {
    layerType: "screenshot-zone",
    textBoxes: [
      { text: "局部放大" },
      { text: "关键字段" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "screenshot-zoom-callout");
  assert.deepEqual(plan.targetMotifs, ["screenshot-zoom-callout", "zoom-lens-overlay", "highlight-box"]);
  assert.equal(plan.structureSignature.layout, "screenshot-zoom-callout");
  assert.ok(plan.queries.some((query) => query.keywords === "局部放大组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "放大镜标注组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "3处局部放大"));
  assert.ok(plan.queries.some((query) => query.keywords === "三处局部放大"));
  assert.ok(plan.queries.some((query) => query.keywords === "zoom callout"));
  assert.ok(plan.queries.some((query) => query.keywords === "magnifier callout"));
});

test("component planner searches word cloud components instead of loose text layouts", () => {
  const plan = buildComponentSearchPlan({
    archetype: "word-cloud-chart",
    structureSignature: {
      layout: "word-cloud",
      stepCount: 1,
      rows: 1,
      columns: 1,
      direction: "weighted-keyword-size-cloud",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["word-cloud-chart"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "word-cloud-chart",
      targetMotifs: ["word-cloud-chart"],
      structureSignature: {
        layout: "word-cloud",
        stepCount: 1,
        rows: 1,
        columns: 1,
        direction: "weighted-keyword-size-cloud",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "关键词云" },
      { text: "热词分析" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "word-cloud-chart");
  assert.deepEqual(plan.targetMotifs, ["word-cloud-chart"]);
  assert.equal(plan.structureSignature.layout, "word-cloud");
  assert.ok(plan.queries.some((query) => query.keywords === "词云组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "关键词云"));
  assert.ok(plan.queries.some((query) => query.keywords === "标签云"));
  assert.ok(plan.queries.some((query) => query.keywords === "word cloud template"));
  assert.ok(plan.queries.some((query) => query.keywords === "tag cloud"));
});

test("component planner searches gauge speedometer chart components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "gauge-chart",
    structureSignature: {
      layout: "gauge-chart",
      stepCount: 1,
      rows: 1,
      columns: 1,
      direction: "semi-circular-progress-dial",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["gauge-chart"],
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "gauge-chart",
      targetMotifs: ["gauge-chart"],
      structureSignature: {
        layout: "gauge-chart",
        stepCount: 1,
        rows: 1,
        columns: 1,
        direction: "semi-circular-progress-dial",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "评分仪表" },
      { text: "speedometer" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "gauge-chart");
  assert.deepEqual(plan.targetMotifs, ["gauge-chart"]);
  assert.equal(plan.structureSignature.layout, "gauge-chart");
  assert.ok(plan.queries.some((query) => query.keywords === "仪表图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "速度表组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "半圆仪表"));
  assert.ok(plan.queries.some((query) => query.keywords === "gauge chart template"));
  assert.ok(plan.queries.some((query) => query.keywords === "speedometer"));
});

test("component planner searches radar spider chart templates", () => {
  const plan = buildComponentSearchPlan({
    archetype: "radar-chart",
    structureSignature: {
      layout: "radar-chart",
      stepCount: 5,
      rows: 1,
      columns: 5,
      direction: "radial-multi-axis-score-polygon",
      wholeGroupTemplatePriority: "high",
      regularSpacing: false
    },
    targetMotifs: ["radar-chart"],
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "radar-chart",
      targetMotifs: ["radar-chart"],
      structureSignature: {
        layout: "radar-chart",
        stepCount: 5,
        rows: 1,
        columns: 5,
        direction: "radial-multi-axis-score-polygon",
        wholeGroupTemplatePriority: "high",
        regularSpacing: false
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "能力雷达" },
      { text: "维度评分" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "radar-chart");
  assert.deepEqual(plan.targetMotifs, ["radar-chart"]);
  assert.equal(plan.structureSignature.layout, "radar-chart");
  assert.ok(plan.queries.some((query) => query.keywords === "雷达图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "蛛网图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "5维雷达图"));
  assert.ok(plan.queries.some((query) => query.keywords === "五轴雷达图"));
  assert.ok(plan.queries.some((query) => query.keywords === "radar chart template"));
  assert.ok(plan.queries.some((query) => query.keywords === "spider chart"));
});

test("component planner searches bubble scatter chart components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "scatter-chart",
    structureSignature: {
      layout: "scatter-chart",
      stepCount: 8,
      rows: 1,
      columns: 8,
      direction: "xy-point-distribution",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["bubble-scatter-chart"],
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "scatter-chart",
      targetMotifs: ["bubble-scatter-chart"],
      structureSignature: {
        layout: "scatter-chart",
        stepCount: 8,
        rows: 1,
        columns: 8,
        direction: "xy-point-distribution",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "chart-zone",
    textBoxes: [
      { text: "产品组合分布" },
      { text: "市场定位" }
    ],
    size: 6
  });

  assert.equal(plan.templateFamily, "scatter-chart");
  assert.deepEqual(plan.targetMotifs, ["bubble-scatter-chart"]);
  assert.equal(plan.structureSignature.layout, "scatter-chart");
  assert.ok(plan.queries.some((query) => query.keywords === "气泡图组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "气泡矩阵组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "产品组合矩阵"));
  assert.ok(plan.queries.some((query) => query.keywords === "8气泡分布图"));
  assert.ok(plan.queries.some((query) => query.keywords === "bubble chart template"));
});

test("component planner scores exact chart mark-count matches above nearby charts", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "bar-chart",
    structureSignature: {
      layout: "bar-chart",
      stepCount: 5,
      direction: "vertical-bars"
    },
    componentStrategy: {
      templateFamily: "bar-chart",
      structureSignature: {
        layout: "bar-chart",
        stepCount: 5,
        direction: "vertical-bars"
      }
    }
  };
  const five = scoreCandidateDocument({
    id: "five",
    title: "五柱柱状图数据图表组件",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const six = scoreCandidateDocument({
    id: "six",
    title: "6组柱状图模板",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(five.candidateScore > six.candidateScore);
  assert.equal(_private.itemCountFromText("五柱柱状图数据图表组件"), 5);
  assert.equal(_private.itemCountFromText("6组柱状图模板"), 6);
});

test("component planner searches segmented donut chart templates", () => {
  const plan = buildComponentSearchPlan({
    archetype: "donut-chart",
    structureSignature: {
      layout: "donut-chart",
      stepCount: 3,
      direction: "segmented-ring",
      wholeGroupTemplatePriority: "high"
    },
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "donut-chart",
      structureSignature: {
        layout: "donut-chart",
        stepCount: 3,
        direction: "segmented-ring",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "chart-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "donut-chart");
  assert.ok(plan.queries.some((query) => query.keywords === "分段环形图"));
  assert.ok(plan.queries.some((query) => query.keywords === "3段环形图"));
  assert.ok(plan.queries.some((query) => query.keywords === "三扇区饼图"));
  assert.equal(_private.itemCountFromText("三扇区饼图组件"), 3);
});

test("component planner searches segmented pie chart templates separately from donut charts", () => {
  const plan = buildComponentSearchPlan({
    archetype: "pie-chart",
    structureSignature: {
      layout: "pie-chart",
      stepCount: 4,
      direction: "segmented-pie",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["pie-share-chart"],
    componentStrategy: {
      mode: "native-chart-template",
      templateFamily: "pie-chart",
      targetMotifs: ["pie-share-chart"],
      structureSignature: {
        layout: "pie-chart",
        stepCount: 4,
        direction: "segmented-pie",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "chart-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "pie-chart");
  assert.deepEqual(plan.targetMotifs, ["pie-share-chart"]);
  assert.ok(plan.queries.some((query) => query.keywords === "饼图"));
  assert.ok(plan.queries.some((query) => query.keywords === "扇区占比图"));
  assert.ok(plan.queries.some((query) => query.keywords === "4扇区饼图"));
  assert.ok(plan.queries.some((query) => query.keywords === "四项份额图"));
  assert.ok(plan.queries.some((query) => query.keywords === "pie chart template"));
  assert.equal(_private.normalizeTemplateFamily("generic", "chart-zone", { keywords: "四扇区饼图 份额占比" }), "pie-chart");
});

test("component planner searches layer-counted pyramid and funnel components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "layered-stack",
    structureSignature: {
      layout: "layered-stack",
      stepCount: 4,
      rows: 4,
      columns: 1,
      direction: "pyramid-down",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["layered-stack", "pyramid-stack"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "layered-stack",
      targetMotifs: ["layered-stack", "pyramid-stack"],
      structureSignature: {
        layout: "layered-stack",
        stepCount: 4,
        rows: 4,
        columns: 1,
        direction: "pyramid-down",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "layered-stack");
  assert.deepEqual(plan.targetMotifs, ["layered-stack", "pyramid-stack"]);
  assert.ok(plan.queries.some((query) => query.keywords === "金字塔图"));
  assert.ok(plan.queries.some((query) => query.keywords === "4层金字塔"));
  assert.ok(plan.queries.some((query) => query.keywords === "四层分层图"));
  assert.ok(plan.queries.some((query) => query.keywords === "金字塔组件"));
});

test("component planner scores exact layered-stack level-count matches above nearby stacks", () => {
  const query = { provider: "islide", kind: "smartdiagram" };
  const understanding = {
    archetype: "layered-stack",
    structureSignature: {
      layout: "layered-stack",
      stepCount: 4,
      direction: "funnel-down"
    },
    targetMotifs: ["layered-stack", "funnel-stack"],
    componentStrategy: {
      templateFamily: "layered-stack",
      targetMotifs: ["layered-stack", "funnel-stack"],
      structureSignature: {
        layout: "layered-stack",
        stepCount: 4,
        direction: "funnel-down"
      }
    }
  };
  const four = scoreCandidateDocument({
    id: "four",
    title: "四层漏斗分层图组件",
    reuseHint: "candidate-polished-diagram-reference"
  }, understanding, query);
  const five = scoreCandidateDocument({
    id: "five",
    title: "5层漏斗组件",
    reuseHint: "candidate-polished-diagram-reference"
  }, understanding, query);

  assert.ok(four.candidateScore > five.candidateScore);
  assert.equal(_private.itemCountFromText("四层漏斗分层图组件"), 4);
  assert.equal(_private.itemCountFromText("5层漏斗组件"), 5);
});

test("component planner searches set-counted Venn overlap components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "venn-overlap",
    structureSignature: {
      layout: "venn-overlap",
      stepCount: 3,
      rows: 1,
      columns: 3,
      direction: "overlapping-sets",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["venn-overlap", "intersection-overlap"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "venn-overlap",
      targetMotifs: ["venn-overlap", "intersection-overlap"],
      structureSignature: {
        layout: "venn-overlap",
        stepCount: 3,
        rows: 1,
        columns: 3,
        direction: "overlapping-sets",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.templateFamily, "venn-overlap");
  assert.deepEqual(plan.targetMotifs, ["venn-overlap", "intersection-overlap"]);
  assert.ok(plan.queries.some((query) => query.keywords === "Venn图"));
  assert.ok(plan.queries.some((query) => query.keywords === "3圆Venn图"));
  assert.ok(plan.queries.some((query) => query.keywords === "三集合交集图"));
  assert.ok(plan.queries.some((query) => query.keywords === "交集关系"));
});

test("component planner scores exact Venn set-count matches above nearby diagrams", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "venn-overlap",
    structureSignature: {
      layout: "venn-overlap",
      stepCount: 3
    },
    targetMotifs: ["venn-overlap", "intersection-overlap"],
    componentStrategy: {
      templateFamily: "venn-overlap",
      targetMotifs: ["venn-overlap", "intersection-overlap"],
      structureSignature: {
        layout: "venn-overlap",
        stepCount: 3
      }
    }
  };
  const three = scoreCandidateDocument({
    id: "three",
    title: "三集合交集图 Venn组件",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const four = scoreCandidateDocument({
    id: "four",
    title: "4集合关系韦恩图",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(three.candidateScore > four.candidateScore);
  assert.equal(_private.itemCountFromText("三集合交集图 Venn组件"), 3);
  assert.equal(_private.itemCountFromText("二圆Venn图"), 2);
  assert.equal(_private.itemCountFromText("4集合关系韦恩图"), 4);
});

test("component planner maps lens funnel and branch card motifs into plugin search keywords", () => {
  const plan = buildComponentSearchPlan({
    archetype: "flow-card-chain",
    targetMotifs: ["lens-funnel-flow", "branch-card-flow"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "process-chain",
      targetMotifs: ["lens-funnel-flow", "branch-card-flow"],
      sourcePreference: ["officeplus-search", "islide-search"]
    }
  }, {
    layerType: "diagram-zone",
    title: "Skill1 需求理解",
    size: 4
  });

  assert.deepEqual(plan.targetMotifs, ["lens-funnel-flow", "branch-card-flow"]);
  assert.ok(plan.queries.some((query) => query.keywords === "放大镜流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "漏斗流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "分支卡片流程"));
  assert.ok(_private.targetMotifKeywords(["lens-funnel-flow"]).includes("magnifier funnel"));
  assert.ok(_private.targetMotifKeywords(["branch-card-flow"]).includes("card branch flow"));
});

test("component planner searches iSlide smart diagrams for radial hub-spoke targets", () => {
  const plan = buildComponentSearchPlan({
    archetype: "hub-spoke",
    targetMotifs: ["radial-link"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "hub-spoke",
      targetMotifs: ["radial-link"]
    }
  }, {
    layerType: "diagram-zone",
    size: 4
  });

  assert.deepEqual(plan.targetMotifs, ["radial-link"]);
  assert.ok(plan.queries.some((query) => query.provider === "islide" && query.kind === "smartdiagram"));
  assert.ok(plan.queries.some((query) => query.keywords === "中心辐射"));
  assert.ok(plan.queries.some((query) => query.keywords === "放射关系图"));
});

test("component planner searches endpoint-counted radial relationship components", () => {
  const plan = buildComponentSearchPlan({
    archetype: "hub-spoke",
    structureSignature: {
      layout: "radial",
      stepCount: 5,
      direction: "center-out",
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["radial-link"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "hub-spoke",
      targetMotifs: ["radial-link"],
      structureSignature: {
        layout: "radial",
        stepCount: 5,
        direction: "center-out",
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.structureSignature.layout, "radial");
  assert.deepEqual(plan.targetMotifs, ["radial-link"]);
  assert.ok(plan.queries.some((query) => query.keywords === "辐射关系组件"));
  assert.ok(plan.queries.some((query) => query.keywords === "中心发散图"));
  assert.ok(plan.queries.some((query) => query.keywords === "5端中心辐射"));
  assert.ok(plan.queries.some((query) => query.keywords === "五端中心辐射"));
  assert.ok(plan.queries.some((query) => query.keywords === "五分支中心关系图"));
});

test("component planner maps timeline and roadmap terms to linear arrow chains", () => {
  const plan = buildComponentSearchPlan({
    archetype: "timeline",
    targetMotifs: ["linear-arrow-chain"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "timeline",
      targetMotifs: ["linear-arrow-chain"],
      sourcePreference: ["officeplus-search", "islide-search"]
    }
  }, {
    layerType: "diagram-zone",
    size: 4
  });

  assert.deepEqual(plan.targetMotifs, ["linear-arrow-chain"]);
  assert.ok(plan.queries.some((query) => query.keywords === "时间轴"));
  assert.ok(plan.queries.some((query) => query.keywords === "roadmap"));
  assert.ok(_private.targetMotifKeywords(["linear-arrow-chain"]).includes("timeline"));
});

test("component planner turns structure signatures into whole-group process search keywords", () => {
  const plan = buildComponentSearchPlan({
    archetype: "flow-card-chain",
    structureSignature: {
      layout: "linear-process",
      stepCount: 4,
      rows: 1,
      columns: 4,
      direction: "left-to-right",
      regularSpacing: true,
      wholeGroupTemplatePriority: "high"
    },
    targetMotifs: ["linear-arrow-chain", "whole-process-template"],
    componentStrategy: {
      mode: "component-template",
      templateFamily: "process-chain",
      targetMotifs: ["linear-arrow-chain", "whole-process-template"],
      structureSignature: {
        layout: "linear-process",
        stepCount: 4,
        rows: 1,
        columns: 4,
        direction: "left-to-right",
        regularSpacing: true,
        wholeGroupTemplatePriority: "high"
      }
    }
  }, {
    layerType: "diagram-zone",
    size: 6
  });

  assert.equal(plan.structureSignature.layout, "linear-process");
  assert.equal(plan.structureSignature.stepCount, 4);
  assert.deepEqual(plan.targetMotifs, ["linear-arrow-chain", "whole-process-template"]);
  assert.ok(plan.queries.some((query) => query.keywords === "4步流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "4项流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "四项流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "4项箭头流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "四项箭头流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "横向流程"));
  assert.ok(plan.queries.some((query) => query.keywords === "整组流程组件"));
  assert.ok(_private.structureSignatureKeywords(plan.structureSignature).includes("等距步骤流程"));
  assert.ok(_private.structureSignatureKeywords(plan.structureSignature).includes("四步流程"));
});

test("component planner scores documents with target motif title matches higher", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "tree-structure",
    targetMotifs: ["tree-link"],
    componentStrategy: { templateFamily: "hub-spoke", targetMotifs: ["tree-link"] }
  };
  const generic = scoreCandidateDocument({
    id: "generic",
    title: "中心关系图",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const tree = scoreCandidateDocument({
    id: "tree",
    title: "树状层级组织结构图",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(tree.candidateScore > generic.candidateScore);
});

test("component planner scores exact radial endpoint-count matches above nearby relationship diagrams", () => {
  const query = { provider: "islide", kind: "smartdiagram" };
  const understanding = {
    archetype: "hub-spoke",
    structureSignature: {
      layout: "radial",
      stepCount: 5
    },
    targetMotifs: ["radial-link"],
    componentStrategy: {
      templateFamily: "hub-spoke",
      targetMotifs: ["radial-link"],
      structureSignature: {
        layout: "radial",
        stepCount: 5
      }
    }
  };
  const five = scoreCandidateDocument({
    id: "five",
    title: "五端中心辐射关系图",
    reuseHint: "candidate-polished-diagram-reference"
  }, understanding, query);
  const six = scoreCandidateDocument({
    id: "six",
    title: "6节点放射关系图",
    reuseHint: "candidate-polished-diagram-reference"
  }, understanding, query);

  assert.ok(five.candidateScore > six.candidateScore);
  assert.equal(_private.itemCountFromText("五端中心辐射关系图"), 5);
  assert.equal(_private.itemCountFromText("6节点放射关系图"), 6);
});

test("component planner scores exact hierarchy node-count matches above nearby trees", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "tree-structure",
    structureSignature: {
      layout: "tree",
      stepCount: 4,
      rows: 2
    },
    targetMotifs: ["tree-link"],
    componentStrategy: {
      templateFamily: "hub-spoke",
      targetMotifs: ["tree-link"],
      structureSignature: {
        layout: "tree",
        stepCount: 4,
        rows: 2
      }
    }
  };
  const four = scoreCandidateDocument({
    id: "four",
    title: "四节点组织结构图",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const five = scoreCandidateDocument({
    id: "five",
    title: "5节点树状层级关系",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(four.candidateScore > five.candidateScore);
  assert.equal(_private.itemCountFromText("四节点组织结构图"), 4);
  assert.equal(_private.itemCountFromText("5节点树状层级关系"), 5);
});

test("component planner scores exact structure step-count matches above nearby counts", () => {
  const query = { provider: "officeplus", kind: "component" };
  const understanding = {
    archetype: "flow-card-chain",
    structureSignature: {
      layout: "linear-process",
      stepCount: 4
    },
    targetMotifs: ["linear-arrow-chain", "whole-process-template"],
    componentStrategy: {
      templateFamily: "process-chain",
      targetMotifs: ["linear-arrow-chain", "whole-process-template"],
      structureSignature: {
        layout: "linear-process",
        stepCount: 4
      }
    }
  };
  const four = scoreCandidateDocument({
    id: "four",
    title: "渐变4项流程箭头",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const six = scoreCandidateDocument({
    id: "six",
    title: "阴影6项箭头流程图",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);
  const zhFour = scoreCandidateDocument({
    id: "zh-four",
    title: "四项箭头流程",
    reuseHint: "candidate-grouped-pptx-component"
  }, understanding, query);

  assert.ok(four.candidateScore > six.candidateScore);
  assert.ok(zhFour.candidateScore > six.candidateScore);
  assert.equal(_private.itemCountFromText("渐变4项流程箭头"), 4);
  assert.equal(_private.itemCountFromText("四项箭头流程"), 4);
});
