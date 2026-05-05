import { LOOK_AT_DEFAULT_OFFSET, REQUIRED_HUMAN_BONES } from "./constants";
import type {
  Interpolation,
  SampledPose,
  ScalarKeyframe,
  Vec3,
  Vec3Keyframe,
  Vec4,
  Vec4Keyframe,
  VrmaDocument,
} from "./types";

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeQuaternion([x, y, z, w]: Vec4): Vec4 {
  const length = Math.hypot(x, y, z, w);

  if (length === 0) {
    return [0, 0, 0, 1];
  }

  return [x / length, y / length, z / length, w / length];
}

function findNextKeyframeIndex(keyframes: Array<{ time: number }>, time: number) {
  let low = 0;
  let high = keyframes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (keyframes[middle]!.time >= time) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low === keyframes.length ? -1 : low;
}

function sampleScalar(keyframes: ScalarKeyframe[], time: number, interpolation: Interpolation) {
  if (keyframes.length === 0) {
    return 0;
  }

  const nextIndex = findNextKeyframeIndex(keyframes, time);

  if (nextIndex <= 0) {
    return keyframes[0]?.value ?? 0;
  }

  if (nextIndex === -1) {
    return keyframes.at(-1)?.value ?? 0;
  }

  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];

  if (interpolation === "STEP" || previous.time === next.time) {
    return previous.value;
  }

  const alpha = (time - previous.time) / (next.time - previous.time);
  return previous.value + (next.value - previous.value) * alpha;
}

function sampleVec3(keyframes: Vec3Keyframe[], time: number, interpolation: Interpolation): Vec3 {
  if (keyframes.length === 0) {
    return [0, 0, 0];
  }

  const nextIndex = findNextKeyframeIndex(keyframes, time);

  if (nextIndex <= 0) {
    return [...(keyframes[0]?.value ?? [0, 0, 0])] as Vec3;
  }

  if (nextIndex === -1) {
    return [...(keyframes.at(-1)?.value ?? [0, 0, 0])] as Vec3;
  }

  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];

  if (interpolation === "STEP" || previous.time === next.time) {
    return [...previous.value] as Vec3;
  }

  const alpha = (time - previous.time) / (next.time - previous.time);
  return previous.value.map((value, index) => value + (next.value[index]! - value) * alpha) as Vec3;
}

function sampleVec4(keyframes: Vec4Keyframe[], time: number, interpolation: Interpolation): Vec4 {
  if (keyframes.length === 0) {
    return [0, 0, 0, 1];
  }

  const nextIndex = findNextKeyframeIndex(keyframes, time);

  if (nextIndex <= 0) {
    return normalizeQuaternion([...(keyframes[0]?.value ?? [0, 0, 0, 1])] as Vec4);
  }

  if (nextIndex === -1) {
    return normalizeQuaternion([...(keyframes.at(-1)?.value ?? [0, 0, 0, 1])] as Vec4);
  }

  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];

  if (interpolation === "STEP" || previous.time === next.time) {
    return normalizeQuaternion([...previous.value] as Vec4);
  }

  const alpha = (time - previous.time) / (next.time - previous.time);
  const blended = previous.value.map(
    (value, index) => value + (next.value[index]! - value) * alpha,
  ) as Vec4;
  return normalizeQuaternion(blended);
}

export function sampleDocument(document: VrmaDocument, time: number): SampledPose {
  const pose: SampledPose = {
    boneRotations: Object.fromEntries(
      REQUIRED_HUMAN_BONES.map((bone) => [bone, [0, 0, 0, 1] satisfies Vec4]),
    ),
    expressionWeights: {},
    hipsTranslation: [0, 0, 0],
    lookAtOffset: [...LOOK_AT_DEFAULT_OFFSET],
    lookAtRotation: null,
  };

  for (const track of document.tracks) {
    if (track.kind === "boneRotation") {
      pose.boneRotations[track.bone] = sampleVec4(track.keyframes, time, track.interpolation);
      continue;
    }

    if (track.kind === "hipsTranslation") {
      pose.hipsTranslation = sampleVec3(track.keyframes, time, track.interpolation);
      continue;
    }

    if (track.kind === "expression") {
      pose.expressionWeights[track.expressionName] = clamp01(
        sampleScalar(track.keyframes, time, track.interpolation),
      );
      continue;
    }

    pose.lookAtRotation = sampleVec4(track.keyframes, time, track.interpolation);
    pose.lookAtOffset = [...track.offsetFromHeadBone] as Vec3;
  }

  return pose;
}
