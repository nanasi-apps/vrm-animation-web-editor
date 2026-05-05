<script setup lang="ts">
import FileImportPanel from "../components/editor/FileImportPanel.vue";
import KeyframeInspector from "../components/editor/KeyframeInspector.vue";
import PreviewViewport from "../components/editor/PreviewViewport.vue";
import TimelinePanel from "../components/editor/TimelinePanel.vue";
</script>

<template>
  <section class="unsupported-device">
    <strong>Unsupported device</strong>
    <span>このエディターは横幅 1350px 以上の画面で使用してください。</span>
  </section>

  <main class="mmd-workbench">
    <aside class="tool-rail left-rail">
      <FileImportPanel />
    </aside>

    <section class="stage-column">
      <PreviewViewport />
      <TimelinePanel />
    </section>

    <aside class="tool-rail right-rail">
      <KeyframeInspector />
    </aside>
  </main>
</template>

<style scoped>
.mmd-workbench {
  align-items: stretch;
  display: grid;
  gap: 12px;
  grid-template-columns: 270px minmax(520px, 1fr) 330px;
  height: calc(100vh - 16px);
  overflow: hidden;
  width: 100%;
}

.unsupported-device {
  align-items: center;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 18px;
  display: none;
  gap: 8px;
  justify-items: center;
  margin: 24px auto;
  max-width: 520px;
  padding: 28px;
  text-align: center;
}

.unsupported-device strong {
  font-size: 1.2rem;
}

.unsupported-device span {
  color: var(--el-text-color-secondary);
}

.tool-rail,
.stage-column {
  display: grid;
  gap: 12px;
}

.left-rail,
.right-rail {
  align-content: start;
}

.stage-column {
  grid-template-rows: minmax(460px, 3fr) minmax(230px, 1fr);
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 1349px) {
  .mmd-workbench {
    display: none;
  }

  .unsupported-device {
    display: grid;
  }
}
</style>
