// File: ui_jobs.ts
// Web App エントリーポイント

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'dashboard';

  const pages: Record<string, PageConfig> = {
    dashboard: { file: 'dashboard', title: 'ダッシュボード' },
    customers: { file: 'customers', title: '顧客マスター' },
    staff: { file: 'staff', title: 'スタッフマスター' },
    subcontractors: { file: 'subcontractors', title: '外注先マスター' },
    transportFees: { file: 'transportFees', title: '交通費マスター' },
    company: { file: 'company', title: '自社情報' },
    invoices: { file: 'invoices', title: '請求管理' },
    payouts: { file: 'payouts', title: '支払管理' },
    sales_analytics: { file: 'sales_analytics', title: '売上分析' }
  };

  const config = pages[page] || pages.dashboard;

  return HtmlService.createTemplateFromFile(config.file)
    .evaluate()
    .setTitle(config.title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function debugCheck(): string {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  Logger.log(ss.getSheets().map(s => s.getName()));
  return getSheetDirect('Jobs').getName();
}

function getScriptUrl(): string {
  return ScriptApp.getService().getUrl();
}
