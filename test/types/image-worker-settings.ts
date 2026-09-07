import { createImageWorkerSettings, readImageWorkerEnvironment, pathIsFile } from "../../packages/remote-mcp-server/image-worker-settings";

const environment = readImageWorkerEnvironment({ OPENXML_BUILDER_EXE: "example" } as unknown);
// @ts-expect-error validated environment is immutable
environment.OPENXML_BUILDER_EXE = "changed";
const read = createImageWorkerSettings({
  paddleProfileName: "paddle",
  readPaddleProfile: () => ({ enabled: true, name: "paddle" }),
  readRawProfile: () => ({ enabled: false, name: "raw" })
});
const settings = read({} as unknown);
const executable: string = settings.builderExecutable;
const enabled: boolean = settings.rawImageOcrProfile.enabled;
const fingerprint: string | undefined = settings.ocrCheckpointFingerprint;
// @ts-expect-error settings are immutable
settings.builderExecutable = "changed";
// @ts-expect-error profile readers must return a checked enabled flag
createImageWorkerSettings({ paddleProfileName: "paddle", readPaddleProfile: () => ({}), readRawProfile: () => ({}) });
pathIsFile({} as unknown);
void [executable, enabled, fingerprint];
