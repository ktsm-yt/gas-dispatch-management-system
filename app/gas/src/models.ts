// File: models.ts
// シートのヘッダ（英語キー）を読み、行をオブジェクトで扱う
function readRows(sheetName: string): Record<string, unknown>[] {
  if (!sheetName) throw new Error('readRows: sheetName is required');
  const sh = getSheetByName(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length === 0) return [];
  const header = values[0] as string[];
  return values.slice(1).map(row => {
    const obj: Record<string, unknown> = {};
    header.forEach((key, i) => obj[key] = row[i]);
    return obj;
  });
}

function appendRow(sheetName: string, recordObj: Record<string, unknown>): void {
  const sh = getSheetByName(sheetName);
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] as string[];
  const row = header.map(key => recordObj[key] ?? '');
  sh.appendRow(row);
}

function addJob(job: Record<string, unknown>): void {
  appendRow('jobs', job);
}

function getJobs(): Record<string, unknown>[] {
  Logger.log('getJobs -> readRows("jobs")');
  return readRows('jobs');
}
