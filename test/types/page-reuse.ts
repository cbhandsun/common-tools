import { resolvePageReuse } from "../../packages/slideclone-core/page-reuse";
const result = resolvePageReuse({ preserveNative: false, cacheEnabled: false, reuseCache: false, services: {
  preserve: () => ({ images: [] }), cacheKey: () => "", read: () => null,
  normalize: (page: { images: unknown[] }) => page, write: () => false
} });
if (result.kind === "reused") {
  // @ts-expect-error Reused pages cannot publish cache entries.
  result.persist({ images: [] });
} else {
  result.persist({ images: [] });
  // @ts-expect-error Publication retains the page contract.
  result.persist("invalid");
}
