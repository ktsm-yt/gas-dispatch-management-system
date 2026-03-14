/**
 * Excel Export Utility
 *
 * 税理士レポート・各種Excelエクスポートの共通パイプライン
 * PayoutExportService のパターンを抽出（既存は変更しない）
 */

interface ExcelExportOptions {
  action?: 'overwrite' | 'rename';
}

interface ExcelExportFileResult {
  fileId: string;
  url: string;
  fileName: string;
}

const ExcelExportUtil = {

  /**
   * スプレッドシートをxlsx形式のBlobに変換
   */
  exportToXlsx_: function(spreadsheetId: string): GoogleAppsScript.Base.Blob {
    const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx';
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return response.getBlob().setContentType(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  },

  /**
   * ScriptPropertyからフォルダIDを取得し、Driveフォルダを返す
   */
  getOutputFolder_: function(propertyKey: string, label: string): GoogleAppsScript.Drive.Folder {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(propertyKey);

    if (!folderId) {
      throw new Error(
        propertyKey + ' が未設定です。\n' +
        'initDriveFolders() を実行するか、ScriptPropertiesで設定してください。'
      );
    }

    try {
      return DriveApp.getFolderById(folderId);
    } catch (_) {
      throw new Error(
        label + 'フォルダにアクセスできません（ID: ' + folderId + '）。'
      );
    }
  },

  /**
   * フォルダ内にサブフォルダを取得または作成
   */
  getOrCreateSubfolder_: function(parent: GoogleAppsScript.Drive.Folder, name: string): GoogleAppsScript.Drive.Folder {
    const folders = parent.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parent.createFolder(name);
  },

  /**
   * フォルダ内の同名ファイルをチェック
   */
  checkExistingFileInFolder_: function(folder: GoogleAppsScript.Drive.Folder, fileName: string): ExistingFileCheckResult {
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      return {
        exists: true,
        existingFile: {
          id: file.getId(),
          name: file.getName(),
          url: file.getUrl(),
          modifiedDate: file.getLastUpdated().toISOString()
        }
      };
    }
    return { exists: false };
  },

  /**
   * フォルダの設定状況を確認
   */
  getExportFolderStatus_: function(propertyKey: string): ExportFolderStatus {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(propertyKey);

    if (!folderId) {
      return {
        configured: false,
        setupGuide: 'initDriveFolders() を実行してフォルダを初期化してください。'
      };
    }

    try {
      const folder = DriveApp.getFolderById(folderId);
      return {
        configured: true,
        folderId: folderId,
        folderName: folder.getName(),
        url: 'https://drive.google.com/drive/folders/' + folderId
      };
    } catch (_) {
      return {
        configured: false,
        folderId: folderId,
        error: 'フォルダにアクセスできません',
        setupGuide: 'ScriptPropertiesでフォルダIDを更新してください。'
      };
    }
  },

  /**
   * xlsxBlobをDriveフォルダに保存（上書き/リネーム対応）
   */
  saveToDrive_: function(
    folder: GoogleAppsScript.Drive.Folder,
    xlsxBlob: GoogleAppsScript.Base.Blob,
    fileName: string,
    options: ExcelExportOptions = {}
  ): ExcelExportFileResult {
    xlsxBlob.setName(fileName);

    // 上書き: 先に新規作成し、成功後に旧ファイルをTrash（作成失敗時のデータ消失を防止）
    const oldFileIds: string[] = [];
    if (options.action === 'overwrite') {
      const existingFiles = folder.getFilesByName(fileName);
      while (existingFiles.hasNext()) {
        oldFileIds.push(existingFiles.next().getId());
      }
    }

    const file = folder.createFile(xlsxBlob);

    // 新規作成成功後に旧ファイルを削除
    oldFileIds.forEach(function(id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (_) { /* best effort */ }
    });
    return {
      fileId: file.getId(),
      url: file.getUrl(),
      fileName: fileName
    };
  },

  /**
   * 一時スプレッドシートを削除（finallyブロックで使用）
   */
  cleanupTempSpreadsheet_: function(spreadsheetId: string): void {
    try {
      DriveApp.getFileById(spreadsheetId).setTrashed(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('Failed to trash temp spreadsheet: ' + msg);
    }
  },

  /**
   * ヘッダー行のスタイルを設定（共通）
   */
  styleHeaderRow_: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, columnCount: number): void {
    const headerRange = sheet.getRange(1, 1, 1, columnCount);
    headerRange.setBackground('#F7FAFC');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  },

  /**
   * 合計行を追加（共通）
   */
  styleTotalRow_: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, row: number, columnCount: number): void {
    const totalRange = sheet.getRange(row, 1, 1, columnCount);
    totalRange.setFontWeight('bold');
    totalRange.setBackground('#EDF2F7');
  },

  /**
   * 指定列に通貨書式を設定
   */
  formatCurrencyColumns_: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    columns: number[],
    startRow: number,
    rowCount: number
  ): void {
    if (rowCount <= 0) return;
    columns.forEach(function(col) {
      sheet.getRange(startRow, col, rowCount, 1).setNumberFormat('#,##0');
    });
  }
};
