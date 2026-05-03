<script setup lang="ts">
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();

const generators = [
  {
    description: "spine と chest の回転キーで、呼吸のような待機モーションを生成します。",
    kind: "idle",
    label: "Idle",
  },
  {
    description: "rightUpperArm / rightLowerArm の回転キーで、手を振る動きを生成します。",
    kind: "wave",
    label: "Wave",
  },
  {
    description: "blink の Expression ウェイトキーを生成します。",
    kind: "blink",
    label: "Blink",
  },
  {
    description: "LookAt の視線方向クォータニオンキーを生成します。",
    kind: "lookAround",
    label: "LookAt",
  },
] as const;
</script>

<template>
  <el-card shadow="hover" class="panel-card">
    <template #header>
      <div class="card-header">
        <span>Animation Generator</span>
        <el-tag type="success" round>VRMC_vrm_animation</el-tag>
      </div>
    </template>

    <div class="generator-grid">
      <button
        v-for="generator in generators"
        :key="generator.kind"
        class="generator-button"
        type="button"
        @click="editorStore.generateAnimation(generator.kind)"
      >
        <strong>{{ generator.label }}</strong>
        <span>{{ generator.description }}</span>
      </button>
    </div>
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

.generator-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.generator-button {
  background: linear-gradient(135deg, var(--el-fill-color-light), var(--el-fill-color));
  border: 1px solid var(--el-border-color);
  border-radius: 18px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  display: grid;
  gap: 8px;
  min-height: 116px;
  padding: 16px;
  text-align: left;
  transition:
    border-color 160ms ease,
    transform 160ms ease;
}

.generator-button:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
}

.generator-button strong {
  font-size: 1.05rem;
}

.generator-button span {
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
