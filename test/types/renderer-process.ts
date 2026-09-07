import { run, commandPlan } from "../../packages/slideclone-core/renderer-process";
const incoming: unknown = ["--version"];
const plan = commandPlan("renderer", incoming, "linux");
const command: string = plan.command;
void command;
void run("renderer", incoming, { timeout: 1000 }).then((output) => {
  const text: string = output.stdout;
  void text;
  // @ts-expect-error Captured output is text, not a status code.
  const code: number = output.stdout;
  void code;
});
// @ts-expect-error Process timeout must be numeric.
void run("renderer", [], { timeout: "1000" });
