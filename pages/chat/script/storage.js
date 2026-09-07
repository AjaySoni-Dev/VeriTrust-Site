(function initNexoraStorageBridge(window) {
  'use strict';

  function get(key, fallback = null) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function getJSON(key, fallback = null) {
    const value = get(key, null);
    if (value === null) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function setJSON(key, value) {
    return set(key, JSON.stringify(value));
  }

  window.NexoraStorageBridge = Object.freeze({ get, set, remove, getJSON, setJSON });
})(window);
