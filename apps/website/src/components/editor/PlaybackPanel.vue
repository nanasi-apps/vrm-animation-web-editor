<script setup lang="ts">
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();

function numberInputValue(event: Event) {
  const input = event.target as HTMLInputElement;
  const nextValue = Number(input.value);

  return Number.isFinite(nextValue) ? nextValue : editorStore.document.duration;
}
</script>

<template>
  <el-card shadow="hover" class="panel-card transport-card">
    <template #header>
      <div class="card-header">
        <span>Playback</span>
        <el-tag type="success" round>30 FPS editing grid</el-tag>
      </div>
    </template>

    <el-space direction="vertical" fill :size="14">
      <div class="transport-row">
        <el-button type="primary" @click="editorStore.togglePlayback">
          {{ editorStore.isPlaying ? "Pause" : "Play" }}
        </el-button>
        <el-button plain @click="editorStore.setCurrentTime(0)">Rewind</el-button>
        <el-button plain @click="editorStore.addKeyframe">Add current pose key</el-button>
        <el-button plain @click="editorStore.removeSelectedKeyframe">Delete selected key</el-button>
      </div>

      <el-slider
        :max="editorStore.document.duration"
        :min="0"
        :model-value="editorStore.currentTime"
        :step="1 / 30"
        @update:model-value="
          (value) => editorStore.setCurrentTime(Array.isArray(value) ? (value[0] ?? 0) : value)
        "
      />

      <el-descriptions :column="2" border>
        <el-descriptions-item label="Current time">
          {{ editorStore.currentTime.toFixed(3) }}s
        </el-descriptions-item>
        <el-descriptions-item label="Selected track">
          {{ editorStore.selectedTrack?.kind ?? "None" }}
        </el-descriptions-item>
      </el-descriptions>

      <label class="duration-control">
        <span>Duration</span>
        <input
          class="duration-input"
          :value="editorStore.document.duration.toFixed(1)"
          min="0.1"
          step="0.1"
          type="number"
          @change="(event) => editorStore.updateDurationValue(numberInputValue(event))"
        />
        <small>seconds</small>
      </label>
    </el-space>
  </el-card>
</template>

<style scoped>
.panel-card {
  border-radius: 18px;
}

.transport-card {
  --el-card-padding: 10px;
}

.card-header,
.transport-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
}

.transport-row {
  justify-content: flex-start;
}

.duration-control {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: auto 92px auto;
  justify-content: start;
}

.duration-control span,
.duration-control small {
  color: var(--el-text-color-secondary);
  font-size: 0.78rem;
  font-weight: 700;
}

.duration-input {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-primary);
  font: inherit;
  height: 32px;
  padding: 0 8px;
  width: 100%;
}

.duration-input:focus {
  border-color: var(--el-color-primary);
  outline: none;
}
</style>
