// Store persistent sessions in a global map to survive API route reloads
// NOTE: This only works in development server mode (long-running process).
// In production serverless (Vercel), this would NOT work (need Redis).
// Since the user is running `npm run dev` locally, this is fine.

declare global {
  var globalShellSessions: Map<string, any> | undefined;
}

const shellSessions = global.globalShellSessions || new Map<string, any>();

if (process.env.NODE_ENV !== "production") {
  global.globalShellSessions = shellSessions;
}

export { shellSessions };
