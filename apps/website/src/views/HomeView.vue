<script setup lang="ts">
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { contract, type HealthStatus, type User } from "@template/contract";
import { ref } from "vue";

const link = new RPCLink({
  url: () => new URL("/rpc", window.location.origin).toString(),
});

const rpc: ContractRouterClient<typeof contract> = createORPCClient(link);

const health = ref<HealthStatus | null>(null);
const users = ref<User[]>([]);
const errorMessage = ref("");
const isLoading = ref(false);

const templateEntries = [
  { label: "website", path: "apps/website" },
  { label: "backend", path: "apps/backend" },
  { label: "contract", path: "packages/contract/user.ts" },
  { label: "contract", path: "packages/contract/system.ts" },
];

const healthText = () => JSON.stringify(health.value, null, 2);
const usersText = () => JSON.stringify(users.value, null, 2);

void refresh();

async function refresh() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const [nextHealth, nextUsers] = await Promise.all([fetchHealth(), rpc.user.list({})]);

    health.value = nextHealth;
    users.value = nextUsers;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoading.value = false;
  }
}

async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`Health request failed with ${response.status}`);
  }

  return (await response.json()) as HealthStatus;
}
</script>

<template>
  <el-space direction="vertical" :size="24" fill class="stack">
    <el-card shadow="hover" class="hero-card">
      <div class="eyebrow-row">
        <el-tag type="primary" effect="dark" round>Vue + Element Plus + Vue Router</el-tag>
        <el-tag type="info" round>Vite+ / Hono / Cloudflare Workers / oRPC</el-tag>
      </div>

      <h1>Full-stack template wired for local DX and Workers deploys.</h1>

      <p class="lede">
        The frontend proxies `/api` and `/rpc` to the Hono backend in development, and the same
        Worker serves the built frontend through Workers Assets in production.
      </p>

      <div class="hero-actions">
        <el-button type="primary" size="large" :loading="isLoading" @click="refresh">
          Refresh sample data
        </el-button>
        <span class="hint"
          >Edit <code>apps/website/src/views/HomeView.vue</code> to verify HMR.</span
        >
      </div>
    </el-card>

    <el-alert
      v-if="errorMessage"
      title="Request failed"
      type="error"
      :description="errorMessage"
      show-icon
      :closable="false"
    />

    <el-row :gutter="24">
      <el-col :xs="24" :md="12">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="card-header">
              <span>REST health</span>
              <el-tag type="success" round>GET /api/health</el-tag>
            </div>
          </template>
          <pre>{{ health ? healthText() : "Loading..." }}</pre>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="hover" class="panel-card">
          <template #header>
            <div class="card-header">
              <span>oRPC users</span>
              <el-tag type="warning" round>rpc.user.list</el-tag>
            </div>
          </template>
          <pre>{{ users.length ? usersText() : "Loading..." }}</pre>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover" class="panel-card">
      <template #header>
        <div class="card-header">
          <span>Template structure</span>
          <el-tag type="info" round>Monorepo baseline</el-tag>
        </div>
      </template>

      <el-descriptions :column="1" border>
        <el-descriptions-item
          v-for="entry in templateEntries"
          :key="entry.path"
          :label="entry.label"
        >
          <code>{{ entry.path }}</code>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </el-space>
</template>

<style scoped>
.stack {
  width: 100%;
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

h1 {
  font-size: clamp(2.2rem, 6vw, 4.4rem);
  letter-spacing: -0.05em;
  line-height: 0.96;
  margin: 20px 0 0;
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

.card-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

pre {
  border-radius: 16px;
  margin: 0;
  overflow: auto;
  padding: 16px;
}
</style>
