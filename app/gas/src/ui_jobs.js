// File: ui_jobs.gs
// 案件フォーム用の日本語ラベルを生成してテンプレに渡す
function doGet() {
  const template = HtmlService.createTemplateFromFile('jobs_form');
  template.fieldLabelMap = getFieldLabelMap();
  template.clients = readRows('master_clients'); // プルダウン用
  template.rates = readRows('master_rates');     // プルダウン用
  return template.evaluate()
    .setTitle('案件登録')
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
