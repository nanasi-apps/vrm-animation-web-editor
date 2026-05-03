import { expect, test } from "vite-plus/test";
import app from "../src/index";

test("GET /api/health returns backend status", async () => {
  const response = await app.request("http://example.com/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true,
    service: "backend",
  });
});
