<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useColorModeStore } from "./stores/color-mode";
const colorModeStore = useColorModeStore();
const { isDarkMode } = storeToRefs(colorModeStore);

colorModeStore.initialize();
</script>

<template>
  <el-space direction="vertical" :size="24" fill class="stack">
    <el-card shadow="hover" class="hero-card">
      <div class="hero-topbar">
        <div class="eyebrow-row">
          <el-tag type="primary" effect="dark" round>Vue + Element Plus</el-tag>
          <el-tag type="info" round>Router enabled</el-tag>
        </div>

        <el-button text bg class="theme-toggle" @click="colorModeStore.toggle()">
          {{ isDarkMode ? "Light mode" : "Dark mode" }}
        </el-button>
      </div>

      <h1>App shell with routing and shared theme state.</h1>

      <p class="lede">
        `vue-router` is mounted at the app root, so additional pages can now be added without
        reworking the entrypoint.
      </p>

      <div class="hero-actions">
        <RouterLink to="/" class="nav-link">
          <el-button type="primary" plain>Home</el-button>
        </RouterLink>
        <span class="hint">
          Routes render below this shell via <code>&lt;RouterView /&gt;</code>.
        </span>
      </div>
    </el-card>

    <RouterView />
  </el-space>
</template>

<style scoped>
.stack {
  width: 100%;
  margin: 40px auto;
  padding: 0 16px;
}

.hero-card,
.panel-card {
  border-radius: 24px;
}

.eyebrow-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.hero-topbar {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 20px;
}

.theme-toggle {
  flex-shrink: 0;
}

h1 {
  font-size: clamp(2.2rem, 6vw, 4.4rem);
  letter-spacing: -0.05em;
  line-height: 0.96;
  margin: 0;
  max-width: 11ch;
}

.lede {
  font-size: 1.04rem;
  margin: 16px 0 0;
  max-width: 62ch;
}

.hero-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 24px;
}

.nav-link {
  display: inline-flex;
}
</style>
