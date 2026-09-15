import type { IpcApi } from "../shared/types";

declare global {
  interface Window {
    podcastApi: IpcApi;
  }
}

export {};
