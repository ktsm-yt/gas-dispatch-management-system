// GAS API type declarations for Vitest
// google-apps-script の型定義を除外した状態で、テストに必要な最小限の型を宣言

declare const Logger: { log: (...args: any[]) => void };

declare const MasterCache: {
  getCustomPriceMap: () => Record<string, number>;
  getCompany: () => any;
};

declare const PropertiesService: {
  getScriptProperties: () => {
    getProperty: (key: string) => string | null;
  };
};

declare function warnMissingRate_(
  source: string,
  rateValue: number | string | null | undefined,
  context: Record<string, string | number>
): void;

declare function assertInvariant_(
  condition: boolean,
  message: string,
  context?: Record<string, string | number | boolean>
): void;
