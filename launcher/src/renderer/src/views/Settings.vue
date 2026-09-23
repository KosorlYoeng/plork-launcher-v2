<script setup lang="ts">
  import { onMounted, ref } from "vue";
  import { useRouter } from "vue-router";
  import { useLauncherStore } from "../store/launcher.js";

  const router = useRouter();
  const launcher = useLauncherStore();
  const manualPath = ref("");
  const validationMessage = ref<string | null>(null);

  onMounted(async () => {
    await launcher.loadConfig();
  });

  async function onDetect(): Promise<void> {
    const found = await launcher.detectGame();
    if (found.length > 0) {
      await launcher.selectInstallation(found[0]);
    }
  }

  async function onValidateManualPath(): Promise<void> {
    const result = await launcher.validateGamePath(manualPath.value);
    validationMessage.value = result
      ? `Found GTA V at ${result.installPath}`
      : "GTA5.exe was not found at that path";
  }

  async function onChannelChange(event: Event): Promise<void> {
    const channel = (event.target as HTMLSelectElement).value;
    await launcher.updateConfig({ channel });
  }

  async function onAutoUpdateToggle(event: Event): Promise<void> {
    const autoUpdate = (event.target as HTMLInputElement).checked;
    await launcher.updateConfig({ autoUpdate });
  }
</script>

<template>
  <main class="settings">
    <header>
      <h1>Settings</h1>
      <button type="button" @click="router.back()">Back</button>
    </header>

    <section v-if="launcher.config">
      <label>
        Channel
        <select :value="launcher.config.channel" @change="onChannelChange">
          <option value="stable">stable</option>
          <option value="beta">beta</option>
          <option value="dev">dev</option>
        </select>
      </label>

      <label class="checkbox">
        <input type="checkbox" :checked="launcher.config.autoUpdate" @change="onAutoUpdateToggle" />
        Automatically update on start
      </label>

      <div class="game-path">
        <p>Game path: {{ launcher.config.gamePath || "not set" }}</p>
        <button type="button" @click="onDetect">Auto-detect</button>
        <div class="manual">
          <input v-model="manualPath" type="text" placeholder="Manual GTA V install path" />
          <button type="button" @click="onValidateManualPath">Use this path</button>
        </div>
        <p v-if="validationMessage">{{ validationMessage }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
  .settings {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.5rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 420px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .manual {
    display: flex;
    gap: 0.5rem;
  }
</style>
