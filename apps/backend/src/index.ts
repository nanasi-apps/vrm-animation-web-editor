import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { createHealthStatus, router } from "./router";

const app = new Hono();

const rpcHandler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.get("/api/health", (context) => {
  return context.json(createHealthStatus());
});

app.use("/rpc/*", async (context, next) => {
  const { matched, response } = await rpcHandler.handle(context.req.raw, {
    prefix: "/rpc",
  });

  if (matched) {
    return context.newResponse(response.body, response);
  }

  await next();
});

export default app;
