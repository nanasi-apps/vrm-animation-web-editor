import { systemContract } from "./system";
import { userContract } from "./user";

export { HealthStatusSchema, systemContract, type HealthStatus } from "./system";
export { UserSchema, userContract, type User } from "./user";

export const contract = {
  system: systemContract,
  user: userContract,
};
