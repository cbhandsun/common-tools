import { connectTeamRedis } from "../../packages/remote-mcp-server/redis-connection";
// @ts-expect-error A separate password is required.
void connectTeamRedis({ url: "redis://localhost", username: "default" });
// @ts-expect-error Credentials cannot be numbers.
void connectTeamRedis({ url: "redis://localhost", username: "default", password: 12 });
