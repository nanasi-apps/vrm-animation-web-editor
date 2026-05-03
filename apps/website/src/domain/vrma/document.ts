import {
  DEFAULT_DURATION_SECONDS,
  LOOK_AT_DEFAULT_OFFSET,
  REQUIRED_HUMAN_BONES,
  SPEC_VERSION,
} from "./constants";
import type {
  BoneRotationTrack,
  ExpressionTrack,
  HumanBoneName,
  HipsTranslationTrack,
  LookAtTrack,
  Vec3,
  Vec4,
  VrmaDocument,
  VrmaTrack,
} from "./types";

let nextId = 0;

function createId(prefix: string) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function clampTime(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export function createRotationTrack(bone: HumanBoneName): BoneRotationTrack {
  return {
    bone,
    id: createId(`bone-${bone}`),
    interpolation: "LINEAR",
    keyframes: [
      {
        time: 0,
        value: [0, 0, 0, 1] as Vec4,
      },
    ],
    kind: "boneRotation",
  };
}

export function createHipsTranslationTrack(): HipsTranslationTrack {
  return {
    id: createId("hips-translation"),
    interpolation: "LINEAR",
    keyframes: [
      {
        time: 0,
        value: [0, 0, 0],
      },
    ],
    kind: "hipsTranslation",
  };
}

export function createExpressionTrack(expressionName: string, preset: boolean): ExpressionTrack {
  return {
    expressionName,
    id: createId(`expression-${expressionName}`),
    interpolation: "LINEAR",
    keyframes: [
      {
        time: 0,
        value: 0,
      },
    ],
    kind: "expression",
    preset,
  };
}

export function createLookAtTrack(offsetFromHeadBone: Vec3 = LOOK_AT_DEFAULT_OFFSET): LookAtTrack {
  return {
    id: createId("look-at"),
    interpolation: "LINEAR",
    keyframes: [
      {
        time: 0,
        value: [0, 0, 0, 1],
      },
    ],
    kind: "lookAtRotation",
    offsetFromHeadBone: [...offsetFromHeadBone] as Vec3,
  };
}

export function createEmptyDocument(fileName = "untitled.vrma.gltf"): VrmaDocument {
  return {
    activeBones: [...REQUIRED_HUMAN_BONES],
    duration: DEFAULT_DURATION_SECONDS,
    fileName,
    specVersion: SPEC_VERSION,
    tracks: [createHipsTranslationTrack()],
  };
}

export function sortTrackKeyframes(track: VrmaTrack): VrmaTrack {
  if (track.kind === "expression") {
    const sortedKeyframes = [...track.keyframes].sort((left, right) => left.time - right.time);
    return {
      ...track,
      keyframes: sortedKeyframes.map((keyframe) => ({
        time: clampTime(keyframe.time),
        value: keyframe.value,
      })),
    };
  }

  if (track.kind === "hipsTranslation") {
    const sortedKeyframes = [...track.keyframes].sort((left, right) => left.time - right.time);
    return {
      ...track,
      keyframes: sortedKeyframes.map((keyframe) => ({
        time: clampTime(keyframe.time),
        value: [...keyframe.value] as Vec3,
      })),
    };
  }

  const sortedKeyframes = [...track.keyframes].sort((left, right) => left.time - right.time);
  return {
    ...track,
    keyframes: sortedKeyframes.map((keyframe) => ({
      time: clampTime(keyframe.time),
      value: [...keyframe.value] as Vec4,
    })),
  };
}

export function upsertTrack(document: VrmaDocument, track: VrmaTrack): VrmaDocument {
  const existingIndex = document.tracks.findIndex((candidate) => candidate.id === track.id);
  const tracks = [...document.tracks];

  if (existingIndex >= 0) {
    tracks.splice(existingIndex, 1, sortTrackKeyframes(track));
  } else {
    tracks.push(sortTrackKeyframes(track));
  }

  return {
    ...document,
    duration: inferDuration(tracks, document.duration),
    tracks,
  };
}

export function inferDuration(tracks: VrmaTrack[], fallback: number) {
  const maxTime = tracks
    .flatMap((track) => track.keyframes.map((keyframe) => keyframe.time))
    .reduce((largest, value) => Math.max(largest, value), 0);

  return Math.max(fallback, maxTime, 0.5);
}

export function ensureBone(document: VrmaDocument, bone: HumanBoneName): VrmaDocument {
  if (document.activeBones.includes(bone)) {
    return document;
  }

  return upsertTrack(
    {
      ...document,
      activeBones: [...document.activeBones, bone],
    },
    createRotationTrack(bone),
  );
}
