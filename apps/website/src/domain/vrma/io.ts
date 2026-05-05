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
  byteOffset?: number;
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
  bufferViews?: Array<{
    buffer: number;
    byteLength: number;
    byteOffset?: number;
    byteStride?: number;
  }>;
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

interface ParsedGltfAsset {
  binaryChunk?: Uint8Array;
  gltf: GltfLike;
}

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BINARY_CHUNK_TYPE = 0x004e4942;
const FLOAT32_BYTE_LENGTH = 4;

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

function getBufferBytes(asset: ParsedGltfAsset, bufferIndex: number) {
  const buffer = asset.gltf.buffers?.[bufferIndex];

  if (!buffer) {
    throw new Error(`Buffer ${bufferIndex} was not found.`);
  }

  if (buffer.uri !== undefined) {
    return readEmbeddedBuffer(buffer.uri);
  }

  if (bufferIndex === 0 && asset.binaryChunk) {
    return asset.binaryChunk;
  }

  throw new Error(
    "Only embedded data URI buffers or GLB binary chunks are supported in this editor.",
  );
}

function readFloatAccessor(asset: ParsedGltfAsset, accessorIndex: number) {
  const gltf = asset.gltf;
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

  const bytes = getBufferBytes(asset, bufferView.buffer);
  const componentCount = getComponentCount(accessor.type);
  const elementByteLength = componentCount * FLOAT32_BYTE_LENGTH;
  const byteStride = bufferView.byteStride ?? elementByteLength;
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

  if (byteStride < elementByteLength) {
    throw new Error("The animation accessor byte stride is smaller than its element size.");
  }

  const values = new Float32Array(accessor.count * componentCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let elementIndex = 0; elementIndex < accessor.count; elementIndex += 1) {
    const elementOffset = byteOffset + elementIndex * byteStride;

    for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      const valueOffset = elementOffset + componentIndex * FLOAT32_BYTE_LENGTH;

      if (valueOffset + FLOAT32_BYTE_LENGTH > view.byteLength) {
        throw new Error(`Accessor ${accessorIndex} reads outside of its buffer view.`);
      }

      values[elementIndex * componentCount + componentIndex] = view.getFloat32(valueOffset, true);
    }
  }

  return {
    count: accessor.count,
    type: accessor.type,
    values,
  };
}

function normalizeInterpolation(value?: string): Interpolation {
  return value === "STEP" ? "STEP" : "LINEAR";
}

function createVec3Keyframes(times: Float32Array, values: Float32Array) {
  const keyframeCount = Math.min(times.length, Math.floor(values.length / 3));

  return Array.from({ length: keyframeCount }, (_, index) => {
    const valueIndex = index * 3;

    return {
      time: times[index] ?? 0,
      value: [
        values[valueIndex] ?? 0,
        values[valueIndex + 1] ?? 0,
        values[valueIndex + 2] ?? 0,
      ] as Vec3,
    };
  });
}

function createVec4Keyframes(times: Float32Array, values: Float32Array) {
  const keyframeCount = Math.min(times.length, Math.floor(values.length / 4));

  return Array.from({ length: keyframeCount }, (_, index) => {
    const valueIndex = index * 4;

    return {
      time: times[index] ?? 0,
      value: [
        values[valueIndex] ?? 0,
        values[valueIndex + 1] ?? 0,
        values[valueIndex + 2] ?? 0,
        values[valueIndex + 3] ?? 1,
      ] as Vec4,
    };
  });
}

function createExpressionKeyframes(times: Float32Array, values: Float32Array) {
  const keyframeCount = Math.min(times.length, Math.floor(values.length / 3));

  return Array.from({ length: keyframeCount }, (_, index) => ({
    time: times[index] ?? 0,
    value: values[index * 3] ?? 0,
  }));
}

function parseGltfJson(text: string): GltfLike {
  return JSON.parse(text) as GltfLike;
}

function parseGlb(bytes: ArrayBuffer): ParsedGltfAsset {
  const view = new DataView(bytes);

  if (view.byteLength < 20) {
    throw new Error("The GLB file is too small to contain a glTF asset.");
  }

  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("The GLB magic header was not found.");
  }

  if (view.getUint32(4, true) !== GLB_VERSION) {
    throw new Error("Only binary glTF 2.0 files are supported.");
  }

  const declaredLength = view.getUint32(8, true);

  if (declaredLength > view.byteLength) {
    throw new Error("The GLB file length is larger than the provided data.");
  }

  let offset = 12;
  let jsonText: string | undefined;
  let binaryChunk: Uint8Array | undefined;

  while (offset + 8 <= declaredLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;

    if (chunkEnd > declaredLength) {
      throw new Error("A GLB chunk extends beyond the file length.");
    }

    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      jsonText = new TextDecoder().decode(new Uint8Array(bytes, chunkStart, chunkLength)).trimEnd();
    } else if (chunkType === GLB_BINARY_CHUNK_TYPE) {
      binaryChunk = new Uint8Array(bytes, chunkStart, chunkLength);
    }

    offset = chunkEnd;
  }

  if (!jsonText) {
    throw new Error("The GLB JSON chunk was not found.");
  }

  return {
    binaryChunk,
    gltf: parseGltfJson(jsonText),
  };
}

