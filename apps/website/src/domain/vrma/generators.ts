import {
  createExpressionTrack,
  createHipsTranslationTrack,
  createLookAtTrack,
  createRotationTrack,
  upsertTrack,
} from "./document";
import type {
  BoneRotationTrack,
  ExpressionTrack,
  HumanBoneName,
  HipsTranslationTrack,
  LookAtTrack,
  Vec3,
  Vec4,
  VrmaDocument,
} from "./types";

export type AnimationGeneratorKind = "idle" | "wave" | "blink" | "lookAround";

export interface GeneratedAnimationResult {
  document: VrmaDocument;
  previewTime: number;
  selectedTrackId: string;
}

function multiplyQuaternion([ax, ay, az, aw]: Vec4, [bx, by, bz, bw]: Vec4): Vec4 {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function normalizeQuaternion([x, y, z, w]: Vec4): Vec4 {
  const length = Math.hypot(x, y, z, w);

  if (length === 0) {
    return [0, 0, 0, 1];
  }

  return [x / length, y / length, z / length, w / length];
}

function axisAngle(axis: "x" | "y" | "z", degrees: number): Vec4 {
  const radians = (degrees * Math.PI) / 180;
  const half = radians / 2;
  const sine = Math.sin(half);
  const cosine = Math.cos(half);

  if (axis === "x") {
    return [sine, 0, 0, cosine];
  }

  if (axis === "y") {
    return [0, sine, 0, cosine];
  }

  return [0, 0, sine, cosine];
}

function combine(...rotations: Vec4[]) {
  return normalizeQuaternion(
    rotations.reduce((current, next) => multiplyQuaternion(current, next), [0, 0, 0, 1] as Vec4),
  );
}

function findBoneTrack(document: VrmaDocument, bone: HumanBoneName): BoneRotationTrack | undefined {
  return document.tracks.find(
    (track): track is BoneRotationTrack => track.kind === "boneRotation" && track.bone === bone,
  );
}

function withBoneRotationTrack(
  document: VrmaDocument,
  bone: HumanBoneName,
  keys: Array<[number, Vec4]>,
) {
  const track = findBoneTrack(document, bone) ?? createRotationTrack(bone);
  const nextTrack: BoneRotationTrack = {
    ...track,
    interpolation: "LINEAR",
    keyframes: keys.map(([time, value]) => ({ time, value })),
  };

  return upsertTrack(
    {
      ...document,
      activeBones: document.activeBones.includes(bone)
        ? document.activeBones
        : [...document.activeBones, bone],
    },
    nextTrack,
  );
}

function withExpressionTrack(
  document: VrmaDocument,
  expressionName: string,
  keys: Array<[number, number]>,
) {
  const track =
    document.tracks.find(
      (candidate): candidate is ExpressionTrack =>
        candidate.kind === "expression" && candidate.expressionName === expressionName,
    ) ?? createExpressionTrack(expressionName, true);

  const nextTrack: ExpressionTrack = {
    ...track,
    interpolation: "LINEAR",
    keyframes: keys.map(([time, value]) => ({
      time,
      value: Math.min(1, Math.max(0, value)),
    })),
  };

  return upsertTrack(document, nextTrack);
}

function withHipsTranslationTrack(document: VrmaDocument, keys: Array<[number, Vec3]>) {
  const track =
    document.tracks.find(
      (candidate): candidate is HipsTranslationTrack => candidate.kind === "hipsTranslation",
    ) ?? createHipsTranslationTrack();
  const nextTrack: HipsTranslationTrack = {
    ...track,
    interpolation: "LINEAR",
    keyframes: keys.map(([time, value]) => ({ time, value })),
  };

  return upsertTrack(document, nextTrack);
}

function withLookAtTrack(document: VrmaDocument, keys: Array<[number, Vec4]>) {
  const track =
    document.tracks.find(
      (candidate): candidate is LookAtTrack => candidate.kind === "lookAtRotation",
    ) ?? createLookAtTrack();
  const nextTrack: LookAtTrack = {
    ...track,
    interpolation: "LINEAR",
    keyframes: keys.map(([time, value]) => ({ time, value })),
  };

  return upsertTrack(document, nextTrack);
}

export function generateAnimation(
  document: VrmaDocument,
  kind: AnimationGeneratorKind,
): GeneratedAnimationResult {
  if (kind === "idle") {
    let nextDocument = {
      ...document,
      duration: Math.max(document.duration, 2),
    };

    nextDocument = withHipsTranslationTrack(nextDocument, [
      [0, [0, 0, 0]],
      [0.5, [0, 0.035, 0]],
      [1, [0, 0, 0]],
      [1.5, [0, -0.025, 0]],
      [2, [0, 0, 0]],
    ]);
    nextDocument = withBoneRotationTrack(nextDocument, "spine", [
      [0, combine(axisAngle("x", 0))],
      [0.5, combine(axisAngle("x", -8))],
      [1, combine(axisAngle("x", 0))],
      [1.5, combine(axisAngle("x", 8))],
      [2, combine(axisAngle("x", 0))],
    ]);
    nextDocument = withBoneRotationTrack(nextDocument, "chest", [
      [0, combine(axisAngle("x", 0))],
      [0.5, combine(axisAngle("x", 10))],
      [1, combine(axisAngle("x", 0))],
      [1.5, combine(axisAngle("x", -10))],
      [2, combine(axisAngle("x", 0))],
    ]);

    const track = findBoneTrack(nextDocument, "chest") ?? findBoneTrack(nextDocument, "spine");
    return {
      document: nextDocument,
      previewTime: 0.5,
      selectedTrackId: track?.id ?? nextDocument.tracks[0]?.id ?? "",
    };
  }

  if (kind === "wave") {
    let nextDocument = {
      ...document,
      duration: Math.max(document.duration, 2.4),
    };

    nextDocument = withBoneRotationTrack(nextDocument, "rightUpperArm", [
      [0, combine(axisAngle("z", 0), axisAngle("x", 0))],
      [0.4, combine(axisAngle("z", -72), axisAngle("x", -18))],
      [2.4, combine(axisAngle("z", -72), axisAngle("x", -18))],
    ]);
    nextDocument = withBoneRotationTrack(nextDocument, "rightLowerArm", [
      [0, combine(axisAngle("z", 0))],
      [0.4, combine(axisAngle("z", -54))],
      [0.8, combine(axisAngle("z", -24))],
      [1.2, combine(axisAngle("z", -62))],
      [1.6, combine(axisAngle("z", -24))],
      [2, combine(axisAngle("z", -62))],
      [2.4, combine(axisAngle("z", -30))],
    ]);

    const track = findBoneTrack(nextDocument, "rightLowerArm");
    return {
      document: nextDocument,
      previewTime: 0.4,
      selectedTrackId: track?.id ?? nextDocument.tracks[0]?.id ?? "",
    };
  }

  if (kind === "blink") {
    const nextDocument = withExpressionTrack(
      {
        ...document,
        duration: Math.max(document.duration, 2),
      },
      "blink",
      [
        [0, 0],
        [0.12, 1],
        [0.24, 0],
        [1.5, 0],
        [1.62, 1],
        [1.74, 0],
      ],
    );
    const track = nextDocument.tracks.find(
      (candidate) => candidate.kind === "expression" && candidate.expressionName === "blink",
    );

    return {
      document: nextDocument,
      previewTime: 0.12,
      selectedTrackId: track?.id ?? nextDocument.tracks[0]?.id ?? "",
    };
  }

  const nextDocument = withLookAtTrack(
    {
      ...document,
      duration: Math.max(document.duration, 2),
    },
    [
      [0, combine(axisAngle("y", 0), axisAngle("x", 0))],
      [0.5, combine(axisAngle("y", 18), axisAngle("x", -6))],
      [1, combine(axisAngle("y", 0), axisAngle("x", 0))],
      [1.5, combine(axisAngle("y", -18), axisAngle("x", 6))],
      [2, combine(axisAngle("y", 0), axisAngle("x", 0))],
    ],
  );
  const track = nextDocument.tracks.find((candidate) => candidate.kind === "lookAtRotation");

  return {
    document: nextDocument,
    previewTime: 0.5,
    selectedTrackId: track?.id ?? nextDocument.tracks[0]?.id ?? "",
  };
}
