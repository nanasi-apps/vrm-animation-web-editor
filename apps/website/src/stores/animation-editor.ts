import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { PRESET_EXPRESSION_NAMES } from "../domain/vrma/constants";
import {
  createEmptyDocument,
  createExpressionTrack,
  createHipsTranslationTrack,
  createLookAtTrack,
  createRotationTrack,
  inferDuration,
  upsertTrack,
} from "../domain/vrma/document";
import {
  generateAnimation as generateAnimationDocument,
  type AnimationGeneratorKind,
} from "../domain/vrma/generators";
import {
  exportVrmaToArrayBuffer,
  exportVrmaToText,
  importVrmaFromArrayBuffer,
} from "../domain/vrma/io";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../domain/vrma/rotation";
import { sampleDocument } from "../domain/vrma/sampling";
import type { HumanBoneName, Interpolation, Vec3, Vec4, VrmaTrack } from "../domain/vrma/types";
import { validateDocument } from "../domain/vrma/validation";

type CopiedKeyframe =
  | { kind: "expression"; value: number }
  | { kind: "hipsTranslation"; value: Vec3 }
  | { kind: "rotation"; value: Vec4 };

function normalizeTime(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export const useAnimationEditorStore = defineStore("animation-editor", () => {
  const document = ref(createEmptyDocument());
  const previewModelFile = ref<File | null>(null);
  const previewModelName = ref("");
  const currentTime = ref(0);
  const isPlaying = ref(false);
  const selectedTrackId = ref<string | null>(document.value.tracks[0]?.id ?? null);
  const selectedKeyframeIndex = ref(0);
  const copiedKeyframe = ref<CopiedKeyframe | null>(null);
  let lastFrameTime = 0;
  let animationFrameId: number | null = null;

  const selectedTrack = computed(
    () => document.value.tracks.find((track) => track.id === selectedTrackId.value) ?? null,
  );
  const diagnostics = computed(() => validateDocument(document.value));
  const sampledPose = computed(() => sampleDocument(document.value, currentTime.value));
  const selectedKeyframe = computed(() => {
    const track = selectedTrack.value;

    if (!track) {
      return null;
    }

    return track.keyframes[selectedKeyframeIndex.value] ?? null;
  });

  const exportText = computed(() => exportVrmaToText(document.value));
  const exportBytes = computed(() => exportVrmaToArrayBuffer(document.value));

  function selectTrack(trackId: string) {
    selectedTrackId.value = trackId;
    selectedKeyframeIndex.value = 0;
  }

  function setCurrentTime(value: number) {
    currentTime.value = Math.min(document.value.duration, normalizeTime(value));
  }

  function stopPlayback() {
    isPlaying.value = false;
    lastFrameTime = 0;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function tick(now: number) {
    if (!isPlaying.value) {
      return;
    }

    if (lastFrameTime === 0) {
      lastFrameTime = now;
    }

    const deltaSeconds = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    const nextTime = currentTime.value + deltaSeconds;

    currentTime.value = nextTime >= document.value.duration ? 0 : nextTime;
    animationFrameId = requestAnimationFrame(tick);
  }

  function togglePlayback() {
    if (isPlaying.value) {
      stopPlayback();
      return;
    }

    isPlaying.value = true;
    animationFrameId = requestAnimationFrame(tick);
  }

  function newDocument() {
    stopPlayback();
    document.value = createEmptyDocument(
      previewModelName.value
        ? `${previewModelName.value.replace(/\.vrm$/i, "")}.vrma.gltf`
        : undefined,
    );
    selectedTrackId.value = document.value.tracks[0]?.id ?? null;
    selectedKeyframeIndex.value = 0;
    currentTime.value = 0;
  }

  async function importVrmFile(file: File) {
    stopPlayback();
    previewModelFile.value = file;
    previewModelName.value = file.name;
    document.value = {
      ...document.value,
      fileName: `${file.name.replace(/\.vrm$/i, "")}.vrma.gltf`,
    };
    selectedTrackId.value = document.value.tracks[0]?.id ?? null;
    selectedKeyframeIndex.value = 0;
    currentTime.value = 0;
  }

  async function importAnimationFile(file: File) {
    stopPlayback();
    document.value = importVrmaFromArrayBuffer(await file.arrayBuffer(), file.name);
    selectedTrackId.value = document.value.tracks[0]?.id ?? null;
    selectedKeyframeIndex.value = 0;
    currentTime.value = 0;
  }

  function addPresetExpressionTrack(name: string) {
    if (
      document.value.tracks.some(
        (track) => track.kind === "expression" && track.expressionName === name,
      )
    ) {
      return;
    }

    document.value = upsertTrack(document.value, createExpressionTrack(name, true));
  }

  function addCustomExpressionTrack(name: string) {
    const normalized = name.trim();

    if (!normalized) {
      return;
    }

    if (
      document.value.tracks.some(
        (track) => track.kind === "expression" && track.expressionName === normalized,
      )
    ) {
      return;
    }

    document.value = upsertTrack(document.value, createExpressionTrack(normalized, false));
  }

  function ensureLookAtTrack() {
    if (document.value.tracks.some((track) => track.kind === "lookAtRotation")) {
      return;
    }

    document.value = upsertTrack(document.value, createLookAtTrack());
  }

  function removeSelectedTrack() {
    const track = selectedTrack.value;

    if (!track) {
      return;
    }

    removeTrack(track.id);
  }

  function removeTrack(trackId: string) {
    const nextTracks = document.value.tracks.filter((candidate) => candidate.id !== trackId);

    document.value = {
      ...document.value,
      duration: inferDuration(nextTracks, document.value.duration),
      tracks: nextTracks,
    };
    selectedTrackId.value = document.value.tracks[0]?.id ?? null;
    selectedKeyframeIndex.value = 0;
  }

  function addTrack(track: VrmaTrack) {
    document.value = upsertTrack(document.value, track);
    selectedTrackId.value = track.id;
    selectedKeyframeIndex.value = 0;
  }

  function ensureActiveBone(bone: HumanBoneName) {
    if (document.value.activeBones.includes(bone)) {
      return;
    }

    document.value = {
      ...document.value,
      activeBones: [...document.value.activeBones, bone],
    };
  }

  function addBoneRotationTrack(bone: HumanBoneName) {
    ensureActiveBone(bone);

    if (
      document.value.tracks.some((track) => track.kind === "boneRotation" && track.bone === bone)
    ) {
      return;
    }

    addTrack(createRotationTrack(bone));
  }

  function selectOrCreateBoneRotationTrack(bone: HumanBoneName) {
    ensureActiveBone(bone);

    const existingTrack = document.value.tracks.find(
      (track) => track.kind === "boneRotation" && track.bone === bone,
    );

    if (existingTrack) {
      selectTrack(existingTrack.id);
      return;
    }

    addTrack(createRotationTrack(bone));
  }

  function addHipsTranslationTrack() {
    if (document.value.tracks.some((track) => track.kind === "hipsTranslation")) {
      return;
    }

    addTrack(createHipsTranslationTrack());
  }

  function addLookAtTrack() {
    if (document.value.tracks.some((track) => track.kind === "lookAtRotation")) {
      return;
    }

    addTrack(createLookAtTrack());
  }

  function addKeyframe() {
    const track = selectedTrack.value;

    if (!track) {
      return;
    }

    const time = Number(currentTime.value.toFixed(3));

    if (track.kind === "expression") {
      track.keyframes.push({
        time,
        value: sampledPose.value.expressionWeights[track.expressionName] ?? 0,
      });
    } else if (track.kind === "hipsTranslation") {
      track.keyframes.push({ time, value: [...sampledPose.value.hipsTranslation] });
    } else if (track.kind === "lookAtRotation") {
      track.keyframes.push({
        time,
        value: [...(sampledPose.value.lookAtRotation ?? [0, 0, 0, 1])],
      });
    } else {
      track.keyframes.push({
        time,
        value: [...(sampledPose.value.boneRotations[track.bone] ?? [0, 0, 0, 1])],
      });
    }

    document.value = upsertTrack(document.value, { ...track });
    selectedKeyframeIndex.value = track.keyframes.length - 1;
  }

  function selectRemainingKeyframe(trackId: string, deletedKeyframeIndex: number) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);

    if (!track) {
      selectedTrackId.value = document.value.tracks[0]?.id ?? null;
      selectedKeyframeIndex.value = 0;
      currentTime.value = 0;
      return;
    }

    const nextIndex = Math.min(deletedKeyframeIndex, track.keyframes.length - 1);
    const nextKeyframe = track.keyframes[nextIndex];

    selectedTrackId.value = trackId;
    selectedKeyframeIndex.value = nextIndex;

    if (nextKeyframe) {
      currentTime.value = Math.min(document.value.duration, nextKeyframe.time);
    }
  }

  function removeSelectedKeyframe() {
    const track = selectedTrack.value;

    if (!track || track.keyframes.length <= 1) {
      return;
    }

    track.keyframes.splice(selectedKeyframeIndex.value, 1);
    document.value = upsertTrack(document.value, { ...track });
    selectRemainingKeyframe(track.id, selectedKeyframeIndex.value);
  }

  function addKeyframeToTrack(trackId: string, time: number) {
    selectTrack(trackId);
    setCurrentTime(time);
    addKeyframe();
  }

  function removeKeyframe(trackId: string, keyframeIndex: number) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);

    if (!track || track.keyframes.length <= 1) {
      return;
    }

    track.keyframes.splice(keyframeIndex, 1);
    document.value = upsertTrack(document.value, { ...track });
    selectRemainingKeyframe(trackId, keyframeIndex);
  }

  function removeKeyframeRange(
    trackId: string,
    keyframeIndexStart: number,
    keyframeIndexEnd: number,
  ) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);

    if (!track || track.keyframes.length <= 1) {
      return;
    }

    const startIndex = Math.max(0, Math.min(keyframeIndexStart, track.keyframes.length - 1));
    const endIndex = Math.max(startIndex, Math.min(keyframeIndexEnd, track.keyframes.length - 1));
    const deleteCount = Math.min(endIndex - startIndex + 1, track.keyframes.length - 1);

    track.keyframes.splice(startIndex, deleteCount);
    document.value = upsertTrack(document.value, { ...track });
    selectRemainingKeyframe(trackId, startIndex);
  }

  function copyKeyframe(trackId: string, keyframeIndex: number) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);

    if (!track) {
      return;
    }

    if (track.kind === "expression") {
      const keyframe = track.keyframes[keyframeIndex];

      if (!keyframe) {
        return;
      }

      copiedKeyframe.value = { kind: "expression", value: keyframe.value };
      return;
    }

    if (track.kind === "hipsTranslation") {
      const keyframe = track.keyframes[keyframeIndex];

      if (!keyframe) {
        return;
      }

      copiedKeyframe.value = { kind: "hipsTranslation", value: [...keyframe.value] };
      return;
    }

    const keyframe = track.keyframes[keyframeIndex];

    if (!keyframe) {
      return;
    }

    copiedKeyframe.value = { kind: "rotation", value: [...keyframe.value] };
  }

  function copySelectedKeyframe() {
    const track = selectedTrack.value;

    if (!track) {
      return;
    }

    copyKeyframe(track.id, selectedKeyframeIndex.value);
  }

  function canPasteKeyframeToTrack(trackId: string) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);
    const keyframe = copiedKeyframe.value;

    if (!track || !keyframe) {
      return false;
    }

    return (
      (track.kind === "expression" && keyframe.kind === "expression") ||
      (track.kind === "hipsTranslation" && keyframe.kind === "hipsTranslation") ||
      ((track.kind === "boneRotation" || track.kind === "lookAtRotation") &&
        keyframe.kind === "rotation")
    );
  }

  function pasteKeyframeToTrack(trackId: string, time: number) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);
    const keyframe = copiedKeyframe.value;

    if (!track || !keyframe || !canPasteKeyframeToTrack(trackId)) {
      return;
    }

    const nextTime = Number(normalizeTime(time).toFixed(3));

    if (track.kind === "expression" && keyframe.kind === "expression") {
      track.keyframes.push({ time: nextTime, value: keyframe.value });
    } else if (track.kind === "hipsTranslation" && keyframe.kind === "hipsTranslation") {
      track.keyframes.push({ time: nextTime, value: [...keyframe.value] });
    } else if (
      (track.kind === "boneRotation" || track.kind === "lookAtRotation") &&
      keyframe.kind === "rotation"
    ) {
      track.keyframes.push({ time: nextTime, value: [...keyframe.value] });
    }

    document.value = upsertTrack(document.value, { ...track });
    selectedTrackId.value = trackId;
    currentTime.value = Math.min(document.value.duration, nextTime);

    const nextTrack = document.value.tracks.find((candidate) => candidate.id === trackId);
    selectedKeyframeIndex.value =
      nextTrack?.keyframes.findIndex((candidate) => candidate.time === nextTime) ?? 0;
  }

  function pasteSelectedKeyframeAtCurrentTime() {
    const track = selectedTrack.value;

    if (!track) {
      return;
    }

    pasteKeyframeToTrack(track.id, currentTime.value);
  }

  function moveKeyframe(trackId: string, keyframeIndex: number, time: number) {
    const track = document.value.tracks.find((candidate) => candidate.id === trackId);

    if (!track || !track.keyframes[keyframeIndex]) {
      return keyframeIndex;
    }

    const nextTime = normalizeTime(time);
    track.keyframes[keyframeIndex]!.time = nextTime;
    document.value = upsertTrack(document.value, { ...track });
    const nextTrack = document.value.tracks.find((candidate) => candidate.id === trackId);
    const nextIndex =
      nextTrack?.keyframes.findIndex((keyframe) => keyframe.time === nextTime) ?? -1;

    selectedTrackId.value = trackId;
    selectedKeyframeIndex.value = nextIndex >= 0 ? nextIndex : keyframeIndex;
    setCurrentTime(nextTime);
    return selectedKeyframeIndex.value;
  }

  function updateInterpolation(interpolation: Interpolation) {
    const track = selectedTrack.value;

    if (!track) {
      return;
    }

    document.value = upsertTrack(document.value, { ...track, interpolation });
  }

  function updateKeyframeTime(index: number, time: number) {
    const track = selectedTrack.value;

    if (!track) {
      return;
    }

    track.keyframes[index]!.time = normalizeTime(time);
    document.value = upsertTrack(document.value, { ...track });
  }

  function updateScalarValue(index: number, value: number) {
    const track = selectedTrack.value;

    if (track?.kind !== "expression") {
      return;
    }

    track.keyframes[index]!.value = value;
    document.value = upsertTrack(document.value, { ...track });
  }

  function updateVec3Value(index: number, axis: 0 | 1 | 2, value: number) {
    const track = selectedTrack.value;

    if (track?.kind !== "hipsTranslation") {
      return;
    }

    track.keyframes[index]!.value[axis] = value;
    document.value = upsertTrack(document.value, { ...track });
  }

  function updateVec4Value(index: number, axis: 0 | 1 | 2 | 3, value: number) {
    const track = selectedTrack.value;

    if (!track || (track.kind !== "boneRotation" && track.kind !== "lookAtRotation")) {
      return;
    }

    track.keyframes[index]!.value[axis] = value;
    document.value = upsertTrack(document.value, { ...track });
  }

  function updateRotationEulerValue(index: number, axis: 0 | 1 | 2, value: number) {
    const track = selectedTrack.value;

    if (!track || (track.kind !== "boneRotation" && track.kind !== "lookAtRotation")) {
      return;
    }

    const euler = quaternionToEulerDegrees(track.keyframes[index]!.value) as Vec3;
    euler[axis] = value;
    track.keyframes[index]!.value = eulerDegreesToQuaternion(euler);
    document.value = upsertTrack(document.value, { ...track });
  }

  function setBoneRotationAtCurrentTime(bone: HumanBoneName, rotation: Vec4) {
    selectOrCreateBoneRotationTrack(bone);
    const track = selectedTrack.value;

    if (track?.kind !== "boneRotation" || track.bone !== bone) {
      return;
    }

    const time = Number(currentTime.value.toFixed(3));
    const existingIndex = track.keyframes.findIndex(
      (keyframe) => Math.abs(keyframe.time - time) < 1 / 300,
    );

    if (existingIndex >= 0) {
      track.keyframes[existingIndex]!.value = [...rotation];
      document.value = upsertTrack(document.value, { ...track });
      selectedKeyframeIndex.value = existingIndex;
      return;
    }

    track.keyframes.push({ time, value: [...rotation] });
    document.value = upsertTrack(document.value, { ...track });
    const nextTrack = selectedTrack.value;
    selectedKeyframeIndex.value =
      nextTrack?.keyframes.findIndex((keyframe) => keyframe.time === time) ?? 0;
  }

  function updateDurationValue(value: number) {
    document.value = {
      ...document.value,
      duration: Math.max(0.1, normalizeTime(value)),
    };
  }

  function generateAnimation(kind: AnimationGeneratorKind) {
    const result = generateAnimationDocument(document.value, kind);
    document.value = result.document;
    selectedTrackId.value = result.selectedTrackId || document.value.tracks[0]?.id || null;
    selectedKeyframeIndex.value = 0;
    currentTime.value = Math.min(document.value.duration, result.previewTime);
  }

  watch(
    () => document.value.tracks.length,
    () => {
      if (!selectedTrackId.value && document.value.tracks[0]) {
        selectedTrackId.value = document.value.tracks[0].id;
      }
    },
  );

  return {
    addCustomExpressionTrack,
    addBoneRotationTrack,
    addKeyframe,
    addKeyframeToTrack,
    addHipsTranslationTrack,
    addLookAtTrack,
    addPresetExpressionTrack,
    currentTime,
    canPasteKeyframeToTrack,
    copiedKeyframe,
    copyKeyframe,
    copySelectedKeyframe,
    diagnostics,
    document,
    ensureLookAtTrack,
    exportText,
    exportBytes,
    generateAnimation,
    importAnimationFile,
    importVrmFile,
    isPlaying,
    newDocument,
    previewModelFile,
    previewModelName,
    presetExpressions: PRESET_EXPRESSION_NAMES,
    pasteKeyframeToTrack,
    pasteSelectedKeyframeAtCurrentTime,
    removeSelectedKeyframe,
    removeSelectedTrack,
    removeKeyframe,
    removeKeyframeRange,
    removeTrack,
    sampledPose,
    selectTrack,
    selectOrCreateBoneRotationTrack,
    selectedKeyframe,
    selectedKeyframeIndex,
    selectedTrack,
    selectedTrackId,
    setCurrentTime,
    setBoneRotationAtCurrentTime,
    stopPlayback,
    togglePlayback,
    updateDurationValue,
    updateInterpolation,
    updateKeyframeTime,
    updateScalarValue,
    updateVec3Value,
    updateVec4Value,
    updateRotationEulerValue,
    moveKeyframe,
  };
});
