<script setup lang="ts">
  import { onMounted } from "vue";
  import { useRouter } from "vue-router";
  import { useAuthStore } from "../store/auth.js";
  import { useLauncherStore } from "../store/launcher.js";

  const router = useRouter();
  const auth = useAuthStore();
  const launcher = useLauncherStore();

  onMounted(async () => {
    await launcher.refreshServerStatus().catch(() => undefined);
  });

  async function onCheckForUpdates(): Promise<void> {
    await router.push("/updating");
  }

  async function onLogout(): Promise<void> {
    await auth.logout();
    await router.replace("/login");
  }
</script>

<template>
  <main class="home">
    <header>
      <h1>MzzPlork</h1>
      <span>Signed in as {{ auth.username }}</span>
    </header>

    <section class="status">
      <template v-if="launcher.serverStatus">
        <strong>{{ launcher.serverStatus.online ? "Server online" : "Server offline" }}</strong>
        <span v-if="launcher.serverStatus.online">
          {{ launcher.serverStatus.players }} / {{ launcher.serverStatus.maxPlayers }} players
        </span>
      </template>
      <span v-else>Checking server status…</span>
    </section>

    <div class="actions">
      <button type="button" @click="onCheckForUpdates">Check for updates</button>
      <router-link to="/settings">Settings</router-link>
      <button type="button" @click="onLogout">Log out</button>
    </div>
  </main>
</template>

<style scoped>
  .home {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.5rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .status {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
</style>
