<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  getHumanBoneLabelJa,
  HUMAN_BONE_NAMES,
  PRESET_EXPRESSION_NAMES,
} from "../../domain/vrma/constants";
import { getVrmaExportFileName } from "../../domain/vrma/io";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
const MAX_KEY_DOTS_PER_ROW = 1000;
const SIMILAR_KEYFRAME_VALUE_EPSILON = 0.08;
const MIN_VISIBLE_TRACK_ROWS = 7;
const MIN_TIMELINE_ZOOM = 1;
const MAX_TIMELINE_ZOOM = 4;
const TIMELINE_ROW_HEIGHT = 46;
const VIRTUAL_ROW_OVERSCAN = 4;
const activeScrubLane = ref<HTMLElement | null>(null);
const addTrackMenuOpen = ref(false);
const timelineScroll = ref<HTMLElement | null>(null);
const timelineScrollLeft = ref(0);
const timelineScrollTop = ref(0);
const timelineViewportHeight = ref(TIMELINE_ROW_HEIGHT * MIN_VISIBLE_TRACK_ROWS);
const timelineZoom = ref(1);
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

type TimelineKeyframe = (typeof editorStore.document.tracks)[number]["keyframes"][number];
type DisplayKeyframe = {
  keyframe: TimelineKeyframe;
  keyframeCount: number;
  keyframeIndex: number;
};

interface TimelineRow {
  displayKeyframes: DisplayKeyframe[];
  empty: boolean;
  id: string;
  keyframes: TimelineKeyframe[];
  label: string;
  type: string;
}

interface VirtualTimelineRow {
  index: number;
  row: TimelineRow;
}

function getKeyframeValues(keyframe: TimelineKeyframe) {
  return Array.isArray(keyframe.value) ? keyframe.value : [keyframe.value];
}

function getKeyframeValueDelta(left: TimelineKeyframe, right: TimelineKeyframe) {
  const leftValues = getKeyframeValues(left);
  const rightValues = getKeyframeValues(right);
  const valueCount = Math.min(leftValues.length, rightValues.length);
  let largestDelta = 0;

  for (let index = 0; index < valueCount; index += 1) {
    largestDelta = Math.max(
      largestDelta,
      Math.abs((leftValues[index] ?? 0) - (rightValues[index] ?? 0)),
    );
  }

  return largestDelta;
}

function getValueClusteredKeyframes(keyframes: TimelineKeyframe[]) {
  const displayKeyframes: DisplayKeyframe[] = [];
  let currentCluster: DisplayKeyframe | null = null;

  for (const [keyframeIndex, keyframe] of keyframes.entries()) {
    if (
      currentCluster &&
      getKeyframeValueDelta(currentCluster.keyframe, keyframe) <= SIMILAR_KEYFRAME_VALUE_EPSILON
    ) {
      currentCluster.keyframeCount += 1;
      continue;
    }

    currentCluster = {
      keyframe,
      keyframeCount: 1,
      keyframeIndex,
    };
    displayKeyframes.push(currentCluster);
  }

  return displayKeyframes;
}

function getDisplayKeyframes(row: Pick<TimelineRow, "id" | "keyframes">) {
  const maxKeyDots = Math.max(1, Math.floor(MAX_KEY_DOTS_PER_ROW * timelineZoom.value));
  const buckets = new Map<number, DisplayKeyframe>();

  for (const displayKeyframe of getValueClusteredKeyframes(row.keyframes)) {
    const { keyframe, keyframeCount, keyframeIndex } = displayKeyframe;
    const bucketIndex = Math.floor((positionPercent(keyframe.time) / 100) * (maxKeyDots - 1));
    const existingBucket = buckets.get(bucketIndex);

    if (existingBucket) {
      existingBucket.keyframeCount += keyframeCount;
      continue;
    }

    buckets.set(bucketIndex, {
      keyframe,
      keyframeCount,
      keyframeIndex,
    });
  }

  buckets.set(-1, { keyframe: row.keyframes[0]!, keyframeCount: 1, keyframeIndex: 0 });
  buckets.set(maxKeyDots, {
    keyframe: row.keyframes[row.keyframes.length - 1]!,
    keyframeCount: 1,
    keyframeIndex: row.keyframes.length - 1,
  });

  if (row.id === editorStore.selectedTrackId) {
    const selectedKeyframe = row.keyframes[editorStore.selectedKeyframeIndex];

    if (selectedKeyframe) {
      buckets.set(maxKeyDots + 1, {
        keyframe: selectedKeyframe,
        keyframeCount: 1,
        keyframeIndex: editorStore.selectedKeyframeIndex,
      });
    }
  }

  const seenIndexes = new Set<number>();

  return [...buckets.values()]
    .sort((left, right) => left.keyframe.time - right.keyframe.time)
    .filter((displayKeyframe) => {
      if (seenIndexes.has(displayKeyframe.keyframeIndex)) {
        return false;
      }

      seenIndexes.add(displayKeyframe.keyframeIndex);
      return true;
    });
}

