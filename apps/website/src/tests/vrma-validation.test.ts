import { expect, test } from "vite-plus/test";
import { createEmptyDocument, createExpressionTrack } from "../domain/vrma/document";
import { validateDocument } from "../domain/vrma/validation";

test("validation flags forbidden lookAt preset expression tracks", () => {
  const document = createEmptyDocument();
  document.tracks.push(createExpressionTrack("lookLeft", true));

  const diagnostics = validateDocument(document);

  expect(diagnostics.some((diagnostic) => diagnostic.code === "lookat-expression")).toBe(true);
});

test("default document is exportable without blocking errors", () => {
  const document = createEmptyDocument();
  const diagnostics = validateDocument(document);

  expect(diagnostics.filter((diagnostic) => diagnostic.level === "error")).toHaveLength(0);
});
