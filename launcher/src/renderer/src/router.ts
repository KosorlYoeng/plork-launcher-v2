import { createRouter, createWebHashHistory } from "vue-router";
import Splash from "./views/Splash.vue";
import Login from "./views/Login.vue";
import Home from "./views/Home.vue";
import Updating from "./views/Updating.vue";
import Settings from "./views/Settings.vue";
import ErrorView from "./views/Error.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "splash", component: Splash },
    { path: "/login", name: "login", component: Login },
    { path: "/home", name: "home", component: Home },
    { path: "/updating", name: "updating", component: Updating },
    { path: "/settings", name: "settings", component: Settings },
    { path: "/error", name: "error", component: ErrorView },
  ],
});
