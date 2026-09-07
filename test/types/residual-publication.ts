import { publishResidual } from "../../packages/slideclone-core/residual-publication";
const source: unknown = "/source.png";
void publishResidual({ sourceFile: source, outputFile: "/output.png", write: (file: string) => { void file; } });
// @ts-expect-error Publication requires a writer function.
void publishResidual({ sourceFile: source, outputFile: "/output.png", write: false });
// @ts-expect-error Cancellation must return a boolean, not user metadata.
void publishResidual({ sourceFile: source, outputFile: "/output.png", write() {}, isCancellationRequested: () => "cancel" });
