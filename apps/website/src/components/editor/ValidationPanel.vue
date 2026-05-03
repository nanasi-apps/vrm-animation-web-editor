<script setup lang="ts">
import { computed } from "vue";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();

const groupedDiagnostics = computed(() => ({
  errors: editorStore.diagnostics.filter((diagnostic) => diagnostic.level === "error"),
  infos: editorStore.diagnostics.filter((diagnostic) => diagnostic.level === "info"),
  warnings: editorStore.diagnostics.filter((diagnostic) => diagnostic.level === "warning"),
}));
</script>

<template>
  <el-card shadow="hover" class="panel-card">
    <template #header>
      <div class="card-header">
        <span>Validation</span>
        <el-tag :type="groupedDiagnostics.errors.length ? 'danger' : 'success'" round>
          {{
            groupedDiagnostics.errors.length
              ? `${groupedDiagnostics.errors.length} blocking issue(s)`
              : "Ready to export"
          }}
        </el-tag>
      </div>
    </template>

    <el-space direction="vertical" fill :size="12">
      <el-alert
        v-for="diagnostic in editorStore.diagnostics"
        :key="`${diagnostic.code}-${diagnostic.message}`"
        :closable="false"
        :show-icon="true"
        :title="diagnostic.message"
        :type="
          diagnostic.level === 'error'
            ? 'error'
            : diagnostic.level === 'warning'
              ? 'warning'
              : 'info'
        "
      />
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
</style>
