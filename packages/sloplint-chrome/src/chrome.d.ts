interface ChromeMessageEvent {
  addListener(listener: (
    message: unknown,
    sender: { tab?: { id?: number } },
    sendResponse: (response: unknown) => void,
  ) => boolean | void): void;
}

interface ChromeStorageChangedEvent {
  addListener(listener: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void): void;
}

declare const chrome: {
  runtime: {
    getURL(path: string): string;
    sendMessage<T>(message: unknown): Promise<T>;
    onMessage: ChromeMessageEvent;
    lastError?: { message?: string };
  };
  storage: {
    local: {
      get(keys?: string | string[] | object | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: ChromeStorageChangedEvent;
  };
};
