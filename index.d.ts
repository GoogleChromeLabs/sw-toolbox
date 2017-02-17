declare module 'sw-toolbox' {
  interface Cache {
    name: string
    maxEntries: number
    maxAgeSeconds: number
  }
  interface Options {
    debug: boolean
    networkTimeoutSeconds: number
    cache: Cache
  }
  interface Handler {
    (): void
  }
  interface Router {
    any(urlPattern: string, handler: Handler, options?: Options): void
    delete(urlPattern: string, handler: Handler, options?: Options): void
    get(urlPattern: string, handler: Handler, options?: Options): void
    head(urlPattern: string, handler: Handler, options?: Options): void
    post(urlPattern: string, handler: Handler, options?: Options): void
    put(urlPattern: string, handler: Handler, options?: Options): void
  }

  export const cacheFirst: Handler
  export const cacheOnly: Handler
  export const fastest: Handler
  export const networkFirst: Handler
  export const networkOnly: Handler
  export const router: Router

  export function cache (url: string, options: Options): void

  export function precache (urls: string[]): Promise<void>

  export function uncache (urls: string[]): Promise<void>
}