const timelineRows = computed(() => {
  const trackRows: TimelineRow[] = editorStore.document.tracks.map((track) => {
    const row = {
      displayKeyframes: [],
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
    } satisfies TimelineRow;

    return {
      ...row,
      displayKeyframes: getDisplayKeyframes(row),
    };
  });
  const emptyRows = Array.from(
    { length: Math.max(0, MIN_VISIBLE_TRACK_ROWS - trackRows.length) },
    (_, index) => ({
      displayKeyframes: [],
      empty: true,
      id: `empty-${index}`,
      keyframes: [],
      label: "",
      type: "",
    }),
  );

  return [...trackRows, ...emptyRows];
});

const totalRowsHeight = computed(() => timelineRows.value.length * TIMELINE_ROW_HEIGHT);
const visibleRowStart = computed(() => {
  const maxStart = Math.max(0, timelineRows.value.length - 1);
  const rawStart = Math.floor(timelineScrollTop.value / TIMELINE_ROW_HEIGHT) - VIRTUAL_ROW_OVERSCAN;

  return Math.min(maxStart, Math.max(0, rawStart));
});
const visibleRowEnd = computed(() => {
  const visibleCount = Math.ceil(timelineViewportHeight.value / TIMELINE_ROW_HEIGHT);

  return Math.min(
    timelineRows.value.length,
    visibleRowStart.value + visibleCount + VIRTUAL_ROW_OVERSCAN * 2,
  );
});
const virtualRows = computed<VirtualTimelineRow[]>(() =>
  timelineRows.value.slice(visibleRowStart.value, visibleRowEnd.value).map((row, offset) => ({
    index: visibleRowStart.value + offset,
    row,
  })),
);
const virtualWindowTop = computed(() => `${visibleRowStart.value * TIMELINE_ROW_HEIGHT}px`);
const virtualSpacerHeight = computed(() => `${totalRowsHeight.value}px`);

const playheadPercent = computed(() => {
  if (editorStore.document.duration <= 0) {
    return 0;
  }

  return (editorStore.currentTime / editorStore.document.duration) * 100;
});

