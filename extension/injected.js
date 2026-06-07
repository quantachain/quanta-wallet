/**
 * Quanta Wallet Injected Provider
 * 
 * This script is injected directly into the webpage's DOM.
 * It attaches `window.quanta` so dApps can communicate with the wallet.
 */

class QuantaProvider {
  constructor() {
    this.isQuanta = true;
    this._callbacks = new Map();
    this._nextId = 0;

    // Listen for responses from the content script
    window.addEventListener("message", (event) => {
      // We only accept messages from ourselves
      if (event.source !== window || !event.data || event.data.source !== "quanta-content") {
        return;
      }

      const { id, result, error } = event.data;
      if (this._callbacks.has(id)) {
        const { resolve, reject } = this._callbacks.get(id);
        this._callbacks.delete(id);

        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
      }
    });
  }

  /**
   * Internal helper to send messages to the content script.
   */
  _sendRequest(method, params = []) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._callbacks.set(id, { resolve, reject });

      window.postMessage({
        source: "quanta-injected",
        id,
        method,
        params
      }, "*");
    });
  }

  /**
   * Request connection to the wallet and get the active accounts.
   * @returns {Promise<string[]>} Array of hex-encoded addresses
   */
  async requestAccounts() {
    return this._sendRequest("requestAccounts");
  }

  /**
   * Sign a message with the active account's Falcon-512 private key.
   * @param {string} message The message to sign
   * @returns {Promise<string>} Hex-encoded signature blob (sig || hash)
   */
  async signMessage(message) {
    return this._sendRequest("signMessage", [message]);
  }
}

// Attach to window
if (!window.quanta) {
  window.quanta = new QuantaProvider();
  console.log("🟢 Quanta Wallet Provider injected!");
}
