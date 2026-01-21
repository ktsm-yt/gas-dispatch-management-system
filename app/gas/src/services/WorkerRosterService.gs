/**
 * Worker Roster Service
 *
 * 作業員名簿（全建統一様式第５号）の生成・出力処理
 * InvoiceExportService/PayoutExportServiceのパターンを踏襲
 */

const WorkerRosterService = {
  /**
   * ScriptPropertyキー
   */
  TEMPLATE_KEY: 'TEMPLATE_WORKER_ROSTER_ID',
  OUTPUT_FOLDER_KEY: 'WORKER_ROSTER_FOLDER_ID',

  /**
   * 最大スタッフ数（テンプレートの行数制限）
   */
  MAX_STAFF_COUNT: 10,

  /**
   * テンプレートのデータ開始行（1-indexed）
   */
  DATA_START_ROW: 19,

  /**
   * 1人あたりの行数（全建統一様式第５号: 6行）
   */
  ROWS_PER_STAFF: 6,

  /**
   * 作業員名簿を生成
   * @param {string[]} staffIds - スタッフIDの配列
   * @param {Object} options - オプション
   * @param {string} options.mode - 出力モード（'pdf' | 'excel' | 'edit'）
   * @param {string} options.action - 既存ファイル処理（'overwrite' | 'rename'）
   * @returns {Object} APIレスポンス
   */
  generate: function(staffIds, options = {}) {
    const requestId = generateId('req');
    const mode = options.mode || 'edit';

    try {
      // 1. バリデーション
      if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
        return buildErrorResponse(
          'VALIDATION_ERROR',
          'スタッフを1名以上選択してください',
          { field: 'staffIds' },
          requestId
        );
      }

      if (staffIds.length > this.MAX_STAFF_COUNT) {
        return buildErrorResponse(
          'VALIDATION_ERROR',
          `スタッフは最大${this.MAX_STAFF_COUNT}名まで選択できます（選択: ${staffIds.length}名）`,
          { field: 'staffIds', max: this.MAX_STAFF_COUNT, actual: staffIds.length },
          requestId
        );
      }

      // 2. テンプレートID検証
      const templateValidation = this._validateTemplateConfig();
      if (!templateValidation.valid) {
        return buildErrorResponse(
          'CONFIG_ERROR',
          templateValidation.setupGuide,
          { missingKey: templateValidation.missingKey },
          requestId
        );
      }

      // 3. 出力フォルダ検証
      const folderValidation = this._validateOutputFolder();
      if (!folderValidation.valid) {
        return buildErrorResponse(
          'CONFIG_ERROR',
          folderValidation.setupGuide,
          { missingKey: folderValidation.missingKey },
          requestId
        );
      }

      // 4. スタッフデータ一括取得
      const staffData = this._getStaffByIds(staffIds);
      if (staffData.length === 0) {
        return buildErrorResponse(
          'NOT_FOUND',
          '指定されたスタッフが見つかりません',
          { staffIds: staffIds },
          requestId
        );
      }

      // 5. テンプレートをコピー
      const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
      const fileName = `作業員名簿_${timestamp}`;
      const spreadsheet = this._copyTemplate(fileName);

      // 6. データを埋め込み
      this._populateTemplate(spreadsheet, staffData);

      // 6.5. シートのクリーンアップ（不要行削除・印刷範囲設定）
      this._cleanupSheet(spreadsheet, staffData.length);

      // 7. 出力フォルダに移動
      const folder = this._getOutputFolder();
      const file = DriveApp.getFileById(spreadsheet.getId());

      // 同名ファイル処理
      this._handleExistingFiles(folder, fileName, options.action);

      file.moveTo(folder);

      // 8. 出力モードに応じた処理
      let result;
      if (mode === 'pdf') {
        result = this._exportToPdf(spreadsheet, fileName, folder, options);
      } else if (mode === 'excel') {
        result = this._exportToExcel(spreadsheet, fileName, folder, options);
      } else {
        // edit mode - スプレッドシートのURLを返す
        result = {
          fileId: spreadsheet.getId(),
          url: spreadsheet.getUrl(),
          fileName: fileName,
          type: 'spreadsheet'
        };
      }

      return buildSuccessResponse({
        ...result,
        staffCount: staffData.length
      }, requestId);

    } catch (e) {
      Logger.log(`WorkerRosterService.generate error: ${e.message}\n${e.stack}`);
      return buildErrorResponse(
        'SYSTEM_ERROR',
        `名簿生成エラー: ${e.message}`,
        {},
        requestId
      );
    }
  },

  /**
   * テンプレート設定を検証
   * @returns {Object} { valid: boolean, missingKey?: string, setupGuide?: string }
   */
  _validateTemplateConfig: function() {
    const props = PropertiesService.getScriptProperties();
    const templateId = props.getProperty(this.TEMPLATE_KEY);

    if (!templateId) {
      return {
        valid: false,
        missingKey: this.TEMPLATE_KEY,
        setupGuide: `作業員名簿テンプレートIDが未設定です。\n` +
          `GASエディタで setWorkerRosterTemplateId() を実行してください。`
      };
    }

    try {
      DriveApp.getFileById(templateId);
    } catch (e) {
      return {
        valid: false,
        missingKey: this.TEMPLATE_KEY,
        setupGuide: `テンプレートファイルにアクセスできません（ID: ${templateId}）。\n` +
          `ファイルが削除されたか、アクセス権限がない可能性があります。`
      };
    }

    return { valid: true };
  },

  /**
   * 出力フォルダ設定を検証
   * @returns {Object} { valid: boolean, missingKey?: string, setupGuide?: string }
   */
  _validateOutputFolder: function() {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(this.OUTPUT_FOLDER_KEY);

    if (!folderId) {
      return {
        valid: false,
        missingKey: this.OUTPUT_FOLDER_KEY,
        setupGuide: `作業員名簿出力フォルダIDが未設定です。\n` +
          `GASエディタで setWorkerRosterFolderId() を実行してください。`
      };
    }

    try {
      DriveApp.getFolderById(folderId);
    } catch (e) {
      return {
        valid: false,
        missingKey: this.OUTPUT_FOLDER_KEY,
        setupGuide: `出力フォルダにアクセスできません（ID: ${folderId}）。\n` +
          `フォルダが削除されたか、アクセス権限がない可能性があります。`
      };
    }

    return { valid: true };
  },

  /**
   * スタッフIDの配列からスタッフデータを取得
   * @param {string[]} staffIds - スタッフIDの配列
   * @returns {Object[]} スタッフデータの配列
   */
  _getStaffByIds: function(staffIds) {
    const result = listStaff({ includeDeleted: false });
    if (!result.ok) {
      Logger.log('listStaff error: ' + JSON.stringify(result));
      return [];
    }

    // listStaff returns { data: { items: [...], count: N } }
    const allStaff = result.data?.items || [];
    if (!Array.isArray(allStaff)) {
      Logger.log('listStaff returned non-array items: ' + typeof allStaff);
      return [];
    }

    Logger.log('_getStaffByIds: found ' + allStaff.length + ' staff, looking for ' + staffIds.length + ' IDs');

    const staffMap = {};
    for (const staff of allStaff) {
      staffMap[staff.staff_id] = staff;
    }

    // 選択順を維持して返す
    const found = staffIds
      .filter(id => staffMap[id])
      .map(id => staffMap[id]);

    Logger.log('_getStaffByIds: matched ' + found.length + ' staff');
    return found;
  },

  /**
   * テンプレートをコピー
   * @param {string} fileName - ファイル名
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} コピーされたスプレッドシート
   */
  _copyTemplate: function(fileName) {
    const props = PropertiesService.getScriptProperties();
    const templateId = props.getProperty(this.TEMPLATE_KEY);
    const templateFile = DriveApp.getFileById(templateId);
    const copiedFile = templateFile.makeCopy(fileName);
    return SpreadsheetApp.openById(copiedFile.getId());
  },

  /**
   * 出力フォルダを取得
   * @returns {GoogleAppsScript.Drive.Folder} フォルダ
   */
  _getOutputFolder: function() {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(this.OUTPUT_FOLDER_KEY);
    return DriveApp.getFolderById(folderId);
  },

  /**
   * 同名ファイルの処理
   * @param {GoogleAppsScript.Drive.Folder} folder - フォルダ
   * @param {string} fileName - ファイル名
   * @param {string} action - 'overwrite' | 'rename'
   */
  _handleExistingFiles: function(folder, fileName, action) {
    if (action !== 'overwrite') return;

    // PDF/Excelファイルも含めて検索
    const extensions = ['', '.pdf', '.xlsx'];
    for (const ext of extensions) {
      const fullName = fileName + ext;
      const files = folder.getFilesByName(fullName);
      while (files.hasNext()) {
        files.next().setTrashed(true);
      }
    }
  },

  /**
   * テンプレートにスタッフデータを埋め込み
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {Object[]} staffData - スタッフデータ配列
   */
  _populateTemplate: function(spreadsheet, staffData) {
    const sheet = spreadsheet.getSheets()[0];

    // 作成日を設定（ヘッダー部分）
    const today = new Date();
    const dateStr = this._formatJapaneseDate(today);
    sheet.getRange('X3').setValue(dateStr);

    // 各スタッフのデータを埋め込み
    for (let i = 0; i < staffData.length; i++) {
      const staff = staffData[i];
      const baseRow = this.DATA_START_ROW + (i * this.ROWS_PER_STAFF);

      this._populateStaffRow(sheet, baseRow, i + 1, staff);
    }

    SpreadsheetApp.flush();
  },

  /**
   * シートのクリーンアップ（不要行削除）
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {number} staffCount - スタッフ数
   */
  _cleanupSheet: function(spreadsheet, staffCount) {
    const sheet = spreadsheet.getSheets()[0];

    // 1. 余分なシートを削除（最初のシート以外）
    const sheets = spreadsheet.getSheets();
    for (let i = sheets.length - 1; i > 0; i--) {
      spreadsheet.deleteSheet(sheets[i]);
    }

    // 2. データ範囲の最終行を計算
    // ヘッダー部分(18行) + スタッフ10名分(6行×10) + フッター注釈
    const lastDataRow = this.DATA_START_ROW + (this.MAX_STAFF_COUNT * this.ROWS_PER_STAFF) + 2;

    // 3. 不要な行を削除
    const maxRows = sheet.getMaxRows();
    if (maxRows > lastDataRow) {
      try {
        sheet.deleteRows(lastDataRow + 1, maxRows - lastDataRow);
      } catch (e) {
        Logger.log('Row deletion warning: ' + e.message);
      }
    }

    SpreadsheetApp.flush();
  },

  /**
   * 1人分のスタッフデータを行に埋め込み
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {number} baseRow - 開始行（1-indexed）
   * @param {number} index - 連番（1始まり）
   * @param {Object} staff - スタッフデータ
   */
  _populateStaffRow: function(sheet, baseRow, index, staff) {
    // 全建統一様式第５号のセル配置に合わせてデータを設定
    // 各フィールドの正確な位置はテンプレートに依存

    // 番号
    sheet.getRange(baseRow, 1).setValue(index);

    // フリガナ（Row 1）
    sheet.getRange(baseRow, 2).setValue(staff.name_kana || '');

    // 職種（Row 1）- ユーザーが手動入力

    // 雇入年月日（Row 1）
    const hireDateStr = this._formatJapaneseDate(staff.hire_date);
    sheet.getRange(baseRow, 9).setValue(hireDateStr);

    // 生年月日（Row 1）
    const birthDateStr = this._formatJapaneseDate(staff.birth_date);
    sheet.getRange(baseRow, 13).setValue(birthDateStr);

    // 現住所（Row 1）
    sheet.getRange(baseRow, 17).setValue(staff.address || '');

    // TEL（Row 1）
    sheet.getRange(baseRow, 26).setValue(staff.phone || '');

    // 氏名（Row 3）
    sheet.getRange(baseRow + 2, 2).setValue(staff.name || '');

    // 技能者ID（Row 5）
    sheet.getRange(baseRow + 4, 2).setValue(staff.ccus_id || '');

    // 経験年数（Row 4）
    const experienceYears = this._calculateExperienceYears(staff.hire_date);
    if (experienceYears !== null) {
      sheet.getRange(baseRow + 3, 9).setValue(experienceYears + '年');
    }

    // 年齢（Row 4）
    const age = this._calculateAge(staff.birth_date);
    if (age !== null) {
      sheet.getRange(baseRow + 3, 13).setValue(age + ' 歳');
    }

    // 家族連絡先氏名（Row 4, column Q）
    sheet.getRange(baseRow + 3, 17).setValue(staff.emergency_contact_name || '');

    // 家族連絡先住所（Row 5, column Q）
    sheet.getRange(baseRow + 4, 17).setValue(staff.emergency_contact_address || '');

    // 家族連絡先電話番号（Row 4, column Z）
    sheet.getRange(baseRow + 3, 26).setValue(staff.emergency_contact_phone || '');

    // 血液型（Row 1, column AH）
    sheet.getRange(baseRow, 34).setValue(staff.blood_type || '');

    // 健康保険（Row 1, column AM）
    sheet.getRange(baseRow, 39).setValue(staff.health_insurance_type || '');

    // 年金保険（Row 3）
    sheet.getRange(baseRow + 2, 38).setValue(staff.pension_type || '');

    // 年金番号（Row 4）- 厚生年金番号
    sheet.getRange(baseRow + 3, 38).setValue(staff.pension_number || '');

    // 雇用保険（Row 5）- 下4桁のみ
    const insuranceNo = this._formatInsuranceNumber(staff.employment_insurance_no);
    sheet.getRange(baseRow + 4, 38).setValue(insuranceNo);

    // 建退共（Row 1, column AT）
    sheet.getRange(baseRow, 46).setValue(staff.kensetsu_kyosai || '');

    // 中退共（Row 3）
    sheet.getRange(baseRow + 2, 46).setValue(staff.chusho_kyosai || '');

    // 特別教育（Row 4, column AU）
    sheet.getRange(baseRow + 3, 47).setValue(staff.special_training || '');

    // 技能講習（Row 4）
    sheet.getRange(baseRow + 3, 49).setValue(staff.skill_training || '');

    // 免許（Row 4）
    sheet.getRange(baseRow + 3, 51).setValue(staff.licenses || '');
  },

  /**
   * 和暦日付フォーマット
   * @param {Date|string} date - 日付
   * @returns {string} フォーマットされた日付文字列
   */
  _formatJapaneseDate: function(date) {
    if (!date) return '';

    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';

      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();

      // 和暦変換
      let era, eraYear;
      if (year >= 2019) {
        era = '令和';
        eraYear = year - 2018;
      } else if (year >= 1989) {
        era = '平成';
        eraYear = year - 1988;
      } else if (year >= 1926) {
        era = '昭和';
        eraYear = year - 1925;
      } else {
        era = '大正';
        eraYear = year - 1911;
      }

      return `${era}${eraYear}年${month}月${day}日`;
    } catch (e) {
      return '';
    }
  },

  /**
   * 年齢を計算（Asia/Tokyo基準）
   * @param {Date|string} birthDate - 生年月日
   * @returns {number|null} 年齢
   */
  _calculateAge: function(birthDate) {
    if (!birthDate) return null;

    try {
      const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
      if (isNaN(birth.getTime())) return null;

      const today = new Date();
      // Asia/Tokyo基準
      const todayJst = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

      let age = todayJst.getFullYear() - birth.getFullYear();
      const monthDiff = todayJst.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && todayJst.getDate() < birth.getDate())) {
        age--;
      }

      return age;
    } catch (e) {
      return null;
    }
  },

  /**
   * 経験年数を計算
   * @param {Date|string} hireDate - 雇入日
   * @returns {number|null} 経験年数
   */
  _calculateExperienceYears: function(hireDate) {
    if (!hireDate) return null;

    try {
      const hire = hireDate instanceof Date ? hireDate : new Date(hireDate);
      if (isNaN(hire.getTime())) return null;

      const today = new Date();
      const todayJst = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

      let years = todayJst.getFullYear() - hire.getFullYear();
      const monthDiff = todayJst.getMonth() - hire.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && todayJst.getDate() < hire.getDate())) {
        years--;
      }

      return Math.max(0, years);
    } catch (e) {
      return null;
    }
  },

  /**
   * 雇用保険番号を下4桁でフォーマット
   * @param {string|number} insuranceNo - 雇用保険番号
   * @returns {string} 下4桁
   */
  _formatInsuranceNumber: function(insuranceNo) {
    if (!insuranceNo) return '';

    const str = String(insuranceNo).replace(/[^0-9]/g, '');
    if (str.length === 0) return '';

    // 下4桁を取得、4桁未満は左ゼロ埋め
    const last4 = str.slice(-4);
    return last4.padStart(4, '0');
  },

  /**
   * PDF出力
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {string} fileName - ファイル名
   * @param {GoogleAppsScript.Drive.Folder} folder - 出力フォルダ
   * @param {Object} options - オプション
   * @returns {Object} { fileId, url, fileName, type }
   */
  _exportToPdf: function(spreadsheet, fileName, folder, options) {
    const pdfFileName = fileName + '.pdf';

    // PDF変換
    const pdfBlob = this._exportSpreadsheetToPdf(spreadsheet.getId());
    pdfBlob.setName(pdfFileName);

    // 同名ファイル処理
    if (options.action === 'overwrite') {
      const existingFiles = folder.getFilesByName(pdfFileName);
      while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
      }
    }

    // PDFファイルを保存
    const pdfFile = folder.createFile(pdfBlob);

    // 一時スプレッドシートを削除
    if (!options.keepSheet) {
      DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
    }

    return {
      fileId: pdfFile.getId(),
      url: pdfFile.getUrl(),
      fileName: pdfFileName,
      type: 'pdf'
    };
  },

  /**
   * Excel出力
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {string} fileName - ファイル名
   * @param {GoogleAppsScript.Drive.Folder} folder - 出力フォルダ
   * @param {Object} options - オプション
   * @returns {Object} { fileId, url, fileName, type }
   */
  _exportToExcel: function(spreadsheet, fileName, folder, options) {
    const xlsxFileName = fileName + '.xlsx';

    // Excel変換
    const xlsxBlob = this._exportSpreadsheetToXlsx(spreadsheet.getId());
    xlsxBlob.setName(xlsxFileName);

    // 同名ファイル処理
    if (options.action === 'overwrite') {
      const existingFiles = folder.getFilesByName(xlsxFileName);
      while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
      }
    }

    // Excelファイルを保存
    const xlsxFile = folder.createFile(xlsxBlob);

    // 一時スプレッドシートを削除
    if (!options.keepSheet) {
      DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
    }

    return {
      fileId: xlsxFile.getId(),
      url: xlsxFile.getUrl(),
      fileName: xlsxFileName,
      type: 'xlsx'
    };
  },

  /**
   * スプレッドシートをPDFに変換
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {GoogleAppsScript.Base.Blob} PDFブロブ
   */
  _exportSpreadsheetToPdf: function(spreadsheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
      `format=pdf` +
      `&portrait=false` +  // 横向き（作業員名簿は横長）
      `&size=A4` +
      `&fitw=true` +       // 幅を1ページに収める
      `&fith=false` +      // 高さは複数ページ可
      `&sheetnames=false` +
      `&printtitle=false` +
      `&pagenumbers=false` +
      `&gridlines=false` +
      `&fzr=true` +        // 凍結行を各ページで繰り返し
      `&horizontal_alignment=CENTER`;

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    return response.getBlob().setContentType('application/pdf');
  },

  /**
   * スプレッドシートをExcelに変換
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {GoogleAppsScript.Base.Blob} Excelブロブ
   */
  _exportSpreadsheetToXlsx: function(spreadsheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    return response.getBlob().setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  },

  /**
   * 設定状況を取得
   * @returns {Object} 設定状況
   */
  getConfigStatus: function() {
    const props = PropertiesService.getScriptProperties();

    const templateId = props.getProperty(this.TEMPLATE_KEY);
    const folderId = props.getProperty(this.OUTPUT_FOLDER_KEY);

    const status = {
      template: {
        key: this.TEMPLATE_KEY,
        configured: !!templateId,
        templateId: templateId || null
      },
      folder: {
        key: this.OUTPUT_FOLDER_KEY,
        configured: !!folderId,
        folderId: folderId || null
      }
    };

    // ファイル/フォルダ存在確認
    if (templateId) {
      try {
        const file = DriveApp.getFileById(templateId);
        status.template.fileName = file.getName();
        status.template.accessible = true;
      } catch (e) {
        status.template.accessible = false;
        status.template.error = 'ファイルにアクセスできません';
      }
    }

    if (folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        status.folder.folderName = folder.getName();
        status.folder.accessible = true;
        status.folder.url = `https://drive.google.com/drive/folders/${folderId}`;
      } catch (e) {
        status.folder.accessible = false;
        status.folder.error = 'フォルダにアクセスできません';
      }
    }

    return status;
  }
};


