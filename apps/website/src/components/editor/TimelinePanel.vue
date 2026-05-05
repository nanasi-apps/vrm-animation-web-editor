<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
  getHumanBoneLabelJa,
  HUMAN_BONE_NAMES,
  PRESET_EXPRESSION_NAMES,
} from "../../domain/vrma/constants";
import { getVrmaExportFileName } from "../../domain/vrma/io";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
const MIN_VISIBLE_TRACK_ROWS = 7;
const activeScrubLane = ref<HTMLElement | null>(null);
const addTrackMenuOpen = ref(false);
const contextMenu = ref<
  | { kind: "timeline"; trackId: string; time: number; x: number; y: number }
  | { kind: "track"; trackId: string; x: number; y: number }
  | {
      kind: "key";
      keyframeIndex: number;
      trackId: string;
      x: number;
      y: number;
    }
  | null
>(null);
const activeKeyDrag = ref<{
  keyframeIndex: number;
  lane: HTMLElement;
  trackId: string;
} | null>(null);

const timelineRows = computed(() => {
  const trackRows = editorStore.document.tracks.map((track) => ({
    empty: false,
    id: track.id,
    keyframes: track.keyframes,
    label:
      track.kind === "boneRotation"
        ? getHumanBoneLabelJa(track.bone)
        : track.kind === "expression"
          ? track.expressionName
          : track.kind === "hipsTranslation"
            ? "hips"
            : "lookAt",
    type: track.kind,
  }));
  const emptyRows = Array.from(
    { length: Math.max(0, MIN_VISIBLE_TRACK_ROWS - trackRows.length) },
    (_, index) => ({
      empty: true,
      id: `empty-${index}`,
      keyframes: [],
      label: "",
      type: "",
    }),
  );

  return [...trackRows, ...emptyRows];
});

const playheadPercent = computed(() => {
  if (editorStore.document.duration <= 0) {
    return 0;
  }

  return (editorStore.currentTime / editorStore.document.duration) * 100;
});

const availableBones = computed(() =>
  HUMAN_BONE_NAMES.filter(
    (bone) =>
      !editorStore.document.tracks.some(
        (track) => track.kind === "boneRotation" && track.bone === bone,
      ),
  ),
);

const availablePresetExpressions = computed(() =>
  PRESET_EXPRESSION_NAMES.filter(
    (expressionName) =>
      !editorStore.document.tracks.some(
        (track) => track.kind === "expression" && track.expressionName === expressionName,
      ),
  ),
);
const canExport = computed(
  () => !editorStore.diagnostics.some((diagnostic) => diagnostic.level === "error"),
);

function getExportFileName() {
  return getVrmaExportFileName(editorStore.document.fileName);
}

