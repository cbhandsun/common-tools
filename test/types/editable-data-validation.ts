import { validateEditableChartData, validateEditableTableData } from "../../packages/ppt-create-core/editable-data-validation.js";

validateEditableTableData({ rows: [["header", "value"], []] });
validateEditableChartData({ type: "line", categories: ["Q1"], series: [{ name: "Revenue", values: [1] }] }, ["line"]);

// @ts-expect-error a boundary validator does not produce a value for downstream use.
const invalidResult: string = validateEditableTableData({ rows: [] });
void invalidResult;
