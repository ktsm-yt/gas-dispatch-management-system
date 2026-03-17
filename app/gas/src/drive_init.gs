/**
 * Google Drive Folder Initialization Script
 *
 * KTSM-22: Drive フォルダ構成を作成します
 *
 * フォルダ構成:
 * /gas-dispatch-system/
 *   ├── /テンプレート/           (テンプレート Excel/スプレッドシート)
 *   │   ├── /様式1/ /様式2/ /様式3/ /頭紙/
 *   ├── /出力/
 *   │   ├── /請求書/             (生成された請求書 PDF)  → INVOICE_EXPORT_FOLDER_ID
 *   │   ├── /支払明細/           (支払明細 PDF/Excel)    → PAYOUT_EXPORT_FOLDER_ID
 *   │   ├── /作業員名簿/         (作業員名簿 PDF/Excel)  → WORKER_ROSTER_FOLDER_ID
 *   │   └── /税理士レポート/     (税理士向けExcel)       → TAX_REPORT_EXPORT_FOLDER_ID
 *   ├── /顧客/                   (顧客別フォルダ)        → CUSTOMER_FOLDERS_PARENT_ID
 *   ├── /アーカイブ/             (年度アーカイブ)        → ARCHIVE_FOLDER_ID
 *   └── /ドキュメント/
 *       └── /仕様書/
 */

const FOLDER_STRUCTURE = {
  rootFolderName: 'gas-dispatch-system',
  folders: [
    'テンプレート',
    'テンプレート/様式1',
    'テンプレート/様式2',
    'テンプレート/様式3',
    'テンプレート/頭紙',
    '出力',
    '出力/請求書',
    '出力/支払明細',
    '出力/作業員名簿',
    '出力/税理士レポート',
    '顧客',  // 顧客専用フォルダの親（会社別フォルダはここに作成）
    'アーカイブ',
    'ドキュメント',
    'ドキュメント/仕様書'
  ]
};

/**
 * Drive フォルダ構成を初期化（開発用）
 */
function initDriveFolders() {
  try {
    Logger.log('Drive フォルダ構成を初期化中...');

    // ルートフォルダを作成または検索
    let rootFolder = findFolderByName(FOLDER_STRUCTURE.rootFolderName, null);

    if (!rootFolder) {
      rootFolder = DriveApp.createFolder(FOLDER_STRUCTURE.rootFolderName);
      Logger.log(`✓ ルートフォルダを作成: ${FOLDER_STRUCTURE.rootFolderName}`);
    } else {
      Logger.log(`✓ ルートフォルダを検索: ${FOLDER_STRUCTURE.rootFolderName}`);
    }

    const rootFolderId = rootFolder.getId();

    // フォルダ構成を作成
    for (const folderPath of FOLDER_STRUCTURE.folders) {
      createFolderStructure(rootFolder, folderPath);
    }

    // ScriptProperties に保存
    const prop = PropertiesService.getScriptProperties();
    prop.setProperty('DRIVE_ROOT_FOLDER_ID', rootFolderId);

    // 各フォルダの Script Properties を登録
    const folderPropertyMap = {
      '顧客': 'CUSTOMER_FOLDERS_PARENT_ID',
      '出力/請求書': 'INVOICE_EXPORT_FOLDER_ID',
      '出力/支払明細': 'PAYOUT_EXPORT_FOLDER_ID',
      '出力/作業員名簿': 'WORKER_ROSTER_FOLDER_ID',
      '出力/税理士レポート': 'TAX_REPORT_EXPORT_FOLDER_ID',
      'アーカイブ': 'ARCHIVE_FOLDER_ID',
    };

    for (const [folderPath, propertyKey] of Object.entries(folderPropertyMap)) {
      const folder = createFolderStructure(rootFolder, folderPath);
      if (folder) {
        prop.setProperty(propertyKey, folder.getId());
        Logger.log(`✓ ${propertyKey} を設定: ${folder.getId()}`);
      }
    }

    Logger.log('\n=== Drive フォルダ初期化完了 ===');
    Logger.log(`Root Folder ID: ${rootFolderId}`);
    Logger.log(`URL: https://drive.google.com/drive/folders/${rootFolderId}`);

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
  }
}

/**
 * フォルダパスを作成（再帰的に）
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - 親フォルダ
 * @param {string} folderPath - フォルダパス（例: "フォルダ/サブフォルダ"）
 */
