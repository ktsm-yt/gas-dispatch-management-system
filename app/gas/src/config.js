// File: config.gs

// テーブル名 → シート名のマッピングは db.gs の TABLE_SHEET_MAP を参照

// 英語キー ↔ 日本語ラベルの対応表（UI用）
function getFieldLabelMap() {
  return {
    client_id: '顧客ID',
    client_name: '顧客名',
    billing_name: '請求先名',
    address: '住所',
    contact_person: '担当者',
    tel: '電話番号',
    job_id: '案件ID',
    site_name: '現場名',
    site_address: '現場住所',
    work_date: '作業日',
    work_time_from: '開始時刻',
    work_time_to: '終了時刻',
    work_type: '作業種別',
    rate_id: '単価ID',
    drive_url: '原本URL',
    staff_id: 'スタッフID',
    staff_name: 'スタッフ名',
    time_slot: '時間区分'
  };
}

function getSpreadsheetId() {
  const prop = PropertiesService.getScriptProperties();
  const env = prop.getProperty('ENV') || 'dev';
  const id = env === 'prod'
    ? prop.getProperty('SPREADSHEET_ID_PROD')
    : prop.getProperty('SPREADSHEET_ID_DEV');
  if (!id) throw new Error('Spreadsheet ID not set in Script Properties.');
  return id;
}

function getSheetByName(name) {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  let sheet = ss.getSheetByName(name);

  // フォールバック: 旧日本語名で検索（シートリネーム前の過渡期用）
  if (!sheet && typeof OLD_SHEET_MAP !== 'undefined') {
    const oldName = OLD_SHEET_MAP[name];
    if (oldName) {
      sheet = ss.getSheetByName(oldName);
    }
  }

  if (!sheet) throw new Error(`Sheet not found: ${name}`);
  return sheet;
}
