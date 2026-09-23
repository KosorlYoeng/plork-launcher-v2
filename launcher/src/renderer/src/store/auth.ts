import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    isAuthenticated: false,
    username: null as string | null,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async refresh(): Promise<void> {
      const state = await window.mzzplork.getAuthState();
      this.isAuthenticated = state.isAuthenticated;
      this.username = state.username;
    },
    async login(username: string, password: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const state = await window.mzzplork.login(username, password);
        this.isAuthenticated = state.isAuthenticated;
        this.username = state.username;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async logout(): Promise<void> {
      const state = await window.mzzplork.logout();
      this.isAuthenticated = state.isAuthenticated;
      this.username = state.username;
    },
  },
});