function downloadVrma() {
  if (!canExport.value) {
    return;
  }

  const blob = new Blob([editorStore.exportText], { type: "model/gltf+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getExportFileName();
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function positionPercent(time: number) {
  if (editorStore.document.duration <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (time / editorStore.document.duration) * 100));
}

function selectKey(trackId: string, keyframeIndex: number, time: number) {
  editorStore.selectTrack(trackId);
  editorStore.selectedKeyframeIndex = keyframeIndex;
  editorStore.setCurrentTime(time);
}

function timeFromLane(lane: HTMLElement, clientX: number) {
  const bounds = lane.getBoundingClientRect();
  const ratio = (clientX - bounds.left) / bounds.width;
  return editorStore.document.duration * Math.min(1, Math.max(0, ratio));
}

function seekFromLane(lane: HTMLElement, clientX: number) {
  editorStore.setCurrentTime(timeFromLane(lane, clientX));
}

function handleScrubMove(event: PointerEvent) {
  if (!activeScrubLane.value) {
    return;
  }

  seekFromLane(activeScrubLane.value, event.clientX);
}

function stopScrub() {
  activeScrubLane.value = null;
  window.removeEventListener("pointermove", handleScrubMove);
  window.removeEventListener("pointerup", stopScrub);
}

function startScrub(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  const lane = event.currentTarget as HTMLElement;
  activeScrubLane.value = lane;
  seekFromLane(lane, event.clientX);
  window.addEventListener("pointermove", handleScrubMove);
  window.addEventListener("pointerup", stopScrub, { once: true });
}

function handleKeyDragMove(event: PointerEvent) {
  if (!activeKeyDrag.value) {
    return;
  }

  activeKeyDrag.value.keyframeIndex = editorStore.moveKeyframe(
    activeKeyDrag.value.trackId,
    activeKeyDrag.value.keyframeIndex,
    timeFromLane(activeKeyDrag.value.lane, event.clientX),
  );
}

function stopKeyDrag() {
  activeKeyDrag.value = null;
  window.removeEventListener("pointermove", handleKeyDragMove);
  window.removeEventListener("pointerup", stopKeyDrag);
}

function startKeyDrag(event: PointerEvent, trackId: string, keyframeIndex: number) {
  if (event.button !== 0) {
    return;
  }

  const lane = (event.currentTarget as HTMLElement).closest(".key-lane") as HTMLElement | null;

  if (!lane) {
    return;
  }

  activeKeyDrag.value = { keyframeIndex, lane, trackId };
  selectKey(trackId, keyframeIndex, timeFromLane(lane, event.clientX));
  window.addEventListener("pointermove", handleKeyDragMove);
  window.addEventListener("pointerup", stopKeyDrag, { once: true });
}

function openTimelineMenu(event: MouseEvent, trackId: string) {
  event.preventDefault();
  const lane = event.currentTarget as HTMLElement;
  contextMenu.value = {
    kind: "timeline",
    time: timeFromLane(lane, event.clientX),
    trackId,
    x: event.clientX,
    y: event.clientY,
  };
}

function openRowTimelineMenu(event: MouseEvent, row: { empty: boolean; id: string }) {
  if (row.empty) {
    event.preventDefault();
    addTrackMenuOpen.value = true;
    return;
  }

  openTimelineMenu(event, row.id);
}

function startRowScrub(event: PointerEvent) {
  startScrub(event);
}

function openTrackMenu(event: MouseEvent, trackId: string) {
  event.preventDefault();
  contextMenu.value = {
    kind: "track",
    trackId,
    x: event.clientX,
    y: event.clientY,
  };
}

function openKeyMenu(event: MouseEvent, trackId: string, keyframeIndex: number) {
  event.preventDefault();
  contextMenu.value = {
    kind: "key",
    keyframeIndex,
    trackId,
    x: event.clientX,
    y: event.clientY,
  };
}

function closeMenus() {
  contextMenu.value = null;
  addTrackMenuOpen.value = false;
}

function addTimelineKey() {
  if (!contextMenu.value || contextMenu.value.kind !== "timeline") {
    return;
  }

  editorStore.addKeyframeToTrack(contextMenu.value.trackId, contextMenu.value.time);
  closeMenus();
}

function deleteContextTrack() {
  if (!contextMenu.value || contextMenu.value.kind !== "track") {
    return;
  }

  editorStore.removeTrack(contextMenu.value.trackId);
  closeMenus();
}

function deleteContextKey() {
  if (!contextMenu.value || contextMenu.value.kind !== "key") {
    return;
  }

  editorStore.removeKeyframe(contextMenu.value.trackId, contextMenu.value.keyframeIndex);
  closeMenus();
}

function addTrack(type: "hips" | "lookAt" | "bone" | "expression", name?: string) {
  if (type === "hips") {
    editorStore.addHipsTranslationTrack();
  } else if (type === "lookAt") {
    editorStore.addLookAtTrack();
  } else if (type === "bone" && name) {
    editorStore.addBoneRotationTrack(name as (typeof HUMAN_BONE_NAMES)[number]);
  } else if (type === "expression" && name) {
    editorStore.addPresetExpressionTrack(name);
  }

  addTrackMenuOpen.value = false;
}

onBeforeUnmount(() => {
  stopScrub();
  stopKeyDrag();
});
</script>

<template>
  <section class="timeline-panel" @click="contextMenu = null">
    <div class="timeline-header">
      <div>
        <strong>Timeline</strong>
        <span
          >{{ editorStore.currentTime.toFixed(3) }}s /
          {{ editorStore.document.duration.toFixed(3) }}s</span
        >
      </div>
      <div class="timeline-actions">
        <el-button size="small" @click="editorStore.setCurrentTime(0)">Rewind</el-button>
        <el-button type="primary" size="small" @click="editorStore.togglePlayback">
          {{ editorStore.isPlaying ? "Pause" : "Play" }}
        </el-button>
        <el-button size="small" @click="editorStore.addKeyframe">Add Key</el-button>
        <el-button size="small" @click.stop="addTrackMenuOpen = !addTrackMenuOpen"
          >Add Track</el-button
        >
        <el-button type="success" size="small" :disabled="!canExport" @click="downloadVrma">
          Export VRMA
        </el-button>
      </div>
    </div>

    <div v-if="addTrackMenuOpen" class="add-track-menu" @click.stop>
      <button
        type="button"
        :disabled="editorStore.document.tracks.some((track) => track.kind === 'hipsTranslation')"
        @click="addTrack('hips')"
      >
        Hips Translation
      </button>
      <button
        type="button"
        :disabled="editorStore.document.tracks.some((track) => track.kind === 'lookAtRotation')"
        @click="addTrack('lookAt')"
      >
        LookAt Rotation
      </button>
      <div class="menu-group-label">Bone Rotation</div>
      <button
        v-for="bone in availableBones"
        :key="bone"
        type="button"
        @click="addTrack('bone', bone)"
      >
        {{ getHumanBoneLabelJa(bone) }}
      </button>
      <div class="menu-group-label">Expression</div>
      <button
        v-for="expressionName in availablePresetExpressions"
        :key="expressionName"
        type="button"
        @click="addTrack('expression', expressionName)"
      >
        {{ expressionName }}
      </button>
    </div>

    <div class="time-ruler">
      <button
        v-for="mark in [0, 0.25, 0.5, 0.75, 1]"
        :key="mark"
        type="button"
        class="ruler-mark"
        :style="{ left: `${mark * 100}%` }"
        @click="editorStore.setCurrentTime(editorStore.document.duration * mark)"
      >
        {{ (editorStore.document.duration * mark).toFixed(1) }}s
      </button>
      <div class="playhead" :style="{ left: `${playheadPercent}%` }" />
    </div>

    <div class="timeline-body">
      <div
        class="track-playhead"
        :style="{
          left: `calc(150px + (100% - 150px) * ${playheadPercent / 100})`,
        }"
      />
      <div class="timeline-scroll">
        <div v-for="row in timelineRows" :key="row.id" class="track-row">
          <button
            type="button"
            class="track-label"
            :class="{
              active: row.id === editorStore.selectedTrackId,
              empty: row.empty,
            }"
            :disabled="row.empty"
            @click="!row.empty && editorStore.selectTrack(row.id)"
            @contextmenu="!row.empty && openTrackMenu($event, row.id)"
          >
            <span>{{ row.empty ? "" : row.label }}</span>
            <small>{{ row.empty ? "" : row.type }}</small>
          </button>
          <div
            class="key-lane"
            :class="{ empty: row.empty }"
            @contextmenu="openRowTimelineMenu($event, row)"
            @pointerdown="startRowScrub"
          >
            <button
              v-for="(keyframe, index) in row.keyframes"
              :key="`${row.id}-${index}-${keyframe.time}`"
              type="button"
              class="key-dot"
              :class="{
                active:
                  row.id === editorStore.selectedTrackId &&
                  index === editorStore.selectedKeyframeIndex,
              }"
              :style="{
                left: `${positionPercent(keyframe.time)}%`,
              }"
              :title="`${keyframe.time.toFixed(3)}s`"
              @click.stop="selectKey(row.id, index, keyframe.time)"
              @contextmenu.stop="openKeyMenu($event, row.id, index)"
              @pointerdown.stop="startKeyDrag($event, row.id, index)"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="contextMenu"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button v-if="contextMenu.kind === 'timeline'" type="button" @click="addTimelineKey">
        Add Key
      </button>
      <button v-if="contextMenu.kind === 'track'" type="button" @click="deleteContextTrack">
        Delete Track
      </button>
      <button v-if="contextMenu.kind === 'key'" type="button" @click="deleteContextKey">
        Delete Key
      </button>
    </div>
  </section>
