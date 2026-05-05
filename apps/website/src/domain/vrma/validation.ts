import {
  FORBIDDEN_EXPRESSION_PRESETS,
  HUMAN_BONE_NAMES,
  PRESET_EXPRESSION_NAMES,
  REQUIRED_HUMAN_BONES,
  SPEC_VERSION,
} from "./constants";
import type { Diagnostic, Vec3, Vec4, VrmaDocument, VrmaTrack } from "./types";

function createDiagnostic(code: string, level: Diagnostic["level"], message: string): Diagnostic {
  return { code, level, message };
}

const humanBoneNameSet = new Set<string>(HUMAN_BONE_NAMES);

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function isFiniteTuple(value: Vec3 | Vec4, size: 3 | 4) {
  return value.length === size && value.every(isFiniteNumber);
}

function getTrackLabel(track: VrmaTrack) {
  if (track.kind === "boneRotation") {
    return `${track.bone} rotation`;
  }

  if (track.kind === "hipsTranslation") {
    return "hips translation";
  }

  if (track.kind === "expression") {
    return `${track.expressionName} expression`;
  }

  return "lookAt rotation";
}

export function validateDocument(document: VrmaDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (document.specVersion !== SPEC_VERSION) {
    diagnostics.push(
      createDiagnostic(
        "spec-version",
        "error",
        'VRMC_vrm_animation.specVersion must be exactly "1.0".',
      ),
    );
  }

  for (const bone of REQUIRED_HUMAN_BONES) {
    if (!document.activeBones.includes(bone)) {
      diagnostics.push(
        createDiagnostic("required-bone", "error", `Required humanoid bone "${bone}" is missing.`),
      );
    }
  }

  for (const bone of document.activeBones) {
    if (!humanBoneNameSet.has(bone)) {
      diagnostics.push(
        createDiagnostic("unsupported-bone", "error", `Unsupported humanoid bone "${bone}".`),
      );
    }
  }

  const forbiddenBones = ["leftEye", "rightEye"];

  for (const forbiddenBone of forbiddenBones) {
    if (document.activeBones.includes(forbiddenBone as never)) {
      diagnostics.push(
        createDiagnostic(
          "forbidden-eye-bone",
          "error",
          `Humanoid mappings must not define ${forbiddenBone}; eye animation belongs in LookAt.`,
        ),
      );
    }
  }

  const hipsTranslationTracks = document.tracks.filter((track) => track.kind === "hipsTranslation");

  if (hipsTranslationTracks.length !== 1) {
    diagnostics.push(
      createDiagnostic(
        "hips-translation",
        "error",
        "Exactly one hips translation track is required.",
      ),
    );
  }

  for (const track of document.tracks) {
    const trackLabel = getTrackLabel(track);

    if (track.keyframes.length === 0) {
      diagnostics.push(
        createDiagnostic(
          "empty-track",
          "error",
          `${trackLabel} track must have at least one keyframe.`,
        ),
      );
    }

    for (const keyframe of track.keyframes) {
      if (!isFiniteNumber(keyframe.time)) {
        diagnostics.push(
          createDiagnostic("invalid-time", "error", `${trackLabel} track has a non-finite time.`),
        );
      }
    }

    if (track.kind === "boneRotation") {
      for (const keyframe of track.keyframes) {
        if (!isFiniteTuple(keyframe.value, 4)) {
          diagnostics.push(
            createDiagnostic(
              "invalid-rotation",
              "error",
              `${trackLabel} track has an invalid VEC4 keyframe value.`,
            ),
          );
        }
      }
    }

    if (track.kind === "hipsTranslation") {
      for (const keyframe of track.keyframes) {
        if (!isFiniteTuple(keyframe.value, 3)) {
          diagnostics.push(
            createDiagnostic(
              "invalid-translation",
              "error",
              `${trackLabel} track has an invalid VEC3 keyframe value.`,
            ),
          );
        }
      }
    }

    if (track.kind === "expression") {
      if (track.preset && !PRESET_EXPRESSION_NAMES.includes(track.expressionName as never)) {
        diagnostics.push(
          createDiagnostic(
            "preset-expression-name",
            "error",
            `Preset expression "${track.expressionName}" is not part of the VRM 1.0 preset set.`,
          ),
        );
      }

      if (FORBIDDEN_EXPRESSION_PRESETS.includes(track.expressionName as never)) {
        diagnostics.push(
          createDiagnostic(
            "lookat-expression",
            "error",
            `Expression "${track.expressionName}" is reserved for LookAt and cannot be animated as an expression track.`,
          ),
        );
      }

      if (!track.preset && PRESET_EXPRESSION_NAMES.includes(track.expressionName as never)) {
        diagnostics.push(
          createDiagnostic(
            "custom-expression-name",
            "error",
            `Custom expression "${track.expressionName}" must not use a VRM preset expression name.`,
          ),
        );
      }

      for (const keyframe of track.keyframes) {
        if (!isFiniteNumber(keyframe.value)) {
          diagnostics.push(
            createDiagnostic(
              "invalid-expression-value",
              "error",
              `${trackLabel} track has a non-finite keyframe value.`,
            ),
          );
          continue;
        }

        if (keyframe.value < 0 || keyframe.value > 1) {
          diagnostics.push(
            createDiagnostic(
              "expression-range",
              "warning",
              `Expression track "${track.expressionName}" has a key outside [0, 1] at ${keyframe.time.toFixed(2)}s; export will clamp it.`,
            ),
          );
        }
      }
    }

    if (track.kind === "lookAtRotation") {
      if (!isFiniteTuple(track.offsetFromHeadBone, 3)) {
        diagnostics.push(
          createDiagnostic(
            "invalid-lookat-offset",
            "error",
            "LookAt offsetFromHeadBone must be a finite VEC3.",
          ),
        );
      }

      for (const keyframe of track.keyframes) {
        if (!isFiniteTuple(keyframe.value, 4)) {
          diagnostics.push(
            createDiagnostic(
              "invalid-lookat-rotation",
              "error",
              `${trackLabel} track has an invalid VEC4 keyframe value.`,
            ),
          );
        }
      }
    }
  }

  const hasLookAt = document.tracks.some((track) => track.kind === "lookAtRotation");

  if (!hasLookAt) {
    diagnostics.push(
      createDiagnostic(
        "lookat-optional",
        "info",
        "LookAt is optional. Add it only when you need eye gaze rotation data in the exported file.",
      ),
    );
  }

  diagnostics.push(
    createDiagnostic(
      "humanoid-rules",
      "info",
      "Export uses a generated T-pose hierarchy, forbids humanoid scale animation, and allows translation only on hips.",
    ),
  );

  return diagnostics;
}
