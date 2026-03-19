// GAS API stubs for Vitest runtime
// GASグローバル関数をスタブ化し、純粋関数テストを可能にする

globalThis.Logger = { log: console.log };

globalThis.MasterCache = {
  getCustomPriceMap: () => ({}),   // Record<string, number> — plain object（実装が map[key] ブラケットアクセスのため）
  getCompany: () => null,
};

globalThis.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => null,
  }),
};
