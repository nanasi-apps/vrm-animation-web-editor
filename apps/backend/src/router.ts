import { contract, type HealthStatus, type User } from "@template/contract";
import { ORPCError, implement } from "@orpc/server";

const os = implement(contract);

const users: User[] = [
  {
    id: "usr_1",
    displayName: "Ada Lovelace",
    role: "admin",
  },
  {
    id: "usr_2",
    displayName: "Grace Hopper",
    role: "member",
  },
];

export const router = os.router({
  system: {
    health: os.system.health.handler(() => createHealthStatus()),
  },
  user: {
    getById: os.user.getById.handler(({ input }) => {
      const user = users.find((candidate) => candidate.id === input.id);

      if (!user) {
        throw new ORPCError("NOT_FOUND", {
          data: { userId: input.id },
          message: `User ${input.id} was not found`,
        });
      }

      return user;
    }),
    list: os.user.list.handler(() => users),
  },
});

export function createHealthStatus(): HealthStatus {
  return {
    ok: true,
    service: "backend",
    timestamp: new Date().toISOString(),
  };
}
