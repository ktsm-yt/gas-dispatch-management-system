/**
 * Google Drive Folder Initialization Script
 *
 * KTSM-22: Drive フォルダ構成を作成します
 *
 * フォルダ構成:
 * /gas-dispatch-system/
 *   ├── /テンプレート/           (テンプレート Excel/スプレッドシート)
 *   ├── /出力/
 *   │   ├── /請求書/             (生成された請求書 PDF)
 *   │   └── /給与明細/           (給与明細 PDF)
 *   ├── /アーカイブ/
 *   │   ├── /2025年度/
 *   │   └── /2026年度/           (年度別アーカイブ)
 *   └── /ドキュメント/
 *       └── /仕様書/            (システム仕様書等)
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
    '出力/給与明細',
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

    // 顧客フォルダ親のIDを保存
    const customerFolder = findFolderByName('顧客', rootFolder);
    if (customerFolder) {
      prop.setProperty('CUSTOMER_FOLDERS_PARENT_ID', customerFolder.getId());
      Logger.log(`✓ 顧客フォルダ親を設定: ${customerFolder.getId()}`);
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
 * @returns {GoogleAppsScript.Drive.Folder|null} 見つかったフォルダ、見つからない場合は null
 */
function findFolderByName(folderName, parentFolder) {
  if (parentFolder) {
    // 親フォルダ内を検索
    const folders = parentFolder.getFoldersByName(folderName);
    return folders.hasNext() ? folders.next() : null;
  } else {
    // My Drive のルートを検索
    const folders = DriveApp.getFoldersByName(folderName);
    while (folders.hasNext()) {
      const folder = folders.next();
      // ルートレベルのフォルダのみ（親がない）
      const parents = folder.getParents();
      if (!parents.hasNext() || parents.next().getId() === DriveApp.getRootFolder().getId()) {
        return folder;
      }
    }
    return null;
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
 * createDevDatabase() の後に実行してください
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
