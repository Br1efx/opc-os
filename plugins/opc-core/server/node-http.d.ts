declare class TextDecoder {
  decode(input: Uint8Array): string;
}

interface NodeClientResponse {
  statusCode?: number;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  on(event: "end", listener: () => void): void;
}

interface NodeClientRequest {
  destroy(error?: Error): void;
  setTimeout(ms: number, callback: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  write(body: string): void;
  end(): void;
}

interface NodeRequestOptions {
  hostname?: string;
  port?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
}

declare module "node:http" {
  export function request(
    options: NodeRequestOptions,
    callback: (response: NodeClientResponse) => void,
  ): NodeClientRequest;
}

declare module "node:https" {
  export function request(
    options: NodeRequestOptions,
    callback: (response: NodeClientResponse) => void,
  ): NodeClientRequest;
}
