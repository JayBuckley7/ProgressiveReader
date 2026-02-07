import { appLog } from "@shared/appLog";

type InitParams = {
  apiKey?: string;
  discoveryDocs: string[];
};

/**
 * Small wrapper around loading + initializing `gapi` (Google API JS client).
 * We keep this isolated so the main gDriveService is not a god-file.
 */
export class GapiClient {
  private gapi: any | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly init: InitParams) {}

  getGapi(): any | null {
    return this.gapi;
  }

  getDrive(): any | null {
    return this.gapi?.client?.drive ?? null;
  }

  isReady(): boolean {
    return Boolean(this.gapi?.client?.drive);
  }

  setAccessToken(accessToken: string | null): void {
    if (!this.gapi?.client?.setToken) return;
    this.gapi.client.setToken(accessToken ? { access_token: accessToken } : null);
  }

  async ensureLoaded(): Promise<void> {
    if (this.isReady()) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadAndInit().finally(() => {
      // Allow retries if load failed.
      if (!this.isReady()) this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async loadAndInit(): Promise<void> {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("GAPI can only be loaded in a browser environment.");
    }

    // Reuse a globally-loaded gapi if it exists.
    if ((window as any).gapi) {
      this.gapi = (window as any).gapi;
      await this.initClient();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://apis.google.com/js/api.js"]'
      );
      if (existing) {
        // Another part of the app already injected the script; wait for it.
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load Google API script")));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google API script"));
      document.head.appendChild(script);
    });

    this.gapi = (window as any).gapi;
    if (!this.gapi) {
      throw new Error("Google API script loaded but window.gapi is missing.");
    }

    await this.initClient();
  }

  private async initClient(): Promise<void> {
    if (!this.gapi) throw new Error("GAPI not loaded");

    await new Promise<void>((resolve, reject) => {
      try {
        this.gapi.load("client", () => resolve());
      } catch (error) {
        reject(error);
      }
    });

    try {
      await this.gapi.client.init({
        apiKey: this.init.apiKey,
        discoveryDocs: this.init.discoveryDocs,
      });
    } catch (error) {
      appLog.error("[GapiClient] gapi.client.init failed", error);
      throw error;
    }
  }
}

