<script setup lang="ts">
  import { onMounted } from "vue";
  import { useRouter } from "vue-router";
  import { useAuthStore } from "../store/auth.js";
  import { useLauncherStore } from "../store/launcher.js";

  const router = useRouter();
  const auth = useAuthStore();
  const launcher = useLauncherStore();

  onMounted(async () => {
    try {
      await launcher.loadConfig();
      await auth.refresh();
      await router.replace(auth.isAuthenticated ? "/home" : "/login");
    } catch (error) {
      await router.replace({
        path: "/error",
        query: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
</script>

<template>
  <main class="splash">
    <h1>MzzPlork</h1>
    <p>Starting up…</p>
  </main>
</template>

<style scoped>
  .splash {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
