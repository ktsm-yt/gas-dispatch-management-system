// File: ui_jobs.gs
// Web App エントリーポイント

/**
 * Web App メインエントリーポイント
 * URLパラメータでページを切り替え
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'dashboard';

  const pages = {
    // P1-3: ダッシュボード・案件管理
    dashboard: { file: 'dashboard', title: 'ダッシュボード' },
    jobs: { file: 'jobs', title: '案件管理' },
    // P1-4: 配置管理
    assignments: { file: 'assignments', title: '配置管理' },
    // P1-2: マスター管理
    customers: { file: 'customers', title: '顧客マスター' },
    staff: { file: 'staff', title: 'スタッフマスター' },
    subcontractors: { file: 'subcontractors', title: '外注先マスター' },
    transportFees: { file: 'transportFees', title: '交通費マスター' },
    company: { file: 'company', title: '自社情報' },
    // P2-1: 請求管理
    invoices: { file: 'invoices', title: '請求管理' },
    // P2-3: 支払管理
    payouts: { file: 'payouts', title: '支払管理' }
  };

  const config = pages[page] || pages.dashboard;

  return HtmlService.createTemplateFromFile(config.file)
    .evaluate()
    .setTitle(config.title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function submitJob(formData) {
  // formData は英語キーで来る前提（フロントでname=英語キー）
  addJob(formData);
  return { ok: true };
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function debugCheck() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  Logger.log(ss.getSheets().map(s => s.getName())); // 期待: master_clients 等
  return getSheetByName('jobs').getName(); // ここで名前が返ればOK
}

/**
 * WebアプリのURLを取得（ナビゲーション用）
 */
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}
