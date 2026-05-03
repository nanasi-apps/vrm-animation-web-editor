import { Euler, MathUtils, Quaternion } from "three";
import type { Vec3, Vec4 } from "./types";

export function quaternionToEulerDegrees([x, y, z, w]: Vec4): Vec3 {
  const euler = new Euler().setFromQuaternion(new Quaternion(x, y, z, w).normalize(), "XYZ");

  return [MathUtils.radToDeg(euler.x), MathUtils.radToDeg(euler.y), MathUtils.radToDeg(euler.z)];
}

export function eulerDegreesToQuaternion([xDegrees, yDegrees, zDegrees]: Vec3): Vec4 {
  const quaternion = new Quaternion().setFromEuler(
    new Euler(
      MathUtils.degToRad(xDegrees),
      MathUtils.degToRad(yDegrees),
      MathUtils.degToRad(zDegrees),
      "XYZ",
    ),
  );

  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
