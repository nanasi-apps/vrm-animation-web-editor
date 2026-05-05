import { expect, test } from "vite-plus/test";
import {
  createEmptyDocument,
  createExpressionTrack,
  createLookAtTrack,
  createRotationTrack,
  upsertTrack,
} from "../domain/vrma/document";
import { exportVrmaToText, getVrmaExportFileName, importVrmaFromText } from "../domain/vrma/io";

interface ExportedAccessor {
  bufferView: number;
  componentType: number;
  count: number;
  max?: number[];
  min?: number[];
  type: string;
}

interface ExportedGltf {
  accessors: ExportedAccessor[];
  animations: Array<{
    samplers: Array<{ input: number; output: number }>;
  }>;
  bufferViews: Array<{ buffer: number; byteLength: number; byteOffset?: number }>;
  buffers: Array<{ uri: string }>;
}

function expectExportError(document: Parameters<typeof exportVrmaToText>[0], message: RegExp) {
  expect(() => exportVrmaToText(document)).toThrow(message);
}

function parseExportedGltf(text: string) {
  return JSON.parse(text) as ExportedGltf;
}

function readAccessorValues(gltf: ExportedGltf, accessorIndex: number) {
  const accessor = gltf.accessors[accessorIndex];

  if (!accessor) {
    throw new Error(`Accessor ${accessorIndex} was not found.`);
  }

  const bufferView = gltf.bufferViews[accessor.bufferView];

  if (!bufferView) {
    throw new Error(`Buffer view ${accessor.bufferView} was not found.`);
  }

  const buffer = gltf.buffers[bufferView.buffer];
  const base64 = buffer?.uri.split(",")[1];

  if (!base64) {
    throw new Error("Embedded buffer was not found.");
  }

  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const byteOffset = bufferView.byteOffset ?? 0;
  const view = bytes.buffer.slice(byteOffset, byteOffset + bufferView.byteLength);

  return Array.from(new Float32Array(view));
}

test("exported vrma gltf round-trips through import", () => {
  let document = createEmptyDocument("roundtrip.gltf");
  document = upsertTrack(document, createExpressionTrack("happy", true));
  document = upsertTrack(document, createLookAtTrack());

  const exported = exportVrmaToText(document);
  const imported = importVrmaFromText(exported, "roundtrip.gltf");

  expect(imported.specVersion).toBe("1.0");
  expect(
    imported.tracks.some(
      (track) => track.kind === "expression" && track.expressionName === "happy",
    ),
  ).toBe(true);
  expect(imported.tracks.some((track) => track.kind === "lookAtRotation")).toBe(true);
  expect(imported.activeBones).toContain("hips");
});

test("export file name uses vrma extension", () => {
  expect(getVrmaExportFileName("avatar.vrma.gltf")).toBe("avatar.vrma");
  expect(getVrmaExportFileName("avatar.gltf")).toBe("avatar.vrma");
  expect(getVrmaExportFileName("avatar.json")).toBe("avatar.vrma");
  expect(getVrmaExportFileName("avatar.vrma")).toBe("avatar.vrma");
  expect(getVrmaExportFileName(" ")).toBe("vrm-animation.vrma");
});

test("exported animation input accessors include min and max", () => {
  const document = createEmptyDocument("accessor-bounds.vrma");
  const hipsTrack = document.tracks.find((track) => track.kind === "hipsTranslation");

  if (hipsTrack?.kind !== "hipsTranslation") {
    throw new Error("Hips translation track was not found.");
  }

  hipsTrack.keyframes = [
    { time: 0, value: [0, 0, 0] },
    { time: 0.5, value: [0, 0.1, 0] },
    { time: 1.25, value: [0, 0.2, 0] },
  ];

  const gltf = parseExportedGltf(exportVrmaToText(document));
  const sampler = gltf.animations[0]?.samplers[0];

  if (!sampler) {
    throw new Error("Animation sampler was not found.");
  }

  const inputAccessor = gltf.accessors[sampler.input];

  expect(inputAccessor).toMatchObject({
    componentType: 5126,
    count: 3,
    max: [1.25],
    min: [0],
    type: "SCALAR",
  });
});

