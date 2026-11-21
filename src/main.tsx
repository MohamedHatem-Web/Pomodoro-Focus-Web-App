import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";
import { applyNativeRemoteUpdate } from "./native-update";

declare const __APP_VERSION__: string;

void applyNativeRemoteUpdate(__APP_VERSION__).finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
});

const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent("focus-to-work:offline-ready"));
  },
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent("focus-to-work:update-ready"));
  },
  onRegisterError(error) {
    console.error("Unable to register the application update service worker.", error);
  },
});

window.addEventListener("focus-to-work:apply-update", () => {
  void updateServiceWorker(true);
});
