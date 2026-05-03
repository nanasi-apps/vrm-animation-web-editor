<script setup lang="ts">
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
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
</style>