/**
 * 作業員名簿テンプレートIDを設定（GASエディタから一度だけ実行）
 * テンプレートファイルID: {{TEMPLATE_ID_WORKER_ROSTER}}
 */
function setWorkerRosterTemplateId() {
  const templateId = '{{TEMPLATE_ID_WORKER_ROSTER}}';
  PropertiesService.getScriptProperties().setProperty('TEMPLATE_WORKER_ROSTER_ID', templateId);
  Logger.log('Worker roster template set to: ' + templateId);
  Logger.log('URL: https://docs.google.com/spreadsheets/d/' + templateId);
}

/**
 * 作業員名簿出力フォルダIDを設定（GASエディタから一度だけ実行）
 * gas-dispatch-system > 出力 > 作業員名簿
 *
 * 親フォルダIDを指定: setWorkerRosterFolderId('親フォルダID')
 * または引数なしで実行すると、INVOICE_EXPORT_FOLDER_ID/PAYOUT_EXPORT_FOLDER_IDの
 * 親フォルダ（出力フォルダ）を自動検出して使用
 */
function setWorkerRosterFolderId(parentFolderId) {
  const props = PropertiesService.getScriptProperties();

  // 親フォルダIDを決定
  let outputFolderId = parentFolderId;

  if (!outputFolderId) {
    // 既存の出力フォルダ設定から親フォルダを推測
    const invoiceFolderId = props.getProperty('INVOICE_EXPORT_FOLDER_ID');
    const payoutFolderId = props.getProperty('PAYOUT_EXPORT_FOLDER_ID');

    if (invoiceFolderId) {
      try {
        const invoiceFolder = DriveApp.getFolderById(invoiceFolderId);
        const parents = invoiceFolder.getParents();
        if (parents.hasNext()) {
          outputFolderId = parents.next().getId();
          Logger.log('請求書フォルダの親から出力フォルダを検出: ' + outputFolderId);
        }
      } catch (e) {
        Logger.log('請求書フォルダにアクセスできません: ' + e.message);
      }
    }

    if (!outputFolderId && payoutFolderId) {
      try {
        const payoutFolder = DriveApp.getFolderById(payoutFolderId);
        const parents = payoutFolder.getParents();
        if (parents.hasNext()) {
          outputFolderId = parents.next().getId();
          Logger.log('給与フォルダの親から出力フォルダを検出: ' + outputFolderId);
        }
      } catch (e) {
        Logger.log('給与フォルダにアクセスできません: ' + e.message);
      }
    }
  }

  if (!outputFolderId) {
    Logger.log('ERROR: 親フォルダIDを指定してください。');
    Logger.log('使用方法: setWorkerRosterFolderId("親フォルダID")');
    Logger.log('または INVOICE_EXPORT_FOLDER_ID / PAYOUT_EXPORT_FOLDER_ID を先に設定してください。');
    return;
  }

  try {
    const outputFolder = DriveApp.getFolderById(outputFolderId);
    let rosterFolder;

    // 「作業員名簿」フォルダを検索
    const folders = outputFolder.getFoldersByName('作業員名簿');
    if (folders.hasNext()) {
      rosterFolder = folders.next();
      Logger.log('既存の作業員名簿フォルダを使用: ' + rosterFolder.getId());
    } else {
      // なければ作成
      rosterFolder = outputFolder.createFolder('作業員名簿');
      Logger.log('作業員名簿フォルダを作成: ' + rosterFolder.getId());
    }

    props.setProperty('WORKER_ROSTER_FOLDER_ID', rosterFolder.getId());
    Logger.log('Worker roster folder set to: ' + rosterFolder.getId());
    Logger.log('URL: https://drive.google.com/drive/folders/' + rosterFolder.getId());

  } catch (e) {
    Logger.log('ERROR: 出力フォルダにアクセスできません: ' + e.message);
  }
}

/**
 * 作業員名簿の設定状況を確認
 */
function checkWorkerRosterConfig() {
  const status = WorkerRosterService.getConfigStatus();
  Logger.log('=== 作業員名簿設定状況 ===');
  Logger.log(JSON.stringify(status, null, 2));
  return status;
}
