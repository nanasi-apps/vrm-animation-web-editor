import { oc } from "@orpc/contract";
import { z } from "zod";

export const UserSchema = z.object({
  displayName: z.string().min(1),
  id: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

export const userContract = {
  getById: oc
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .output(UserSchema),
  list: oc.input(z.object({})).output(z.array(UserSchema)),
};

export type User = z.infer<typeof UserSchema>;