function createFolderStructure(parentFolder, folderPath) {
  const parts = folderPath.split('/');

  let currentFolder = parentFolder;
  for (const folderName of parts) {
    let nextFolder = findFolderByName(folderName, currentFolder);

    if (!nextFolder) {
      nextFolder = currentFolder.createFolder(folderName);
      Logger.log(`  ✓ フォルダ作成: ${folderPath}`);
    }

    currentFolder = nextFolder;
  }

  return currentFolder;
}

/**
 * 名前からフォルダを検索
 * @param {string} folderName - フォルダ名
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - 親フォルダ（null の場合は My Drive）
 * @param {boolean} [throwOnDuplicate=false] - 重複時にエラーを投げるか（デフォルト: false、初期化時は警告のみ）
 * @returns {GoogleAppsScript.Drive.Folder|null} 見つかったフォルダ、見つからない場合は null
 * @throws {Error} throwOnDuplicate=true かつ同名フォルダが複数存在する場合
 */
function findFolderByName(folderName, parentFolder, throwOnDuplicate) {
  if (parentFolder) {
    // 親フォルダ内を検索
    const folders = parentFolder.getFoldersByName(folderName);
    if (!folders.hasNext()) {
      return null;
    }

    const firstFolder = folders.next();

    // 重複チェック
    if (folders.hasNext()) {
      const parentName = parentFolder.getName();
      const message = `フォルダ重複警告: "${parentName}" 内に "${folderName}" フォルダが複数存在します。`;
      Logger.log(message);

      if (throwOnDuplicate) {
        throw new Error(message + ' 手動で重複を解消してください。');
      }
    }

    return firstFolder;
  } else {
    // My Drive のルートを検索
    const folders = DriveApp.getFoldersByName(folderName);
    const rootFolders = [];

    while (folders.hasNext()) {
      const folder = folders.next();
      // ルートレベルのフォルダのみ（親がない）
      const parents = folder.getParents();
      if (!parents.hasNext() || parents.next().getId() === DriveApp.getRootFolder().getId()) {
        rootFolders.push(folder);
      }
    }

    if (rootFolders.length === 0) {
      return null;
    }

    // 重複チェック
    if (rootFolders.length > 1) {
      const message = `フォルダ重複警告: ルートに "${folderName}" フォルダが${rootFolders.length}個存在します。`;
      Logger.log(message);

      if (throwOnDuplicate) {
        throw new Error(message + ' 手動で重複を解消してください。');
      }
    }

    return rootFolders[0];
  }
}

/**
 * Drive フォルダ構成をリセット（開発用）
 * ※注意：ルートフォルダ内のすべてが削除されます
 */
function resetDriveFolders() {
  if (!confirm('Drive フォルダ構成をリセットしますか？ 中身が全削除されます。')) return;

  try {
    const prop = PropertiesService.getScriptProperties();
    const rootFolderId = prop.getProperty('DRIVE_ROOT_FOLDER_ID');

    if (!rootFolderId) {
      throw new Error('DRIVE_ROOT_FOLDER_ID が設定されていません');
    }

    const rootFolder = DriveApp.getFolderById(rootFolderId);

    // フォルダ内のすべてのアイテムを削除
    const files = rootFolder.getFiles();
    while (files.hasNext()) {
      files.next().setTrashed(true);
    }

    const folders = rootFolder.getFolders();
    while (folders.hasNext()) {
      folders.next().setTrashed(true);
    }

    Logger.log('✓ Drive フォルダをリセットしました');

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
  }
}

/**
 * 開発用フォルダ構成を初期化（一括）
 * ※ 新規セットアップの場合は setupAll()（setup.gs）を推奨
 * この関数は後方互換のために残しています
 */
function initDevEnvironment() {
  try {
    Logger.log('=== 開発環境を初期化中 ===\n');

    // 1. DB Spreadsheet 作成
    Logger.log('1. DB Spreadsheet を作成...');
    createDevDatabase();

    // 2. Drive フォルダ構成作成
    Logger.log('\n2. Drive フォルダ構成を作成...');
    initDriveFolders();

    Logger.log('\n✓ 開発環境の初期化が完了しました！');

  } catch (error) {
    Logger.log(`✗ 初期化エラー: ${error.message}`);
  }
}