function parseGltfAsset(bytes: ArrayBuffer): ParsedGltfAsset {
  const view = new DataView(bytes);

  if (view.byteLength >= 4 && view.getUint32(0, true) === GLB_MAGIC) {
    return parseGlb(bytes);
  }

  return {
    gltf: parseGltfJson(new TextDecoder().decode(bytes)),
  };
}

function alignBytesToFour(bytes: Uint8Array, padding: number) {
  const alignedLength = Math.ceil(bytes.byteLength / 4) * 4;
  const aligned = new Uint8Array(alignedLength);
  aligned.set(bytes);
  aligned.fill(padding, bytes.byteLength);

  return aligned;
}

function createGlb(gltf: GltfLike, binaryChunk: Uint8Array) {
  const jsonChunk = alignBytesToFour(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const binChunk = alignBytesToFour(binaryChunk, 0);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setUint32(offset, GLB_MAGIC, true);
  offset += 4;
  view.setUint32(offset, GLB_VERSION, true);
  offset += 4;
  view.setUint32(offset, totalLength, true);
  offset += 4;
  view.setUint32(offset, jsonChunk.byteLength, true);
  offset += 4;
  view.setUint32(offset, GLB_JSON_CHUNK_TYPE, true);
  offset += 4;
  bytes.set(jsonChunk, offset);
  offset += jsonChunk.byteLength;
  view.setUint32(offset, binChunk.byteLength, true);
  offset += 4;
  view.setUint32(offset, GLB_BINARY_CHUNK_TYPE, true);
  offset += 4;
  bytes.set(binChunk, offset);

  return buffer;
}

export function importVrmaFromText(text: string, fileName: string): VrmaDocument {
  return importVrmaFromAsset({ gltf: parseGltfJson(text) }, fileName);
}

export function importVrmaFromArrayBuffer(buffer: ArrayBuffer, fileName: string): VrmaDocument {
  return importVrmaFromAsset(parseGltfAsset(buffer), fileName);
}

function importVrmaFromAsset(asset: ParsedGltfAsset, fileName: string): VrmaDocument {
  const gltf = asset.gltf;
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

    const input = readFloatAccessor(asset, sampler.input);
    const output = readFloatAccessor(asset, sampler.output);
    const interpolation = normalizeInterpolation(sampler.interpolation);

    if (channel.target.path === "rotation") {
      const bone = nodeToBone.get(channel.target.node);

      if (bone) {
        const track = tracks.find(
          (candidate) => candidate.kind === "boneRotation" && candidate.bone === bone,
        );

        if (track?.kind === "boneRotation") {
          track.interpolation = interpolation;
          track.keyframes = createVec4Keyframes(input.values, output.values);
        }

        continue;
      }

      if (channel.target.node === extension.lookAt?.node) {
        const track = tracks.find((candidate) => candidate.kind === "lookAtRotation");

        if (track?.kind === "lookAtRotation") {
          track.interpolation = interpolation;
          track.keyframes = createVec4Keyframes(input.values, output.values);
        }
      }
    }

    if (channel.target.path === "translation") {
      const bone = nodeToBone.get(channel.target.node);

      if (bone === "hips") {
        const track = tracks.find((candidate) => candidate.kind === "hipsTranslation");

        if (track?.kind === "hipsTranslation") {
          track.interpolation = interpolation;
          track.keyframes = createVec3Keyframes(input.values, output.values);
        }

        continue;
      }

      const expressionName =
        nodeToPresetExpression.get(channel.target.node) ??
        nodeToCustomExpression.get(channel.target.node);

      if (expressionName) {
        const track = tracks.find(
          (candidate) =>
            candidate.kind === "expression" && candidate.expressionName === expressionName,
        );

        if (track?.kind === "expression") {
          track.interpolation = interpolation;
          track.keyframes = createExpressionKeyframes(input.values, output.values);
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

export function exportVrmaToArrayBuffer(document: VrmaDocument) {
  const gltf = parseGltfJson(exportVrmaToText(document));
  const sourceBuffer = gltf.buffers?.[0];

  if (!sourceBuffer) {
    throw new Error("Cannot export VRMA without a glTF buffer.");
  }

  const binaryChunk = readEmbeddedBuffer(sourceBuffer.uri);
  const binaryGltf: GltfLike = {
    ...gltf,
    buffers: [
      {
        byteLength: binaryChunk.byteLength,
      },
    ],
  };

  return createGlb(binaryGltf, binaryChunk);
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