</template>

<style scoped>
.timeline-panel {
  background: color-mix(in srgb, var(--el-bg-color) 78%, transparent);
  border: 1px solid var(--el-border-color);
  border-radius: 18px;
  display: grid;
  gap: 10px;
  grid-template-rows: auto 28px minmax(0, 1fr);
  min-height: 100%;
  padding: 10px;
  position: relative;
}

.timeline-header {
  align-items: center;
  display: flex;
  gap: 14px;
  justify-content: space-between;
}

.timeline-header div:first-child {
  display: grid;
  gap: 2px;
}

.timeline-header span,
.track-label small {
  color: var(--el-text-color-secondary);
  font-size: 0.78rem;
}

.timeline-actions {
  display: flex;
  gap: 8px;
}

.time-ruler {
  border-bottom: 1px solid var(--el-border-color);
  height: 28px;
  margin-left: 150px;
  position: relative;
}

.ruler-mark {
  background: transparent;
  border: 0;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 0.72rem;
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
}

.ruler-mark::after {
  background: var(--el-border-color);
  content: "";
  height: 10px;
  left: 50%;
  position: absolute;
  top: 18px;
  width: 1px;
}

.playhead {
  background: var(--el-color-primary);
  bottom: -100%;
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  width: 2px;
  z-index: 2;
}

