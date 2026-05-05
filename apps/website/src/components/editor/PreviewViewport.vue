<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createVrmPreviewController } from "../../domain/vrma/preview";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const importError = ref("");

let controller: ReturnType<typeof createVrmPreviewController> | null = null;

onMounted(() => {
  if (!canvasRef.value) {
    return;
  }

  controller = createVrmPreviewController(canvasRef.value, {
    onBoneRotationChange: (bone, rotation) => {
      editorStore.setBoneRotationAtCurrentTime(bone, rotation);
    },
    onBoneSelect: (bone) => {
      editorStore.selectOrCreateBoneRotationTrack(bone);
    },
  });
});

onBeforeUnmount(() => {
  controller?.dispose();
  controller = null;
});

watch(
  () => editorStore.previewModelFile,
  async (file) => {
    if (!file || !controller) {
      return;
    }

    try {
      importError.value = "";
      await controller.loadFile(file);
      controller.applyPose(editorStore.sampledPose);
    } catch (error) {
      importError.value = error instanceof Error ? error.message : String(error);
    }
  },
  { immediate: true },
);

watch(
  () => editorStore.sampledPose,
  (pose) => {
    controller?.applyPose(pose);
  },
);
</script>

<template>
  <div class="preview-layout">
    <canvas ref="canvasRef" class="viewport" />
    <el-alert
      v-if="importError"
      class="preview-error"
      :closable="false"
      show-icon
      title="VRM preview failed"
      type="error"
      :description="importError"
    />
  </div>
</template>

<style scoped>
.panel-card {
  border-radius: 18px;
}

.panel-card :deep(.el-card__body) {
  padding: 12px;
}

.preview-card {
  min-height: 100%;
}

.preview-layout {
  display: grid;
  gap: 10px;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  position: relative;
}

.viewport {
  background:
    radial-gradient(circle at top, rgba(108, 155, 255, 0.28), transparent 45%),
    linear-gradient(180deg, rgba(6, 13, 23, 0.96), rgba(15, 24, 39, 0.94));
  border: 1px solid rgba(116, 149, 204, 0.24);
  border-radius: 16px;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.preview-error {
  position: absolute;
}
</style>
