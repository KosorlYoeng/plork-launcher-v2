<script setup lang="ts"></script>

<template>
  <div class="app-shell">
    <router-view />
  </div>
</template>

<style>
  :root {
    color-scheme: dark;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  body {
    margin: 0;
    background: #14161a;
    color: #e8e8ea;
  }

  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  input {
    font: inherit;
  }
</style>
