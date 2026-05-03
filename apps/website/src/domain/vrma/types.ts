import type { HUMAN_BONE_NAMES, PRESET_EXPRESSION_NAMES, SPEC_VERSION } from "./constants";

export type HumanBoneName = (typeof HUMAN_BONE_NAMES)[number];
export type PresetExpressionName = (typeof PRESET_EXPRESSION_NAMES)[number];
export type Interpolation = "LINEAR" | "STEP";
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export interface ScalarKeyframe {
  time: number;
  value: number;
}

export interface Vec3Keyframe {
  time: number;
  value: Vec3;
}

export interface Vec4Keyframe {
  time: number;
  value: Vec4;
}

export interface BoneRotationTrack {
  id: string;
  kind: "boneRotation";
  bone: HumanBoneName;
  interpolation: Interpolation;
  keyframes: Vec4Keyframe[];
}

export interface HipsTranslationTrack {
  id: string;
  kind: "hipsTranslation";
  interpolation: Interpolation;
  keyframes: Vec3Keyframe[];
}

export interface ExpressionTrack {
  id: string;
  kind: "expression";
  expressionName: string;
  preset: boolean;
  interpolation: Interpolation;
  keyframes: ScalarKeyframe[];
}

export interface LookAtTrack {
  id: string;
  kind: "lookAtRotation";
  interpolation: Interpolation;
  offsetFromHeadBone: Vec3;
  keyframes: Vec4Keyframe[];
}

export type VrmaTrack = BoneRotationTrack | HipsTranslationTrack | ExpressionTrack | LookAtTrack;

export interface VrmaDocument {
  fileName: string;
  specVersion: typeof SPEC_VERSION;
  duration: number;
  activeBones: HumanBoneName[];
  tracks: VrmaTrack[];
}

export interface Diagnostic {
  code: string;
  level: "error" | "warning" | "info";
  message: string;
}

export interface SampledPose {
  boneRotations: Partial<Record<HumanBoneName, Vec4>>;
  hipsTranslation: Vec3;
  expressionWeights: Record<string, number>;
  lookAtRotation: Vec4 | null;
  lookAtOffset: Vec3;
}
