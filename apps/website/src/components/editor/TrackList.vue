<script setup lang="ts">
import { computed } from "vue";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();

const trackRows = computed(() =>
  editorStore.document.tracks.map((track) => ({
    id: track.id,
    interpolation: track.interpolation,
    kind: track.kind,
    label:
      track.kind === "boneRotation"
        ? `${track.bone} rotation`
        : track.kind === "expression"
          ? `${track.expressionName} weight`
          : track.kind === "hipsTranslation"
            ? "hips translation"
            : "lookAt rotation",
  })),
);
</script>

<template>
  <el-card shadow="hover" class="panel-card">
    <el-table
      :data="trackRows"
      height="220"
      stripe
      @row-click="(row) => editorStore.selectTrack(row.id)"
    >
      <el-table-column label="Track" min-width="180">
        <template #default="{ row }">
          <button
            class="track-button"
            :class="{ active: row.id === editorStore.selectedTrackId }"
            @click="editorStore.selectTrack(row.id)"
          >
            {{ row.label }}
          </button>
        </template>
      </el-table-column>
      <el-table-column label="Type" prop="kind" width="150" />
      <el-table-column label="Interpolation" prop="interpolation" width="120" />
    </el-table>

    <div class="track-actions">
      <el-button plain @click="editorStore.removeSelectedTrack"
        >Remove selected optional track</el-button
      >
    </div>
  </el-card>
</template>

<style scoped>
.panel-card {
  border-radius: 18px;
}

.panel-card :deep(.el-card__body) {
  padding: 12px;
}

.track-button {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}

.track-button.active {
  color: var(--el-color-primary);
  font-weight: 700;
}

.track-actions {
  margin-top: 12px;
}
</style>
