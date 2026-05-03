import { oc } from "@orpc/contract";
import { z } from "zod";

export const HealthStatusSchema = z.object({
  ok: z.literal(true),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
});

export const systemContract = {
  health: oc.input(z.object({})).output(HealthStatusSchema),
};

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
