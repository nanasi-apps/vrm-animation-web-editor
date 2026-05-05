import {
  BONE_PARENT_MAP,
  LOOK_AT_DEFAULT_OFFSET,
  REST_TRANSLATIONS,
  SPEC_VERSION,
} from "./constants";
import {
  createEmptyDocument,
  createExpressionTrack,
  createHipsTranslationTrack,
  createLookAtTrack,
  createRotationTrack,
  inferDuration,
} from "./document";
import type { HumanBoneName, Interpolation, Vec3, Vec4, VrmaDocument, VrmaTrack } from "./types";
import { validateDocument } from "./validation";

interface AccessorLike {
  bufferView: number;
  componentType: number;
  count: number;
  max?: number[];
  min?: number[];
  type: "SCALAR" | "VEC3" | "VEC4";
}

interface GltfLike {
  accessors?: AccessorLike[];
  animations?: Array<{
    channels: Array<{
      sampler: number;
      target: { node: number; path: "translation" | "rotation" | "scale" };
    }>;
    samplers: Array<{
      input: number;
      interpolation?: Interpolation;
      output: number;
    }>;
  }>;
  asset?: { generator?: string; version?: string };
  bufferViews?: Array<{ buffer: number; byteLength: number; byteOffset?: number }>;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  extensions?: {
    VRMC_vrm_animation?: {
      expressions?: { custom?: Record<string, unknown>; preset?: Record<string, unknown> };
      humanoid?: { humanBones?: Partial<Record<HumanBoneName, { node: number }>> };
      lookAt?: { node: number; offsetFromHeadBone?: Vec3 };
      specVersion?: string;
    };
  };
  extensionsUsed?: string[];
  nodes?: Array<{ children?: number[]; name?: string; rotation?: Vec4; translation?: Vec3 }>;
  scene?: number;
  scenes?: Array<{ nodes: number[] }>;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readEmbeddedBuffer(uri?: string) {
  if (!uri?.startsWith("data:")) {
    throw new Error("Only embedded data URI buffers are supported in this editor.");
  }

  const [, base64] = uri.split(",");

  if (!base64) {
    throw new Error("The data URI buffer is malformed.");
  }

  return decodeBase64(base64);
}

function readFloatAccessor(gltf: GltfLike, accessorIndex: number) {
  const accessor = gltf.accessors?.[accessorIndex];

  if (!accessor) {
    throw new Error(`Accessor ${accessorIndex} was not found.`);
  }

  if (accessor.componentType !== 5126) {
    throw new Error("Only float32 animation accessors are supported.");
  }

  const bufferView = gltf.bufferViews?.[accessor.bufferView];

  if (!bufferView) {
    throw new Error(`Buffer view ${accessor.bufferView} was not found.`);
  }

  const buffer = gltf.buffers?.[bufferView.buffer];

  if (!buffer) {
    throw new Error(`Buffer ${bufferView.buffer} was not found.`);
  }

  const bytes = readEmbeddedBuffer(buffer.uri);
  const byteOffset = bufferView.byteOffset ?? 0;
  const values = new Float32Array(
    bytes.buffer.slice(byteOffset, byteOffset + bufferView.byteLength),
  );

  return {
    count: accessor.count,
    type: accessor.type,
    values,
  };
}

function groupValues(values: Float32Array, size: number) {
  const grouped: number[][] = [];

  for (let index = 0; index < values.length; index += size) {
    grouped.push(Array.from(values.slice(index, index + size)));
  }

  return grouped;
}

function normalizeInterpolation(value?: string): Interpolation {
  return value === "STEP" ? "STEP" : "LINEAR";
}

export function importVrmaFromText(text: string, fileName: string): VrmaDocument {
  const gltf = JSON.parse(text) as GltfLike;
  const extension = gltf.extensions?.VRMC_vrm_animation;

  if (!extension) {
    throw new Error("VRMC_vrm_animation root extension was not found.");
  }

  const document = createEmptyDocument(fileName);
  const tracks: VrmaTrack[] = [];
  const activeBones = Object.keys(extension.humanoid?.humanBones ?? {}) as HumanBoneName[];
  const animation = gltf.animations?.[0];

  for (const bone of activeBones) {
    tracks.push(createRotationTrack(bone));
  }

  tracks.unshift(createHipsTranslationTrack());

  for (const [name] of Object.entries(extension.expressions?.preset ?? {})) {
    tracks.push(createExpressionTrack(name, true));
  }

  for (const [name] of Object.entries(extension.expressions?.custom ?? {})) {
    tracks.push(createExpressionTrack(name, false));
  }

  if (extension.lookAt?.node !== undefined) {
    tracks.push(createLookAtTrack(extension.lookAt.offsetFromHeadBone ?? LOOK_AT_DEFAULT_OFFSET));
  }

  if (!animation) {
    return {
      ...document,
      activeBones,
      specVersion: SPEC_VERSION,
      tracks,
    };
  }

  const nodeToBone = new Map<number, HumanBoneName>(
    Object.entries(extension.humanoid?.humanBones ?? {}).map(([bone, mapping]) => [
      mapping.node,
      bone as HumanBoneName,
    ]),
  );
  const nodeToPresetExpression = new Map<number, string>(
    Object.entries(extension.expressions?.preset ?? {}).map(([name, mapping]) => [
      (mapping as { node: number }).node,
      name,
    ]),
  );
  const nodeToCustomExpression = new Map<number, string>(
    Object.entries(extension.expressions?.custom ?? {}).map(([name, mapping]) => [
      (mapping as { node: number }).node,
      name,
    ]),
  );

  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];

