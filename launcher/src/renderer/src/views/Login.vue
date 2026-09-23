<script setup lang="ts">
  import { ref } from "vue";
  import { useRouter } from "vue-router";
  import { useAuthStore } from "../store/auth.js";

  const router = useRouter();
  const auth = useAuthStore();
  const username = ref("");
  const password = ref("");

  async function onSubmit(): Promise<void> {
    try {
      await auth.login(username.value, password.value);
      await router.replace("/home");
    } catch {
      // auth.error already holds the message; stay on this view
    }
  }
</script>

<template>
  <main class="login">
    <h1>MzzPlork</h1>
    <form @submit.prevent="onSubmit">
      <label>
        Username
        <input v-model="username" type="text" autocomplete="username" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>
      <button type="submit" :disabled="auth.loading">
        {{ auth.loading ? "Signing in…" : "Sign in" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
  .login {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 280px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .error {
    color: #ff6b6b;
    font-size: 0.85rem;
  }
</style>
