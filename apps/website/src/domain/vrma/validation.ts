import {
  FORBIDDEN_EXPRESSION_PRESETS,
  PRESET_EXPRESSION_NAMES,
  REQUIRED_HUMAN_BONES,
  SPEC_VERSION,
} from "./constants";
import type { Diagnostic, VrmaDocument } from "./types";

function createDiagnostic(code: string, level: Diagnostic["level"], message: string): Diagnostic {
  return { code, level, message };
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

      for (const keyframe of track.keyframes) {
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