const timelineWidth = computed(() => `calc(150px + (100% - 150px) * ${timelineZoom.value})`);
const timelineLaneWidth = computed(() => `${timelineZoom.value * 100}%`);
const rulerOffset = computed(() => `translateX(-${timelineScrollLeft.value}px)`);
const trackPlayheadLeft = computed(() => {
  const ratio = playheadPercent.value / 100;

  return `calc(150px + (100% - 150px) * ${timelineZoom.value * ratio} - ${timelineScrollLeft.value}px)`;
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

function handleTimelineScroll(event: Event) {
  const scrollArea = event.currentTarget as HTMLElement;

  timelineScrollLeft.value = scrollArea.scrollLeft;
  timelineScrollTop.value = scrollArea.scrollTop;
  timelineViewportHeight.value = scrollArea.clientHeight;
}

function scrollToKeepPlayheadVisible() {
  const scrollArea = timelineScroll.value;

  if (!scrollArea || !editorStore.isPlaying || timelineZoom.value <= 1) {
    return;
  }

  const ratio = playheadPercent.value / 100;
  const playheadX = 150 + (scrollArea.scrollWidth - 150) * ratio;
  const playheadLeft = playheadX - scrollArea.scrollLeft;
  const margin = 48;
  const minVisibleLeft = 150 + margin;
  const maxVisibleLeft = scrollArea.clientWidth - margin;

  if (playheadLeft > maxVisibleLeft) {
    scrollArea.scrollLeft = playheadX - maxVisibleLeft;
  } else if (playheadLeft < minVisibleLeft) {
    scrollArea.scrollLeft = playheadX - minVisibleLeft;
  }

  timelineScrollLeft.value = scrollArea.scrollLeft;
}

function handleTimelineWheel(event: WheelEvent) {
  const scrollArea = event.currentTarget as HTMLElement;

  event.preventDefault();

  if (!event.altKey) {
    if (event.shiftKey) {
      scrollArea.scrollLeft += event.deltaX || event.deltaY;
    } else {
      scrollArea.scrollTop += event.deltaY;
      scrollArea.scrollLeft += event.deltaX;
    }
    return;
  }

  const previousZoom = timelineZoom.value;
  const nextZoom = Math.min(
    MAX_TIMELINE_ZOOM,
    Math.max(MIN_TIMELINE_ZOOM, Number((timelineZoom.value - event.deltaY * 0.002).toFixed(2))),
  );

  if (nextZoom === previousZoom) {
    return;
  }

  const bounds = scrollArea.getBoundingClientRect();
  const pointerX = event.clientX - bounds.left;
  const timelineX = scrollArea.scrollLeft + pointerX;
  timelineZoom.value = nextZoom;
  void nextTick(() => {
    scrollArea.scrollLeft = (timelineX / previousZoom) * nextZoom - pointerX;
    timelineScrollLeft.value = scrollArea.scrollLeft;
  });
}

watch(
  () => editorStore.currentTime,
  () => {
    scrollToKeepPlayheadVisible();
  },
);

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

function copyContextKey() {
  if (!contextMenu.value || contextMenu.value.kind !== "key") {
    return;
  }

  editorStore.copyKeyframe(contextMenu.value.trackId, contextMenu.value.keyframeIndex);
  closeMenus();
}

function pasteContextKey() {
  if (!contextMenu.value || contextMenu.value.kind !== "timeline") {
    return;
  }

  editorStore.pasteKeyframeToTrack(contextMenu.value.trackId, contextMenu.value.time);
  closeMenus();
}

function isEditingText(event: KeyboardEvent) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function handleKeyShortcut(event: KeyboardEvent) {
  if (
    (!event.ctrlKey && !event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    isEditingText(event)
  ) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "c" && editorStore.selectedKeyframe) {
    event.preventDefault();
    editorStore.copySelectedKeyframe();
    return;
  }

  if (
    key === "v" &&
    editorStore.selectedTrack &&
    editorStore.canPasteKeyframeToTrack(editorStore.selectedTrack.id)
  ) {
    event.preventDefault();
    editorStore.pasteSelectedKeyframeAtCurrentTime();
  }
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

onMounted(() => {
  void nextTick(() => {
    if (timelineScroll.value) {
      timelineViewportHeight.value = timelineScroll.value.clientHeight;
    }
  });
  window.addEventListener("keydown", handleKeyShortcut);
});

onBeforeUnmount(() => {
  stopScrub();
  stopKeyDrag();
  window.removeEventListener("keydown", handleKeyShortcut);
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
        <el-button
          size="small"
          :disabled="!editorStore.selectedKeyframe"
          @click="editorStore.copySelectedKeyframe"
          >Copy Key</el-button
        >
        <el-button
          size="small"
          :disabled="
            !editorStore.selectedTrack ||
            !editorStore.canPasteKeyframeToTrack(editorStore.selectedTrack.id)
          "
          @click="editorStore.pasteSelectedKeyframeAtCurrentTime"
          >Paste Key</el-button
        >
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
      <div class="ruler-track" :style="{ transform: rulerOffset, width: timelineLaneWidth }">
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
    </div>

    <div class="timeline-body">
      <div class="track-playhead" :style="{ left: trackPlayheadLeft }" />
      <div
        ref="timelineScroll"
        class="timeline-scroll"
        @scroll="handleTimelineScroll"
        @wheel="handleTimelineWheel"
      >
        <div
          class="timeline-virtual-spacer"
          :style="{ height: virtualSpacerHeight, width: timelineWidth }"
        >
          <div class="timeline-virtual-window" :style="{ top: virtualWindowTop }">
            <div v-for="virtualRow in virtualRows" :key="virtualRow.row.id" class="track-row">
              <button
                type="button"
                class="track-label"
                :class="{
                  active: virtualRow.row.id === editorStore.selectedTrackId,
                  empty: virtualRow.row.empty,
                }"
                :disabled="virtualRow.row.empty"
                @click="!virtualRow.row.empty && editorStore.selectTrack(virtualRow.row.id)"
                @contextmenu="!virtualRow.row.empty && openTrackMenu($event, virtualRow.row.id)"
              >
                <span>{{ virtualRow.row.empty ? "" : virtualRow.row.label }}</span>
                <small>{{ virtualRow.row.empty ? "" : virtualRow.row.type }}</small>
              </button>
              <div
                class="key-lane"
                :class="{ empty: virtualRow.row.empty }"
                @contextmenu="openRowTimelineMenu($event, virtualRow.row)"
                @pointerdown="startRowScrub"
              >
                <button
                  v-for="displayKeyframe in virtualRow.row.displayKeyframes"
                  :key="`${virtualRow.row.id}-${displayKeyframe.keyframeIndex}-${displayKeyframe.keyframe.time}`"
                  type="button"
                  class="key-dot"
                  :aria-label="
                    displayKeyframe.keyframeCount > 1
                      ? `${displayKeyframe.keyframeCount} keyframes around ${displayKeyframe.keyframe.time.toFixed(3)}s`
                      : `Keyframe at ${displayKeyframe.keyframe.time.toFixed(3)}s`
                  "
                  :class="{
                    active:
                      virtualRow.row.id === editorStore.selectedTrackId &&
                      displayKeyframe.keyframeIndex === editorStore.selectedKeyframeIndex,
                    clustered: displayKeyframe.keyframeCount > 1,
                  }"
                  :style="{
                    left: `${positionPercent(displayKeyframe.keyframe.time)}%`,
                  }"
                  :title="
                    displayKeyframe.keyframeCount > 1
                      ? `${displayKeyframe.keyframe.time.toFixed(3)}s (${displayKeyframe.keyframeCount} keys)`
                      : `${displayKeyframe.keyframe.time.toFixed(3)}s`
                  "
                  @click.stop="
                    selectKey(
                      virtualRow.row.id,
                      displayKeyframe.keyframeIndex,
                      displayKeyframe.keyframe.time,
                    )
                  "
                  @contextmenu.stop="
                    openKeyMenu($event, virtualRow.row.id, displayKeyframe.keyframeIndex)
                  "
                  @pointerdown.stop="
                    startKeyDrag($event, virtualRow.row.id, displayKeyframe.keyframeIndex)
                  "
                />
              </div>
            </div>
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
      <button
        v-if="contextMenu.kind === 'timeline'"
        type="button"
        :disabled="!editorStore.canPasteKeyframeToTrack(contextMenu.trackId)"
        @click="pasteContextKey"
      >
        Paste Key
      </button>
      <button v-if="contextMenu.kind === 'track'" type="button" @click="deleteContextTrack">
        Delete Track
      </button>
      <button v-if="contextMenu.kind === 'key'" type="button" @click="copyContextKey">
        Copy Key
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
  overflow: hidden;
  position: relative;
}

.ruler-track {
  height: 100%;
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
  height: 100%;
  max-height: none;
  overflow: auto;
  padding-right: 4px;
  position: relative;
  scrollbar-width: none;
}

.timeline-scroll::-webkit-scrollbar {
  display: none;
}

.timeline-virtual-spacer {
  min-height: 100%;
  position: relative;
}

.timeline-virtual-window {
  left: 0;
  position: absolute;
  right: 0;
}

.track-row {
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: grid;
  gap: 0;
  grid-template-columns: 150px minmax(0, 1fr);
  height: 46px;
}

.track-row:first-child {
  border-top: 1px solid var(--el-border-color-lighter);
}

.track-label {
  background: var(--el-bg-color);
  border: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  border-radius: 0;
  color: var(--el-text-color-primary);
  cursor: pointer;
  display: grid;
  height: 100%;
  min-height: 0;
  padding: 7px 10px;
  position: sticky;
  left: 0;
  text-align: left;
  z-index: 3;
}

.track-label.active {
  background: color-mix(in srgb, var(--el-bg-color) 92%, var(--el-color-primary));
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

.key-dot.clustered {
  border-color: rgba(40, 24, 0, 0.5);
  box-shadow: 0 0 0 3px rgba(240, 193, 75, 0.18);
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

.add-track-menu button:disabled,
.context-menu button:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.context-menu button:disabled:hover {
  background: transparent;
}

.menu-group-label {
  color: var(--el-text-color-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 8px 9px 2px;
  text-transform: uppercase;
}
</style>
