import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";

export const serverRouter = router({
  health: healthRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