test("exported animation input times are strictly increasing", () => {
  const document = createEmptyDocument("dedupe-times.vrma");
  const hipsTrack = document.tracks.find((track) => track.kind === "hipsTranslation");

  if (hipsTrack?.kind !== "hipsTranslation") {
    throw new Error("Hips translation track was not found.");
  }

  hipsTrack.keyframes = [
    { time: -1, value: [0, 0, 0] },
    { time: 0, value: [1, 0, 0] },
    { time: 0.5, value: [2, 0, 0] },
    { time: 0.5, value: [3, 0, 0] },
    { time: 1, value: [4, 0, 0] },
  ];

  const gltf = parseExportedGltf(exportVrmaToText(document));
  const sampler = gltf.animations[0]?.samplers[0];

  if (!sampler) {
    throw new Error("Animation sampler was not found.");
  }

  const inputAccessor = gltf.accessors[sampler.input];
  const outputAccessor = gltf.accessors[sampler.output];

  if (!inputAccessor || !outputAccessor) {
    throw new Error("Animation accessors were not found.");
  }

  expect(inputAccessor.min).toEqual([0]);
  expect(inputAccessor.max).toEqual([1]);
  expect(readAccessorValues(gltf, sampler.input)).toEqual([0, 0.5, 1]);
  expect(readAccessorValues(gltf, sampler.output)).toEqual([1, 0, 0, 3, 0, 0, 4, 0, 0]);
  expect(inputAccessor.count).toBe(3);
  expect(outputAccessor.count).toBe(3);
});

test("export rejects documents with missing required humanoid bones", () => {
  const document = createEmptyDocument("missing-bone.vrma");
  document.activeBones = document.activeBones.filter((bone) => bone !== "head");

  expectExportError(document, /Required humanoid bone "head" is missing/);
});

test("export rejects invalid expression presets", () => {
  const document = createEmptyDocument("invalid-expression.vrma");
  document.tracks.push({
    expressionName: "lookLeft",
    id: "expression-look-left",
    interpolation: "LINEAR",
    keyframes: [{ time: 0, value: 1 }],
    kind: "expression",
    preset: true,
  });

  expectExportError(document, /Preset expression "lookLeft" is not part of the VRM 1.0 preset set/);
});

test("export rejects empty animation tracks", () => {
  const document = createEmptyDocument("empty-track.vrma");
  const hipsTrack = document.tracks.find((track) => track.kind === "hipsTranslation");

  if (hipsTrack?.kind !== "hipsTranslation") {
    throw new Error("Hips translation track was not found.");
  }

  hipsTrack.keyframes = [];

  expectExportError(document, /hips translation track must have at least one keyframe/);
});

test("export rejects non-finite and malformed keyframe values", () => {
  const document = createEmptyDocument("invalid-values.vrma");
  const rotationTrack = createRotationTrack("head");
  rotationTrack.keyframes = [{ time: 0, value: [0, 0, Number.NaN, 1] }];

  document.tracks.push(rotationTrack);

  expectExportError(document, /head rotation track has an invalid VEC4/);
});

test("exported accessors and buffer views remain non-empty and aligned", () => {
  let document = createEmptyDocument("alignment.vrma");
  document = upsertTrack(document, createExpressionTrack("happy", true));
  document = upsertTrack(document, createLookAtTrack());

  const gltf = parseExportedGltf(exportVrmaToText(document));

  for (const accessor of gltf.accessors) {
    const componentCount = accessor.type === "SCALAR" ? 1 : accessor.type === "VEC3" ? 3 : 4;
    const bufferView = gltf.bufferViews[accessor.bufferView];

    expect(accessor.count).toBeGreaterThanOrEqual(1);
    expect(bufferView?.byteLength).toBe(accessor.count * componentCount * 4);
    expect(readAccessorValues(gltf, gltf.accessors.indexOf(accessor)).every(Number.isFinite)).toBe(
      true,
    );
  }
});
