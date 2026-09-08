import type { InjectionKey, Ref } from "vue";

export interface PaneInfo {
  readonly name: string;
  readonly tab: string;
}

export interface TabsCtx {
  activeName: Ref<string>;
  register(p: PaneInfo): void;
  unregister(name: string): void;
}

export const tabsKey: InjectionKey<TabsCtx> = Symbol("ui-tabs");
