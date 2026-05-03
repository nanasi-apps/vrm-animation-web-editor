<script setup lang="ts">
import { quaternionToEulerDegrees } from "../../domain/vrma/rotation";
import { useAnimationEditorStore } from "../../stores/animation-editor";

const editorStore = useAnimationEditorStore();
const axes = ["X", "Y", "Z"] as const;

function rotationAxisValue(value: [number, number, number, number], axis: 0 | 1 | 2) {
  return Number(quaternionToEulerDegrees(value)[axis].toFixed(2));
}

function numberInputValue(value: Event) {
  const input = value.target as HTMLInputElement;
  const nextValue = Number(input.value);

  return Number.isFinite(nextValue) ? nextValue : 0;
}

function selectedTranslationAxisValue(axis: 0 | 1 | 2) {
  if (
    editorStore.selectedTrack?.kind !== "hipsTranslation" ||
    !editorStore.selectedKeyframe ||
    typeof editorStore.selectedKeyframe.value === "number"
  ) {
    return 0;
  }

  return Number(editorStore.selectedKeyframe.value[axis].toFixed(2));
}

function selectedRotationAxisValue(axis: 0 | 1 | 2) {
  if (
    !editorStore.selectedTrack ||
    editorStore.selectedTrack.kind === "hipsTranslation" ||
    editorStore.selectedTrack.kind === "expression" ||
    !editorStore.selectedKeyframe ||
    typeof editorStore.selectedKeyframe.value === "number" ||
    editorStore.selectedKeyframe.value.length !== 4
  ) {
    return 0;
  }

  return rotationAxisValue(editorStore.selectedKeyframe.value, axis);
}
</script>

<template>
  <el-card shadow="hover" class="panel-card inspector-card">
    <template v-if="editorStore.selectedTrack && editorStore.selectedKeyframe">
      <el-select
        class="interpolation-select"
        :model-value="editorStore.selectedTrack.interpolation"
        placeholder="Interpolation"
        size="small"
        @update:model-value="
          (value) => editorStore.updateInterpolation((value as 'LINEAR' | 'STEP') ?? 'LINEAR')
        "
      >
        <el-option label="LINEAR" value="LINEAR" />
        <el-option label="STEP" value="STEP" />
      </el-select>

      <div v-if="editorStore.selectedTrack.kind === 'expression'" class="selected-key-editor">
        <span class="field-label">Weight</span>
        <el-slider
          :max="1"
          :min="0"
          :model-value="editorStore.selectedKeyframe.value"
          :step="0.01"
          @update:model-value="
            (value) =>
              editorStore.updateScalarValue(
                editorStore.selectedKeyframeIndex,
                Array.isArray(value) ? (value[0] ?? 0) : value,
              )
          "
        />
      </div>

      <div v-else class="selected-key-editor">
        <span class="field-label">Transform</span>
        <div class="transform-grid">
          <label v-for="(_, axis) in axes" :key="axis" class="axis-control">
            <span>{{ axes[axis] }}</span>
            <input
              v-if="editorStore.selectedTrack.kind === 'hipsTranslation'"
              class="axis-input"
              :value="selectedTranslationAxisValue(axis as 0 | 1 | 2)"
              type="number"
              step="0.01"
              @change="
                (event) =>
                  editorStore.updateVec3Value(
                    editorStore.selectedKeyframeIndex,
                    axis as 0 | 1 | 2,
                    numberInputValue(event),
                  )
              "
            />
            <input
              v-else
              class="axis-input"
              :value="selectedRotationAxisValue(axis as 0 | 1 | 2)"
              type="number"
              step="1"
              @change="
                (event) =>
                  editorStore.updateRotationEulerValue(
                    editorStore.selectedKeyframeIndex,
                    axis as 0 | 1 | 2,
                    numberInputValue(event),
                  )
              "
            />
          </label>
        </div>
      </div>
    </template>

    <el-empty v-else description="Select a keyframe to edit." />
  </el-card>
</template>

<style scoped>
.panel-card {
  border-radius: 18px;
}

.inspector-card {
  min-height: 290px;
}

.inspector-card :deep(.el-card__body) {
  padding: 12px;
}

.interpolation-select {
  margin-bottom: 8px;
  width: 120px;
}

.selected-key-editor {
  display: grid;
  gap: 10px;
}

.field-label {
  color: var(--el-text-color-secondary);
  font-size: 0.8rem;
  font-weight: 700;
}

.transform-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.axis-control {
  display: grid;
  gap: 4px;
}

.axis-control span {
  color: var(--el-text-color-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}

.axis-input {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-primary);
  font: inherit;
  height: 32px;
  min-width: 0;
  padding: 0 8px;
  width: 100%;
}

.axis-input:focus {
  border-color: var(--el-color-primary);
  outline: none;
}

.axis-input::-webkit-inner-spin-button,
.axis-input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
</style>