.timeline-body {
  height: 100%;
  min-height: 0;
  position: relative;
}

.track-playhead {
  background: var(--el-color-primary);
  bottom: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  width: 2px;
  z-index: 4;
}

.timeline-scroll {
  display: grid;
  grid-template-rows: repeat(7, minmax(46px, 1fr));
  height: 100%;
  max-height: none;
  overflow: hidden;
  padding-right: 4px;
}

.track-row {
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: grid;
  gap: 0;
  grid-template-columns: 150px minmax(0, 1fr);
  height: 100%;
  min-height: 46px;
}

.track-row:first-child {
  border-top: 1px solid var(--el-border-color-lighter);
}

.track-label {
  background: transparent;
  border: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  border-radius: 0;
  color: var(--el-text-color-primary);
  cursor: pointer;
  display: grid;
  height: 100%;
  min-height: 0;
  padding: 7px 10px;
  text-align: left;
}

.track-label.active {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  color: var(--el-color-primary);
}

.track-label.empty {
  cursor: default;
}

.key-lane {
  background: linear-gradient(90deg, rgba(130, 160, 210, 0.12) 1px, transparent 1px), transparent;
  background-size: 25% 100%;
  border-radius: 0;
  cursor: pointer;
  height: 100%;
  position: relative;
  user-select: none;
}

.key-lane::before {
  background: var(--el-fill-color-lighter);
  border-radius: 0;
  content: "";
  height: 100%;
  left: 0;
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}

.key-dot {
  background: #f0c14b;
  border: 2px solid rgba(40, 24, 0, 0.3);
  border-radius: 4px;
  cursor: pointer;
  height: 13px;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) rotate(45deg);
  width: 13px;
  z-index: 2;
}

.key-dot.active {
  background: var(--el-color-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

.add-track-menu,
.context-menu {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
  display: grid;
  gap: 4px;
  padding: 8px;
  z-index: 10;
}

.add-track-menu {
  max-height: 360px;
  overflow: auto;
  position: absolute;
  right: 10px;
  top: 48px;
  width: 220px;
}

.context-menu {
  min-width: 140px;
  position: fixed;
}

.add-track-menu button,
.context-menu button {
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  padding: 7px 9px;
  text-align: left;
}

.add-track-menu button:hover,
.context-menu button:hover {
  background: var(--el-fill-color-light);
}

.add-track-menu button:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.menu-group-label {
  color: var(--el-text-color-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 8px 9px 2px;
  text-transform: uppercase;
}
</style>
