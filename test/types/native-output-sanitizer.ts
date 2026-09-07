import { sanitizeNativeChart, sanitizeNativeCharts, sanitizeNativeShape, sanitizeNativeShapes } from "../../packages/slideclone-core/native-output-sanitizer";

const incoming: unknown = null;
const shapes = sanitizeNativeShapes(incoming);
const charts = sanitizeNativeCharts(incoming);
const shape = sanitizeNativeShape(incoming);
const chart = sanitizeNativeChart(incoming, 0);
void [shapes, charts, shape, chart];
// @ts-expect-error Sanitized collections are not scalar strings.
const text: string = shapes;
// @ts-expect-error A nullable chart is not a numeric status code.
const status: number = chart;
void [text, status];
if (chart) {
  const id: string = chart.id;
  const categories: string[] = chart.categories;
  // @ts-expect-error Chart data is numeric after sanitation.
  const values: string[] | undefined = chart.values;
  void [id, categories, values];
}