    if (!sampler) {
      continue;
    }

    const input = readFloatAccessor(gltf, sampler.input);
    const output = readFloatAccessor(gltf, sampler.output);
    const interpolation = normalizeInterpolation(sampler.interpolation);
    const times = Array.from(input.values);

    if (channel.target.path === "rotation") {
      const bone = nodeToBone.get(channel.target.node);

      if (bone) {
        const values = groupValues(output.values, 4) as Vec4[];
        const track = tracks.find(
          (candidate) => candidate.kind === "boneRotation" && candidate.bone === bone,
        );

        if (track?.kind === "boneRotation") {
          track.interpolation = interpolation;
          track.keyframes = values.map((value, index) => ({ time: times[index] ?? 0, value }));
        }

        continue;
      }

      if (channel.target.node === extension.lookAt?.node) {
        const values = groupValues(output.values, 4) as Vec4[];
        const track = tracks.find((candidate) => candidate.kind === "lookAtRotation");

        if (track?.kind === "lookAtRotation") {
          track.interpolation = interpolation;
          track.keyframes = values.map((value, index) => ({ time: times[index] ?? 0, value }));
        }
      }
    }

    if (channel.target.path === "translation") {
      const bone = nodeToBone.get(channel.target.node);

      if (bone === "hips") {
        const values = groupValues(output.values, 3) as Vec3[];
        const track = tracks.find((candidate) => candidate.kind === "hipsTranslation");

        if (track?.kind === "hipsTranslation") {
          track.interpolation = interpolation;
          track.keyframes = values.map((value, index) => ({ time: times[index] ?? 0, value }));
        }

        continue;
      }

      const expressionName =
        nodeToPresetExpression.get(channel.target.node) ??
        nodeToCustomExpression.get(channel.target.node);

      if (expressionName) {
        const values = groupValues(output.values, 3);
        const track = tracks.find(
          (candidate) =>
            candidate.kind === "expression" && candidate.expressionName === expressionName,
        );

        if (track?.kind === "expression") {
          track.interpolation = interpolation;
          track.keyframes = values.map((value, index) => ({
            time: times[index] ?? 0,
            value: value[0] ?? 0,
          }));
        }
      }
    }
  }

  return {
    activeBones,
    duration: inferDuration(tracks, document.duration),
    fileName,
    specVersion: extension.specVersion === SPEC_VERSION ? SPEC_VERSION : SPEC_VERSION,
    tracks,
  };
}

function createFloatArray(values: number[]) {
  return new Uint8Array(new Float32Array(values).buffer);
}

function alignToFour(buffer: number[]) {
  while (buffer.length % 4 !== 0) {
    buffer.push(0);
  }
}

interface BuiltAccessor {
  accessorIndex: number;
  bufferViewIndex: number;
}

function normalizeExportKeyframes<TValue>(keyframes: Array<{ time: number; value: TValue }>) {
  const normalized = keyframes
    .map((keyframe) => ({
      time: Math.max(0, Number.isFinite(keyframe.time) ? keyframe.time : 0),
      value: keyframe.value,
    }))
    .sort((left, right) => left.time - right.time);
  const unique: Array<{ time: number; value: TValue }> = [];

  for (const keyframe of normalized) {
    const lastIndex = unique.length - 1;
    const last = unique[lastIndex];

    if (last?.time === keyframe.time) {
      unique[lastIndex] = keyframe;
      continue;
    }

    unique.push(keyframe);
  }

  return unique;
}

function getComponentCount(type: AccessorLike["type"]) {
  if (type === "SCALAR") {
    return 1;
  }

  return type === "VEC3" ? 3 : 4;
}

function assertExportableDocument(document: VrmaDocument) {
  const errors = validateDocument(document).filter((diagnostic) => diagnostic.level === "error");

  if (errors.length > 0) {
    throw new Error(`Cannot export invalid VRMA document: ${errors[0]!.message}`);
  }
}

