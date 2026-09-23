<script setup lang="ts">
  import { computed } from "vue";
  import { useRoute, useRouter } from "vue-router";

  const route = useRoute();
  const router = useRouter();
  const message = computed(() => (route.query.message as string | undefined) ?? "An unexpected error occurred.");

  async function onRetry(): Promise<void> {
    await router.replace("/");
  }
</script>

<template>
  <main class="error-view">
    <h1>Something went wrong</h1>
    <p role="alert">{{ message }}</p>
    <button type="button" @click="onRetry">Retry</button>
  </main>
</template>

<style scoped>
  .error-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }
</style>
