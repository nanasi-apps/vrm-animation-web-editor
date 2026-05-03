import { expect, test } from "vite-plus/test";
import { createEmptyDocument } from "../domain/vrma/document";
import { generateAnimation } from "../domain/vrma/generators";
import { validateDocument } from "../domain/vrma/validation";

test("wave generator creates humanoid rotation keyframes", () => {
  const result = generateAnimation(createEmptyDocument(), "wave");
  const rightLowerArm = result.document.tracks.find(
    (track) => track.kind === "boneRotation" && track.bone === "rightLowerArm",
  );

  expect(rightLowerArm?.keyframes.length).toBeGreaterThan(2);
  expect(result.previewTime).toBeGreaterThan(0);
  expect(
    validateDocument(result.document).filter((diagnostic) => diagnostic.level === "error"),
  ).toHaveLength(0);
});

test("idle generator creates visible motion at preview time", () => {
  const result = generateAnimation(createEmptyDocument(), "idle");
  const hips = result.document.tracks.find((track) => track.kind === "hipsTranslation");
  const spine = result.document.tracks.find(
    (track) => track.kind === "boneRotation" && track.bone === "spine",
  );

  expect(result.previewTime).toBe(0.5);
  expect(hips?.kind).toBe("hipsTranslation");
  expect(spine?.kind).toBe("boneRotation");

  if (hips?.kind !== "hipsTranslation" || spine?.kind !== "boneRotation") {
    throw new Error("Idle generator did not create expected tracks.");
  }

  expect(hips.keyframes.some((keyframe) => keyframe.value[1] !== 0)).toBe(true);
  expect(spine.keyframes.some((keyframe) => keyframe.value[0] !== 0)).toBe(true);
  expect(
    validateDocument(result.document).filter((diagnostic) => diagnostic.level === "error"),
  ).toHaveLength(0);
});

test("blink generator creates clamped expression weight keyframes", () => {
  const result = generateAnimation(createEmptyDocument(), "blink");
  const blink = result.document.tracks.find(
    (track) => track.kind === "expression" && track.expressionName === "blink",
  );

  expect(blink?.keyframes.map((keyframe) => keyframe.value)).toContain(1);
  expect(
    validateDocument(result.document).filter((diagnostic) => diagnostic.level === "error"),
  ).toHaveLength(0);
});

test("lookAt generator creates a lookAt rotation track", () => {
  const result = generateAnimation(createEmptyDocument(), "lookAround");
  const lookAt = result.document.tracks.find((track) => track.kind === "lookAtRotation");

  expect(lookAt?.keyframes.length).toBeGreaterThan(2);
  expect(
    validateDocument(result.document).filter((diagnostic) => diagnostic.level === "error"),
  ).toHaveLength(0);
});
