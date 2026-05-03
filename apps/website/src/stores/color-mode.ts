import { defineStore } from "pinia";
import { ref } from "vue";

const colorModeStorageKey = "website-color-mode";

export const useColorModeStore = defineStore("color-mode", () => {
  const isDarkMode = ref(false);

  function initialize() {
    const savedMode = localStorage.getItem(colorModeStorageKey);

    if (savedMode === "dark") {
      isDarkMode.value = true;
    } else if (savedMode === "light") {
      isDarkMode.value = false;
    } else {
      isDarkMode.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    syncDocument();
  }

  function toggle() {
    isDarkMode.value = !isDarkMode.value;
    syncDocument();
  }

  function syncDocument() {
    document.documentElement.classList.toggle("dark", isDarkMode.value);
    localStorage.setItem(colorModeStorageKey, isDarkMode.value ? "dark" : "light");
  }

  return {
    initialize,
    isDarkMode,
    toggle,
  };
});
