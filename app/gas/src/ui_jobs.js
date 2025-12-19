// File: ui_jobs.gs
// Web App エントリーポイント

/**
 * Web App メインエントリーポイント
 * URLパラメータでページを切り替え
 * ?page=customers -> 顧客マスター
 * ?page=staff -> スタッフマスター
 * default -> ダッシュボード（未実装の場合は顧客マスター）
 */
function doGet(e) {
  const page = e?.parameter?.page || 'customers';

  let htmlFile;
  let title;

  switch (page) {
    case 'customers':
      htmlFile = 'customers';
      title = '顧客マスター';
      break;
    case 'staff':
      htmlFile = 'staff';
      title = 'スタッフマスター';
      break;
    default:
      htmlFile = 'customers';
      title = '顧客マスター';
  }

  return HtmlService.createHtmlOutputFromFile(htmlFile)
    .setTitle(title)
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
