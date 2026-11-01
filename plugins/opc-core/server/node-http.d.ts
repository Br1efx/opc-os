declare class TextDecoder {
  decode(input: Uint8Array): string;
}

interface NodeClientResponse {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  resume(): void;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  on(event: "end", listener: () => void): void;
}

interface NodeClientRequest {
  destroy(error?: Error): void;
  setTimeout(ms: number, callback: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "timeout", listener: () => void): void;
  write(body: string): void;
  end(): void;
}

interface NodeRequestOptions {
  protocol?: string;
  hostname?: string;
  port?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
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
