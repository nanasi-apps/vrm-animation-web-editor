import { expect, test } from "vite-plus/test";
import {
  createEmptyDocument,
  createExpressionTrack,
  createLookAtTrack,
  upsertTrack,
} from "../domain/vrma/document";
import { exportVrmaToText, importVrmaFromText } from "../domain/vrma/io";

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
