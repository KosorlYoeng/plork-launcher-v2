<script setup lang="ts">
  import { onMounted, onUnmounted } from "vue";
  import { useRouter } from "vue-router";
  import { useLauncherStore } from "../store/launcher.js";

  const router = useRouter();
  const launcher = useLauncherStore();
  let unsubscribe: (() => void) | undefined;

  onMounted(async () => {
    unsubscribe = launcher.subscribeToUpdateProgress();
    try {
      await launcher.checkForUpdates();
      await router.replace("/home");
    } catch (error) {
      await router.replace({
        path: "/error",
        query: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  });

  onUnmounted(() => {
    unsubscribe?.();
  });
</script>

<template>
  <main class="updating">
    <h1>Updating…</h1>
    <p v-if="launcher.updateProgress">
      {{ launcher.updateProgress.status }}
      <template v-if="launcher.updateProgress.file"> — {{ launcher.updateProgress.file }}</template>
      <template v-if="launcher.updateProgress.filesTotal">
        ({{ launcher.updateProgress.filesCompleted }}/{{ launcher.updateProgress.filesTotal }} files)
      </template>
    </p>
    <p v-else>Checking for updates…</p>
  </main>
</template>

<style scoped>
  .updating {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
