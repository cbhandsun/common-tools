import {
  chartFallbackSignature,
  normalizeType,
  normalizedCategories,
  normalizedSeries,
  promoteNativeChartPayload,
  stableStringify,
  validateDeckNativeChartPayloads,
  validateNativeChartPayload
} from "../../packages/slideclone-core/chart-native-payload";

declare const input: unknown;

const payload = promoteNativeChartPayload(input);
const validation = validateNativeChartPayload(input);
const signature: string = chartFallbackSignature(input);
const type: string = normalizeType(input);
const categories: string[] = normalizedCategories(input);
const series = normalizedSeries(input);
const serialized: string = stableStringify({ chart: null });
validateDeckNativeChartPayloads(input);
void [payload, validation, signature, type, categories, series, serialized];

// @ts-expect-error Native payload hashes are strings.
const invalidHash: number = payload.fallbackSha256;
// @ts-expect-error Validation status is boolean.
const invalidStatus: string = validation.ok;
// @ts-expect-error Normalized series values are numeric.
const invalidValues: string[] = series[0]?.values ?? [];
void [invalidHash, invalidStatus, invalidValues];
