declare module "prisma/config" {
  // Minimal typings for the Prisma config helper used by Prisma CLI
  export type EnvFn = (name: string, opts?: { default?: string }) => string;
  export function env(name: string): string;
  export function defineConfig<T extends Record<string, any>>(cfg: T): T;
  export default defineConfig;
}