export function getVrmaExportFileName(fileName: string) {
  const sourceName = fileName.trim() || "vrm-animation";
  const baseName = sourceName.replace(/\.vrma\.gltf$/i, "").replace(/\.(vrma|gltf|json)$/i, "");

  return `${baseName || "vrm-animation"}.vrma`;
}

export function exportVrmaToText(document: VrmaDocument) {
  assertExportableDocument(document);

  const bufferBytes: number[] = [];
  const accessors: AccessorLike[] = [];
  const bufferViews: Array<{ buffer: number; byteLength: number; byteOffset: number }> = [];

  function appendAccessor(
    flatValues: number[],
    count: number,
    type: AccessorLike["type"],
    bounds?: { max: number[]; min: number[] },
  ): BuiltAccessor {
    const componentCount = getComponentCount(type);

    if (count < 1) {
      throw new Error("Cannot export an accessor with zero elements.");
    }

    if (flatValues.length !== count * componentCount) {
      throw new Error("Cannot export an accessor with mismatched element count.");
    }

    if (!flatValues.every(Number.isFinite)) {
      throw new Error("Cannot export an accessor with non-finite values.");
    }

    const byteOffset = bufferBytes.length;
    const bytes = createFloatArray(flatValues);

    for (const byte of bytes) {
      bufferBytes.push(byte);
    }

    const byteLength = bytes.byteLength;
    bufferViews.push({
      buffer: 0,
      byteLength,
      byteOffset,
    });
    alignToFour(bufferBytes);

    const bufferViewIndex = bufferViews.length - 1;
    accessors.push({
      bufferView: bufferViewIndex,
      componentType: 5126,
      count,
      ...bounds,
      type,
    });

    return {
      accessorIndex: accessors.length - 1,
      bufferViewIndex,
    };
  }

  function appendInputAccessor(times: number[]) {
    return appendAccessor(times, times.length, "SCALAR", {
      max: [times[times.length - 1] ?? 0],
      min: [times[0] ?? 0],
    }).accessorIndex;
  }

  const nodes: Array<{ children?: number[]; name: string; rotation?: Vec4; translation?: Vec3 }> =
    [];
  const boneNodeIndices = new Map<HumanBoneName, number>();

  for (const bone of document.activeBones) {
    boneNodeIndices.set(bone, nodes.length);
    nodes.push({
      name: bone,
      rotation: [0, 0, 0, 1],
      translation: [...(REST_TRANSLATIONS[bone] ?? [0, 0, 0])] as Vec3,
    });
  }

  for (const bone of document.activeBones) {
    const parentBone = BONE_PARENT_MAP[bone];

    if (!parentBone) {
      continue;
    }

    const parentIndex = boneNodeIndices.get(parentBone);
    const boneIndex = boneNodeIndices.get(bone);

    if (parentIndex === undefined || boneIndex === undefined) {
      continue;
    }

    const parentNode = nodes[parentIndex]!;
    parentNode.children = [...(parentNode.children ?? []), boneIndex];
  }

  const presetExpressionEntries = document.tracks
    .filter(
      (track): track is Extract<VrmaTrack, { kind: "expression" }> =>
        track.kind === "expression" && track.preset,
    )
    .map((track) => {
      const nodeIndex = nodes.length;
      nodes.push({ name: `expr:${track.expressionName}`, translation: [0, 0, 0] });
      return [track.expressionName, { node: nodeIndex }] as const;
    });

  const customExpressionEntries = document.tracks
    .filter(
      (track): track is Extract<VrmaTrack, { kind: "expression" }> =>
        track.kind === "expression" && !track.preset,
    )
    .map((track) => {
      const nodeIndex = nodes.length;
      nodes.push({ name: `expr:${track.expressionName}`, translation: [0, 0, 0] });
      return [track.expressionName, { node: nodeIndex }] as const;
    });

  const lookAtTrack = document.tracks.find((track) => track.kind === "lookAtRotation");
  const lookAtNodeIndex = lookAtTrack
    ? nodes.push({ name: "lookAt", rotation: [0, 0, 0, 1] }) - 1
    : undefined;

  const animation = {
    channels: [] as Array<{
      sampler: number;
      target: { node: number; path: "translation" | "rotation" };
    }>,
    samplers: [] as Array<{ input: number; interpolation?: Interpolation; output: number }>,
  };

  for (const track of document.tracks) {
    if (track.kind === "boneRotation") {
      const nodeIndex = boneNodeIndices.get(track.bone);

      if (nodeIndex === undefined) {
        continue;
      }

      const keyframes = normalizeExportKeyframes(track.keyframes);
      const times = keyframes.map((keyframe) => keyframe.time);
      const inputAccessor = appendInputAccessor(times);
      const outputAccessor = appendAccessor(
        keyframes.flatMap((keyframe) => keyframe.value),
        keyframes.length,
        "VEC4",
      ).accessorIndex;
      animation.samplers.push({
        input: inputAccessor,
        interpolation: track.interpolation,
        output: outputAccessor,
      });
      animation.channels.push({
        sampler: animation.samplers.length - 1,
        target: { node: nodeIndex, path: "rotation" },
      });
      continue;
    }

    if (track.kind === "hipsTranslation") {
      const nodeIndex = boneNodeIndices.get("hips");

      if (nodeIndex === undefined) {
        continue;
      }

      const keyframes = normalizeExportKeyframes(track.keyframes);
      const times = keyframes.map((keyframe) => keyframe.time);
      const inputAccessor = appendInputAccessor(times);
      const outputAccessor = appendAccessor(
        keyframes.flatMap((keyframe) => keyframe.value),
        keyframes.length,
        "VEC3",
      ).accessorIndex;
      animation.samplers.push({
        input: inputAccessor,
        interpolation: track.interpolation,
        output: outputAccessor,
      });
      animation.channels.push({
        sampler: animation.samplers.length - 1,
        target: { node: nodeIndex, path: "translation" },
      });
      continue;
    }

    if (track.kind === "expression") {
      const mappings = track.preset ? presetExpressionEntries : customExpressionEntries;
      const nodeIndex = mappings.find(([name]) => name === track.expressionName)?.[1].node;

      if (nodeIndex === undefined) {
        continue;
      }

      const keyframes = normalizeExportKeyframes(track.keyframes);
      const times = keyframes.map((keyframe) => keyframe.time);
      const inputAccessor = appendInputAccessor(times);
      const outputAccessor = appendAccessor(
        keyframes.flatMap((keyframe) => [Math.min(1, Math.max(0, keyframe.value)), 0, 0]),
        keyframes.length,
        "VEC3",
      ).accessorIndex;
      animation.samplers.push({
        input: inputAccessor,
        interpolation: track.interpolation,
        output: outputAccessor,
      });
      animation.channels.push({
        sampler: animation.samplers.length - 1,
        target: { node: nodeIndex, path: "translation" },
      });
      continue;
    }

    if (lookAtNodeIndex === undefined) {
      continue;
    }

    const keyframes = normalizeExportKeyframes(track.keyframes);
    const times = keyframes.map((keyframe) => keyframe.time);
    const inputAccessor = appendInputAccessor(times);
    const outputAccessor = appendAccessor(
      keyframes.flatMap((keyframe) => keyframe.value),
      keyframes.length,
      "VEC4",
    ).accessorIndex;
    animation.samplers.push({
      input: inputAccessor,
      interpolation: track.interpolation,
      output: outputAccessor,
    });
    animation.channels.push({
      sampler: animation.samplers.length - 1,
      target: { node: lookAtNodeIndex, path: "rotation" },
    });
  }

  const hipsNodeIndex = boneNodeIndices.get("hips");
  const sceneNodes = [
    hipsNodeIndex,
    ...presetExpressionEntries.map(([, mapping]) => mapping.node),
    ...customExpressionEntries.map(([, mapping]) => mapping.node),
    lookAtNodeIndex,
  ].filter((value): value is number => value !== undefined);

  const gltf: GltfLike = {
    accessors,
    animations: [animation],
    asset: {
      generator: "vrm-animation-web-editor",
      version: "2.0",
    },
    bufferViews,
    buffers: [
      {
        byteLength: bufferBytes.length,
        uri: `data:application/octet-stream;base64,${encodeBase64(new Uint8Array(bufferBytes))}`,
      },
    ],
    extensions: {
      VRMC_vrm_animation: {
        expressions: {
          custom: Object.fromEntries(customExpressionEntries),
          preset: Object.fromEntries(presetExpressionEntries),
        },
        humanoid: {
          humanBones: Object.fromEntries(
            document.activeBones.map((bone) => [bone, { node: boneNodeIndices.get(bone) ?? 0 }]),
          ) as Partial<Record<HumanBoneName, { node: number }>>,
        },
        lookAt:
          lookAtTrack && lookAtNodeIndex !== undefined
            ? {
                node: lookAtNodeIndex,
                offsetFromHeadBone: lookAtTrack.offsetFromHeadBone,
              }
            : undefined,
        specVersion: SPEC_VERSION,
      },
    },
    extensionsUsed: ["VRMC_vrm_animation"],
    nodes,
    scene: 0,
    scenes: [
      {
        nodes: sceneNodes,
      },
    ],
  };

  return `${JSON.stringify(gltf, null, 2)}\n`;
}
