// File: models.gs
// シートのヘッダ（英語キー）を読み、行をオブジェクトで扱う
function readRows(sheetName) {
  if (!sheetName) throw new Error('readRows: sheetName is required');
  const sh = getSheetByName(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length === 0) return [];
  const header = values[0]; // 英語キー
  return values.slice(1).map(row => {
    const obj = {};
    header.forEach((key, i) => obj[key] = row[i]);
    return obj;
  });
}

function appendRow(sheetName, recordObj) {
  const sh = getSheetByName(sheetName);
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = header.map(key => recordObj[key] ?? '');
  sh.appendRow(row);
}

function addJob(job) {
  // job は英語キーのオブジェクトで渡す
  appendRow('Jobs', job);
}

function getJobs() {
  Logger.log('getJobs -> readRows("Jobs")');
  return readRows('Jobs');
}
