<script setup lang="ts">
import { computed } from "vue";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
const canExport = computed(
  () => !editorStore.diagnostics.some((diagnostic) => diagnostic.level === "error"),
);

function download() {
  const blob = new Blob([editorStore.exportText], { type: "model/gltf+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = editorStore.document.fileName.endsWith(".gltf")
    ? editorStore.document.fileName
    : "vrm-animation.gltf";
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <el-card shadow="hover" class="panel-card">
    <template #header>
      <div class="card-header">
        <span>Export</span>
        <el-tag type="primary" round>VRMC_vrm_animation</el-tag>
      </div>
    </template>

    <el-space direction="vertical" fill :size="16">
      <el-alert
        :closable="false"
        show-icon
        :title="
          canExport
            ? 'The document is ready to export as embedded JSON glTF.'
            : 'Resolve blocking validation errors before export.'
        "
        :type="canExport ? 'success' : 'error'"
      />

      <el-button :disabled="!canExport" type="primary" @click="download">Download .gltf</el-button>

      <pre class="export-preview"
        >{{ editorStore.exportText.slice(0, 1200)
        }}{{ editorStore.exportText.length > 1200 ? "\n…" : "" }}</pre
      >
    </el-space>
  </el-card>
</template>

<style scoped>
.panel-card {
  border-radius: 24px;
}

.card-header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.export-preview {
  background: rgba(8, 12, 19, 0.92);
  border-radius: 16px;
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 16px;
}

html:not(.dark) .export-preview {
  background: rgba(240, 246, 255, 0.95);
}
</style>
