import { alertsRouter } from "~/server/api/routers/alerts";
import { authRouter } from "~/server/api/routers/auth";
import { postRouter } from "~/server/api/routers/post";
import { productsRouter } from "~/server/api/routers/products";
import { stockMovementsRouter } from "~/server/api/routers/stock-movements";
import { tenantThresholdsRouter } from "~/server/api/routers/tenant-thresholds";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  alerts: alertsRouter,
  auth: authRouter,
  post: postRouter,
  products: productsRouter,
  stockMovements: stockMovementsRouter,
  tenantThresholds: tenantThresholdsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
