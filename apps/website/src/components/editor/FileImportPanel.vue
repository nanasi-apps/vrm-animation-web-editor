<script setup lang="ts">
import { ref } from "vue";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
const importError = ref("");

async function handleVrmFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  try {
    importError.value = "";
    await editorStore.importVrmFile(file);
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

async function handleAnimationFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  try {
    importError.value = "";
    await editorStore.importAnimationFile(file);
  } catch (error) {
    importError.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}
</script>

<template>
  <el-card shadow="hover" class="panel-card">
    <el-space direction="vertical" fill :size="16">
      <div class="button-grid">
        <el-button type="primary" @click="editorStore.newDocument">New Animation</el-button>
        <label class="import-button">
          <input accept=".vrm" type="file" class="hidden-input" @change="handleVrmFile" />
          <span>Import .vrm</span>
        </label>
        <label class="import-button">
          <input
            accept=".vrma,.gltf,.json"
            type="file"
            class="hidden-input"
            @change="handleAnimationFile"
          />
          <span>Load Existing Animation</span>
        </label>
      </div>

      <el-alert
        v-if="importError"
        :closable="false"
        show-icon
        title="Import failed"
        type="error"
        :description="importError"
      />

      <el-descriptions :column="1" border>
        <el-descriptions-item label="VRM model">
          <code>{{ editorStore.previewModelName || "Not loaded" }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="Spec version">
          <code>{{ editorStore.document.specVersion }}</code>
        </el-descriptions-item>
      </el-descriptions>
    </el-space>
  </el-card>
</template>

<style scoped>
.panel-card {
  border-radius: 18px;
}

.panel-card :deep(.el-card__body) {
  padding: 14px;
}

.button-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
}

.import-button {
  align-items: center;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  cursor: pointer;
  display: inline-flex;
  font-weight: 600;
  justify-content: center;
  min-height: 34px;
}

.hidden-input {
  display: none;
}
</style>
