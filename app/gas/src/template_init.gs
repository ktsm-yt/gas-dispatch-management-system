/**
 * Template Initialization Script
 *
 * KTSM-23: 請求書テンプレートの作成・管理
 */

// ============================================================
// テンプレートID定義
// ============================================================
const TEMPLATE_IDS = {
  // 様式1（顧客D型）- 結合セル多め
  FORMAT1: '1_Bs1mPaY4wkawbzPKbWOYYfz10TuJoKUrNuZsy6PokY',

  // 様式2（元）- Excelからインポートした元データ
  FORMAT2_ORIGINAL: '1PrrFQTsWOCh3jbi18ZFsLcHX6VjRtGCwC4HJ0blCGYc',

  // 様式2（分離版）- 発注No/営業所を分離したテンプレート（最新版）
  FORMAT2_SEPARATED: '1u-TlPQZSh5E2bljT-5vWeDaz7rNe9_JbIzFl0gmXSXI',

  // 様式3（顧客B型）- シンプル一覧形式（№列付き9列構成）
  FORMAT3: '1pMuR7B02BfbSY5kP_Lp-YIqOPIiLd1zxgIgW786Cf9o',

  // 頭紙（顧客C型）- サマリー形式
  ATAMAGAMI: '1yknAt_VqChIznk5Vc45XkVDD1feMtq-qXZ4j70gRBSs',
};

/**
 * 既存の様式2テンプレートの構造を確認
 */
function analyzeFormat2Template() {
  const sourceId = TEMPLATE_IDS.FORMAT2_ORIGINAL;
  const ss = SpreadsheetApp.openById(sourceId);
  const sheet = ss.getSheets()[0];

  Logger.log('=== 様式2テンプレート分析 ===');
  Logger.log(`シート名: ${sheet.getName()}`);
  Logger.log(`最終行: ${sheet.getLastRow()}`);
  Logger.log(`最終列: ${sheet.getLastColumn()}`);

  // 列幅を取得
  Logger.log('\n列幅:');
  for (let i = 1; i <= sheet.getLastColumn(); i++) {
    Logger.log(`  列${i}: ${sheet.getColumnWidth(i)}px`);
  }

  // ヘッダー行を探す（A9, A101, A201, A300 付近）
  const headerRows = [9, 101, 201, 300];
  Logger.log('\nヘッダー行の内容:');
  for (const row of headerRows) {
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log(`  行${row}: ${values.join(' | ')}`);
  }

  // 印刷設定を確認
  Logger.log('\n印刷範囲/ページ設定は手動で確認してください');
}

/**
 * 様式2 分離版テンプレートを作成
 * 既存テンプレートをコピーして、発注No/営業所列を追加
 */
function createFormat2Template() {
  try {
    Logger.log('様式2 分離版テンプレートを作成中...');

    const sourceId = TEMPLATE_IDS.FORMAT2_ORIGINAL;
    const prop = PropertiesService.getScriptProperties();

    // 元のテンプレートをコピー
    const sourceFile = DriveApp.getFileById(sourceId);
    const copiedFile = sourceFile.makeCopy('様式2_分離版テンプレート');
    const newSs = SpreadsheetApp.openById(copiedFile.getId());
    const sheet = newSs.getSheets()[0];

    Logger.log(`✓ テンプレートをコピー: ${copiedFile.getId()}`);

    // 元のテンプレートの列構成を確認
    // 現状: 日付 | 案件名(発注No/営業所埋め込み) | 品目 | 時間/備考 | 数量 | 単位 | 単価 | 金額
    // 目標: 日付 | 案件名 | 発注No | 営業所 | 品目 | 時間/備考 | 数量 | 単位 | 単価 | 金額

    // 案件名列(B列)の右に2列挿入
    // まず元の構造を確認
    const lastCol = sheet.getLastColumn();
    Logger.log(`元の列数: ${lastCol}`);

    // B列の右（C列の位置）に2列挿入
    sheet.insertColumnsAfter(2, 2);
    Logger.log('✓ 2列挿入完了');

    // ヘッダー行に「発注No」「営業所」を設定
    // ヘッダー行は9行目、101行目、201行目、300行目に繰り返しがある
    const headerRows = [9, 101, 201, 300];
    for (const row of headerRows) {
      // 行が存在するか確認
      if (row <= sheet.getLastRow()) {
        sheet.getRange(row, 3).setValue('発注No');
        sheet.getRange(row, 4).setValue('営業所');
        Logger.log(`✓ 行${row}にヘッダー設定`);
      }
    }

    // 挿入した列の幅を調整（元の列幅に合わせてスリムに）
    // 印刷時に横幅が崩れないよう、他の列を少し狭めて調整
    sheet.setColumnWidth(3, 70);  // 発注No
    sheet.setColumnWidth(4, 60);  // 営業所

    // 元の列幅を少し狭めて全体のバランスを取る
    // B列（案件名）を少し狭める
    const currentBWidth = sheet.getColumnWidth(2);
    sheet.setColumnWidth(2, Math.max(currentBWidth - 50, 150));

    Logger.log('✓ 列幅調整完了');

    // テンプレートフォルダに移動
    const rootFolderId = prop.getProperty('DRIVE_ROOT_FOLDER_ID');
    if (rootFolderId) {
      const rootFolder = DriveApp.getFolderById(rootFolderId);
      const templateFolders = rootFolder.getFoldersByName('テンプレート');
      if (templateFolders.hasNext()) {
        const templateFolder = templateFolders.next();
        const format2Folders = templateFolder.getFoldersByName('様式2');
        if (format2Folders.hasNext()) {
          copiedFile.moveTo(format2Folders.next());
          Logger.log('✓ テンプレートフォルダに移動');
        }
      }
    }

    // ScriptProperties に登録
    prop.setProperty('TEMPLATE_FORMAT2_ID', copiedFile.getId());

    Logger.log('\n=== 様式2 分離版テンプレート作成完了 ===');
    Logger.log(`ID: ${copiedFile.getId()}`);
    Logger.log(`URL: ${newSs.getUrl()}`);
    Logger.log('\n※ 印刷プレビューで横幅を確認し、必要に応じて列幅を微調整してください');

    return copiedFile.getId();

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 様式3テンプレートを作成（顧客B型 - 9列構成）
 * 列構成: №, 担当工事課, 担当監督名, 物件コード, 現場名, 施工日, 内容, 金額（税抜）, 金額（税込）
 */
function createFormat3Template() {
  try {
    Logger.log('様式3テンプレート（顧客B型）を作成中...');

    const prop = PropertiesService.getScriptProperties();
    const rootFolderId = prop.getProperty('DRIVE_ROOT_FOLDER_ID');
    if (!rootFolderId) {
      throw new Error('DRIVE_ROOT_FOLDER_ID が設定されていません');
    }

    const rootFolder = DriveApp.getFolderById(rootFolderId);
    const templateFolder = rootFolder.getFoldersByName('テンプレート').next();
    const format3Folder = templateFolder.getFoldersByName('様式3').next();

    // スプレッドシートを作成
    const ss = SpreadsheetApp.create('様式3_顧客B_テンプレート');
    const sheet = ss.getSheets()[0];
    sheet.setName('追加請求一覧（改1）');

    // タイトル行（B1に配置）
    sheet.getRange('B1').setValue('追加請求一覧（改1）');
    sheet.getRange('B1').setFontSize(14).setFontWeight('bold');

    // ヘッダー行（9列構成、№列付き）
    const headers = [
      '№', '担当工事課', '担当監督名', '物件コード', '現場名',
      '施工日', '内容', '金額（税抜）', '金額（税込）'
    ];
    const headerRange = sheet.getRange(2, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground('#E8F4F8');
    headerRange.setFontWeight('bold');

    // 列幅を設定（9列）
    const columnWidths = [40, 120, 100, 100, 200, 100, 150, 100, 100];
    for (let i = 0; i < columnWidths.length; i++) {
      sheet.setColumnWidth(i + 1, columnWidths[i]);
    }

    // サンプルデータ（9列、№列付き）
    const sampleData = [
      [1, '工事1課', '山田', 'P001', '○○邸', '2025/01/15', '荷揚げ作業', 36000, '=H3*1.1'],
      [2, '工事2課', '鈴木', 'P002', '△△マンション', '2025/01/16', '鳶作業', 45000, '=H4*1.1']
    ];
    sheet.getRange(3, 1, sampleData.length, sampleData[0].length).setValues(sampleData);

    // 金額列のフォーマット（H列とI列）
    sheet.getRange('H:I').setNumberFormat('#,##0');

    // フリーズペイン
    sheet.setFrozenRows(2);

    // ファイルをテンプレートフォルダに移動
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(format3Folder);

    // ScriptProperties に登録
    prop.setProperty('TEMPLATE_FORMAT3_ID', ss.getId());

    Logger.log('✓ 様式3テンプレート（顧客B型）作成完了');
    Logger.log(`  ID: ${ss.getId()}`);
    Logger.log(`  URL: ${ss.getUrl()}`);

    return ss.getId();

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * テンプレートIDを ScriptProperties に登録
 * 手動でアップロードしたテンプレートのIDを登録する場合に使用
 */
function registerTemplateIds() {
  const prop = PropertiesService.getScriptProperties();

  // ここに手動でアップロードしたテンプレートのIDを設定
  // GAS エディタで直接編集するか、下記の値を更新して実行

  const templateIds = {
    // 様式1（顧客D型）
    TEMPLATE_FORMAT1_ID: TEMPLATE_IDS.FORMAT1,

    // 様式2（分離版）
    TEMPLATE_FORMAT2_ID: TEMPLATE_IDS.FORMAT2_SEPARATED,

    // 様式3（顧客B型）
    TEMPLATE_FORMAT3_ID: TEMPLATE_IDS.FORMAT3,

    // 頭紙（顧客C型）
    TEMPLATE_ATAMAGAMI_ID: TEMPLATE_IDS.ATAMAGAMI,
  };

  for (const [key, value] of Object.entries(templateIds)) {
    if (value && !value.startsWith('xxxx')) {
      prop.setProperty(key, value);
      Logger.log(`✓ ${key} を登録しました`);
    }
  }

  // 現在の設定を表示
  Logger.log('\n=== 現在のテンプレート設定 ===');
  Logger.log(`TEMPLATE_FORMAT1_ID: ${prop.getProperty('TEMPLATE_FORMAT1_ID') || '(未設定)'}`);
  Logger.log(`TEMPLATE_FORMAT2_ID: ${prop.getProperty('TEMPLATE_FORMAT2_ID') || '(未設定)'}`);
  Logger.log(`TEMPLATE_FORMAT3_ID: ${prop.getProperty('TEMPLATE_FORMAT3_ID') || '(未設定)'}`);
  Logger.log(`TEMPLATE_ATAMAGAMI_ID: ${prop.getProperty('TEMPLATE_ATAMAGAMI_ID') || '(未設定)'}`);
}

/**
 * すべてのテンプレートを一括作成
 */
function createAllTemplates() {
  Logger.log('=== テンプレート一括作成 ===\n');

  // 様式2 分離版
  createFormat2Template();

  // 様式3
  createFormat3Template();

  Logger.log('\n✓ テンプレート作成完了');
  Logger.log('※ 様式1と頭紙は結合セルが多いため、手動アップロードしたファイルを使用してください');
}

// ============================================================
// A4縦 印刷対応 列幅調整関数
// ============================================================

/**
 * A4縦印刷用の列幅定義
 *
 * 方針:
 * - 印刷時に「ページに合わせる」でスケーリングするため、少し余裕を持たせた幅で設計
 * - PDF/Excelエクスポート時も同様にスケーリングされる想定
 * - 合計幅 約750-800px を目安（印刷時に自動縮小される）
 */
const A4_PORTRAIT_COLUMN_WIDTHS = {
  // 様式2（元）: 9列構成
  // A=日付, B=空白, C=案件名, D=品目, E=時間/備考, F=数量, G=単位, H=単価, I=金額
  // 現在のスプレッドシートの列幅に合わせた設定（合計645px）
  format2Original: {
    totalWidth: 645,
    columns: [
      { col: 1, name: '日付',      width: 55 },
      { col: 2, name: '(空白)',    width: 10 },
      { col: 3, name: '案件名',    width: 250 },
      { col: 4, name: '品目',      width: 55 },
      { col: 5, name: '時間/備考', width: 70 },
      { col: 6, name: '数量',      width: 40 },
      { col: 7, name: '単位',      width: 35 },
      { col: 8, name: '単価',      width: 60 },
      { col: 9, name: '金額',      width: 70 }
    ]
  },

  // 様式2（分離版）: 10列構成
  // A=日付, B=案件名, C=発注No, D=営業所, E=品目, F=時間/備考, G=数量, H=単位, I=単価, J=金額
  // 元の645pxから空白列削除(-10px)、発注No(+65px)、営業所(+45px)追加 → 案件名を調整
  format2Separated: {
    totalWidth: 695,
    columns: [
      { col: 1, name: '日付',      width: 55 },
      { col: 2, name: '案件名',    width: 200 },
      { col: 3, name: '発注No',    width: 65 },
      { col: 4, name: '営業所',    width: 45 },
      { col: 5, name: '品目',      width: 55 },
      { col: 6, name: '時間/備考', width: 70 },
      { col: 7, name: '数量',      width: 40 },
      { col: 8, name: '単位',      width: 35 },
      { col: 9, name: '単価',      width: 60 },
      { col: 10, name: '金額',     width: 70 }
    ]
  }
};

/**
 * 様式2（元）をA4縦に収まるよう列幅調整
 * スプレッドシートIDを指定するか、デフォルトで既知のIDを使用
 */
function adjustFormat2ForA4(spreadsheetId) {
  const targetId = spreadsheetId || TEMPLATE_IDS.FORMAT2_ORIGINAL;

  try {
    Logger.log('=== 様式2（元）A4縦対応 列幅調整 ===');
    const ss = SpreadsheetApp.openById(targetId);
    const sheet = ss.getSheets()[0];

    const config = A4_PORTRAIT_COLUMN_WIDTHS.format2Original;

    Logger.log(`シート名: ${sheet.getName()}`);
    Logger.log(`目標合計幅: ${config.totalWidth}px`);
    Logger.log('\n列幅を設定中...');

    let actualTotal = 0;
    for (const colConfig of config.columns) {
      sheet.setColumnWidth(colConfig.col, colConfig.width);
      actualTotal += colConfig.width;
      Logger.log(`  列${colConfig.col}(${colConfig.name}): ${colConfig.width}px`);
    }

    // 使用されていない列（J以降）を非表示にする
    const lastCol = sheet.getLastColumn();
    if (lastCol > config.columns.length) {
      for (let i = config.columns.length + 1; i <= lastCol; i++) {
        sheet.hideColumns(i);
      }
      Logger.log(`\n列${config.columns.length + 1}以降を非表示`);
    }

    Logger.log(`\n✓ 完了 (合計幅: ${actualTotal}px)`);
    Logger.log('\n※ 印刷プレビューで確認してください');
    Logger.log('  ファイル → 印刷 → 用紙サイズ: A4 / 向き: 縦');

    return true;

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 様式2（分離版）をA4縦に収まるよう列幅調整
 *
 * @param {string} spreadsheetId - 分離版テンプレートのスプレッドシートID（必須）
 *
 * 使用例:
 *   adjustFormat2SeparatedForA4('1ABC...XYZ');
 */
function adjustFormat2SeparatedForA4(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error('spreadsheetId は必須です。分離版テンプレートのIDを指定してください。');
  }

  try {
    Logger.log('=== 様式2（分離版）A4縦対応 列幅調整 ===');
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheets()[0];

    const config = A4_PORTRAIT_COLUMN_WIDTHS.format2Separated;

    Logger.log(`シート名: ${sheet.getName()}`);
    Logger.log(`目標合計幅: ${config.totalWidth}px`);
    Logger.log('\n列幅を設定中...');

    let actualTotal = 0;
    for (const colConfig of config.columns) {
      sheet.setColumnWidth(colConfig.col, colConfig.width);
      actualTotal += colConfig.width;
      Logger.log(`  列${colConfig.col}(${colConfig.name}): ${colConfig.width}px`);
    }

    // 使用されていない列（K以降）を非表示にする
    const lastCol = sheet.getLastColumn();
    if (lastCol > config.columns.length) {
      for (let i = config.columns.length + 1; i <= lastCol; i++) {
        sheet.hideColumns(i);
      }
      Logger.log(`\n列${config.columns.length + 1}以降を非表示`);
    }

    Logger.log(`\n✓ 完了 (合計幅: ${actualTotal}px)`);
    Logger.log('\n※ 印刷プレビューで確認してください');
    Logger.log('  ファイル → 印刷 → 用紙サイズ: A4 / 向き: 縦');

    return true;

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 現在のスプレッドシートの列幅を分析
 */
function analyzeCurrentColumnWidths(spreadsheetId) {
  const targetId = spreadsheetId || SpreadsheetApp.getActiveSpreadsheet()?.getId();
  if (!targetId) {
    Logger.log('スプレッドシートIDを指定してください');
    return;
  }

  const ss = SpreadsheetApp.openById(targetId);
  const sheet = ss.getSheets()[0];

  Logger.log('=== 列幅分析 ===');
  Logger.log(`スプレッドシート: ${ss.getName()}`);
  Logger.log(`シート: ${sheet.getName()}`);
  Logger.log(`最終列: ${sheet.getLastColumn()}`);

  let total = 0;
  Logger.log('\n現在の列幅:');
  for (let i = 1; i <= Math.min(sheet.getLastColumn(), 15); i++) {
    const width = sheet.getColumnWidth(i);
    total += width;
    const header = sheet.getRange(9, i).getValue() || '(空)';
    Logger.log(`  列${i}: ${width}px (${header})`);
  }

  Logger.log(`\n合計幅: ${total}px`);
  Logger.log(`A4縦の推奨幅: 約680px`);

  if (total > 700) {
    Logger.log(`⚠ 現在の幅(${total}px)はA4縦に収まらない可能性があります`);
  }
}

/**
 * 分離版テンプレートを新規作成（A4縦対応版）
 */
function createFormat2SeparatedTemplateA4() {
  try {
    Logger.log('様式2 分離版テンプレート（A4縦対応）を作成中...');

    const sourceId = TEMPLATE_IDS.FORMAT2_ORIGINAL;
    const prop = PropertiesService.getScriptProperties();

    // 元のテンプレートをコピー
    const sourceFile = DriveApp.getFileById(sourceId);
    const copiedFile = sourceFile.makeCopy('様式2_分離版テンプレート_A4');
    const newSs = SpreadsheetApp.openById(copiedFile.getId());
    const sheet = newSs.getSheets()[0];

    Logger.log(`✓ テンプレートをコピー: ${copiedFile.getId()}`);

    // 現在の列構成を確認（A=日付, B=空白, C=案件名, D=品目...）
    // B列を削除して、C列（案件名）の後ろに発注No/営業所を挿入

    // 1. B列（空白列）を削除
    sheet.deleteColumn(2);
    Logger.log('✓ B列（空白）を削除');

    // 2. B列（現在の案件名）の後ろに2列挿入
    sheet.insertColumnsAfter(2, 2);
    Logger.log('✓ 2列挿入（発注No, 営業所用）');

    // 3. ヘッダー行に「発注No」「営業所」を設定
    const headerRows = [9, 101, 201, 300];
    for (const row of headerRows) {
      if (row <= sheet.getLastRow()) {
        const rowData = sheet.getRange(row, 1, 1, 10).getValues()[0];
        // 列Cに「発注No」、列Dに「営業所」
        sheet.getRange(row, 3).setValue('発注No');
        sheet.getRange(row, 4).setValue('営業所');
        Logger.log(`✓ 行${row}にヘッダー設定`);
      }
    }

    // 4. A4縦対応の列幅を設定
    const config = A4_PORTRAIT_COLUMN_WIDTHS.format2Separated;
    for (const colConfig of config.columns) {
      sheet.setColumnWidth(colConfig.col, colConfig.width);
    }
    Logger.log('✓ A4縦対応の列幅を設定');

    // 5. 使用しない列を非表示
    const lastCol = sheet.getLastColumn();
    if (lastCol > config.columns.length) {
      for (let i = config.columns.length + 1; i <= lastCol; i++) {
        sheet.hideColumns(i);
      }
    }

    // テンプレートフォルダに移動
    const rootFolderId = prop.getProperty('DRIVE_ROOT_FOLDER_ID');
    if (rootFolderId) {
      const rootFolder = DriveApp.getFolderById(rootFolderId);
      const templateFolders = rootFolder.getFoldersByName('テンプレート');
      if (templateFolders.hasNext()) {
        const templateFolder = templateFolders.next();
        const format2Folders = templateFolder.getFoldersByName('様式2');
        if (format2Folders.hasNext()) {
          copiedFile.moveTo(format2Folders.next());
          Logger.log('✓ テンプレートフォルダに移動');
        }
      }
    }

    // ScriptProperties に登録
    prop.setProperty('TEMPLATE_FORMAT2_SEPARATED_ID', copiedFile.getId());

    Logger.log('\n=== 様式2 分離版テンプレート（A4縦対応）作成完了 ===');
    Logger.log(`ID: ${copiedFile.getId()}`);
    Logger.log(`URL: ${newSs.getUrl()}`);
    Logger.log('\n※ 印刷プレビューで確認してください');
    Logger.log('  ファイル → 印刷 → 用紙サイズ: A4 / 向き: 縦');

    return copiedFile.getId();

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

// ============================================================
// 分離版テンプレート作成（正しい列構成）
// ============================================================

/**
 * 様式2 分離版テンプレートを正しい列構成で作成
 *
 * 元の様式2: A=日付, B=空白, C=案件名, D=品目, E=時間/備考, F=数量, G=単位, H=単価, I=金額
 * 分離版:    A=日付, B=案件名, C=発注No, D=営業所, E=品目, F=時間/備考, G=数量, H=単位, I=単価, J=金額
 *
 * 変更点:
 * - B列（空白）を削除
 * - 案件名(B)の後に発注No(C), 営業所(D)を挿入
 */
function rebuildFormat2SeparatedTemplate() {
  try {
    Logger.log('=== 様式2 分離版テンプレート再構築 ===');
    Logger.log('目標構成: 日付 | 案件名 | 発注No | 営業所 | 品目 | 時間/備考 | 数量 | 単位 | 単価 | 金額\n');

    const sourceId = TEMPLATE_IDS.FORMAT2_ORIGINAL;
    const prop = PropertiesService.getScriptProperties();

    // 元のテンプレートをコピー
    const sourceFile = DriveApp.getFileById(sourceId);
    const copiedFile = sourceFile.makeCopy('様式2_分離版テンプレート_v2');
    const newSs = SpreadsheetApp.openById(copiedFile.getId());
    const sheet = newSs.getSheets()[0];

    Logger.log(`✓ テンプレートをコピー: ${copiedFile.getId()}`);

    // 元の構成: A=日付, B=空白, C=案件名, D=品目, E=時間/備考, F=数量, G=単位, H=単価, I=金額

    // Step 1: B列（空白列）を削除
    // → A=日付, B=案件名, C=品目, D=時間/備考, E=数量, F=単位, G=単価, H=金額
    sheet.deleteColumn(2);
    Logger.log('✓ Step 1: B列（空白）を削除');

    // Step 2: B列（案件名）の後ろに2列挿入
    // → A=日付, B=案件名, C=新規, D=新規, E=品目, F=時間/備考, G=数量, H=単位, I=単価, J=金額
    sheet.insertColumnsAfter(2, 2);
    Logger.log('✓ Step 2: 案件名の後に2列挿入');

    // Step 3: ヘッダー行に「発注No」「営業所」を設定
    // 元のテンプレートではヘッダー行が 9, 101, 201, 300 行目に繰り返しある
    const headerRows = [9];  // まず9行目だけ。他は必要に応じて追加
    for (const row of headerRows) {
      if (row <= sheet.getLastRow()) {
        sheet.getRange(row, 3).setValue('発注No');
        sheet.getRange(row, 4).setValue('営業所');
        Logger.log(`✓ Step 3: 行${row}にヘッダー設定`);
      }
    }

    // Step 4: A4縦対応の列幅を設定
    const config = A4_PORTRAIT_COLUMN_WIDTHS.format2Separated;
    for (const colConfig of config.columns) {
      sheet.setColumnWidth(colConfig.col, colConfig.width);
    }
    Logger.log('✓ Step 4: A4縦対応の列幅を設定');

    // Step 5: 使用しない列（K列以降）を非表示
    const lastCol = sheet.getLastColumn();
    if (lastCol > config.columns.length) {
      for (let i = config.columns.length + 1; i <= lastCol; i++) {
        sheet.hideColumns(i);
      }
      Logger.log(`✓ Step 5: ${config.columns.length + 1}列目以降を非表示`);
    }

    // テンプレートフォルダに移動（設定されていれば）
    const rootFolderId = prop.getProperty('DRIVE_ROOT_FOLDER_ID');
    if (rootFolderId) {
      try {
        const rootFolder = DriveApp.getFolderById(rootFolderId);
        const templateFolders = rootFolder.getFoldersByName('テンプレート');
        if (templateFolders.hasNext()) {
          const templateFolder = templateFolders.next();
          const format2Folders = templateFolder.getFoldersByName('様式2');
          if (format2Folders.hasNext()) {
            copiedFile.moveTo(format2Folders.next());
            Logger.log('✓ テンプレートフォルダに移動');
          }
        }
      } catch (e) {
        Logger.log('※ フォルダ移動はスキップ');
      }
    }

    Logger.log('\n=== 完了 ===');
    Logger.log(`新しい分離版テンプレートID: ${copiedFile.getId()}`);
    Logger.log(`URL: ${newSs.getUrl()}`);
    Logger.log('\n次のステップ:');
    Logger.log('1. 上記URLでテンプレートを確認');
    Logger.log('2. 印刷プレビュー（A4縦、余白:標準）で確認');
    Logger.log('3. 問題なければ TEMPLATE_IDS.FORMAT2_SEPARATED を更新');

    return copiedFile.getId();

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

// ============================================================
// ショートカット関数（GASエディタから直接実行用）
// ============================================================

/**
 * 【実行用】分離版テンプレートを正しい列構成で再作成
 * GASエディタで直接実行できます
 */
function rebuildSeparatedTemplate() {
  rebuildFormat2SeparatedTemplate();
}

/**
 * 【実行用】分離版テンプレートの列幅をA4縦対応に調整
 * GASエディタで直接実行できます
 */
function adjustSeparatedTemplate() {
  adjustFormat2SeparatedForA4(TEMPLATE_IDS.FORMAT2_SEPARATED);
}

/**
 * 【実行用】元の様式2テンプレートの列幅をA4縦対応に調整
 * GASエディタで直接実行できます
 */
function adjustOriginalTemplate() {
  adjustFormat2ForA4(TEMPLATE_IDS.FORMAT2_ORIGINAL);
}

/**
 * 【実行用】分離版テンプレートの現在の列幅を分析
 */
function analyzeSeparatedTemplate() {
  analyzeCurrentColumnWidths(TEMPLATE_IDS.FORMAT2_SEPARATED);
}

/**
 * 【実行用】元の様式2テンプレートの現在の列幅を分析
 */
function analyzeOriginalTemplate() {
  analyzeCurrentColumnWidths(TEMPLATE_IDS.FORMAT2_ORIGINAL);
}

// ============================================================
// Sheets API v4 を使った印刷設定・テンプレート最適化
// ============================================================

/**
 * A4縦の印刷設定（Sheets API v4使用）
 *
 * 前提: Google Sheets API v4 を GAS プロジェクトで有効化
 * 設定方法: サービス → Google Sheets API を追加
 *
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {number} sheetId - シートID（省略時は最初のシート）
 */
function setupPrintSettingsForA4(spreadsheetId, sheetId) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = sheetId !== undefined
      ? ss.getSheets().find(s => s.getSheetId() === sheetId)
      : ss.getSheets()[0];

    if (!sheet) {
      throw new Error('シートが見つかりません');
    }

    const targetSheetId = sheet.getSheetId();

    Logger.log('=== Sheets API v4 で印刷設定を適用 ===');
    Logger.log(`スプレッドシート: ${ss.getName()}`);
    Logger.log(`シート: ${sheet.getName()} (ID: ${targetSheetId})`);

    // Sheets API v4 でバッチリクエスト
    const requests = [
      {
        updateSheetProperties: {
          properties: {
            sheetId: targetSheetId,
            gridProperties: {
              frozenRowCount: 9  // ヘッダー部分（1〜9行目）を固定
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      }
    ];

    Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);

    Logger.log('✓ ヘッダー行（1〜9行目）を固定しました');
    Logger.log('\n※ 印刷設定は手動で以下を設定してください:');
    Logger.log('  - 用紙サイズ: A4');
    Logger.log('  - 向き: 縦');
    Logger.log('  - 余白: 狭い');
    Logger.log('  - 配置 > 水平: 中央');
    Logger.log('  - 印刷形式 > 行1〜9を各ページに繰り返す');

    return true;

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    Logger.log('Sheets API v4 が有効化されていない可能性があります');
    Logger.log('設定方法: GASエディタ → サービス → Google Sheets API を追加');
    throw error;
  }
}

/**
 * 繰り返しヘッダー行（101, 201, 300行目）を削除してシンプルな構造に変換
 *
 * Bアプローチ: テンプレート構造を改善
 * - 繰り返しヘッダー行を削除
 * - 印刷設定で「行を各ページに繰り返す」を使用
 *
 * @param {string} spreadsheetId - スプレッドシートID
 */
function removeRepeatingHeaderRows(spreadsheetId) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheets()[0];

    Logger.log('=== 繰り返しヘッダー行を削除 ===');
    Logger.log(`スプレッドシート: ${ss.getName()}`);
    Logger.log(`シート: ${sheet.getName()}`);

    // 元のテンプレートでは101, 201, 300行目にヘッダー行が繰り返されている
    // 逆順で削除（後ろから削除しないと行番号がずれる）
    const headerRowsToRemove = [300, 201, 101];

    for (const row of headerRowsToRemove) {
      if (row <= sheet.getLastRow()) {
        // その行がヘッダー行かどうか確認（「日付」という文字があるか）
        const cellValue = sheet.getRange(row, 1).getValue();
        if (cellValue === '日付') {
          sheet.deleteRow(row);
          Logger.log(`✓ 行${row}（ヘッダー行）を削除`);
        } else {
          Logger.log(`※ 行${row}はヘッダー行ではありません（値: ${cellValue}）`);
        }
      }
    }

    Logger.log('\n✓ 繰り返しヘッダー行の削除完了');
    Logger.log('次のステップ: setupPrintSettingsForA4() を実行してヘッダー行固定を設定');

    return true;

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * PDFエクスポート用にテンプレートを最適化（Bアプローチ）
 *
 * 1. 繰り返しヘッダー行を削除
 * 2. 印刷設定でヘッダー行固定を設定
 * 3. 列幅をA4縦対応に調整
 *
 * @param {string} spreadsheetId - スプレッドシートID（省略時はFORMAT2_ORIGINAL）
 */
function optimizeTemplateForPdfExport(spreadsheetId) {
  const targetId = spreadsheetId || TEMPLATE_IDS.FORMAT2_ORIGINAL;

  try {
    Logger.log('=== PDFエクスポート用テンプレート最適化 ===\n');

    // Step 1: 繰り返しヘッダー行を削除
    Logger.log('Step 1: 繰り返しヘッダー行を削除');
    removeRepeatingHeaderRows(targetId);

    // Step 2: 印刷設定でヘッダー行固定
    Logger.log('\nStep 2: Sheets API v4で印刷設定を適用');
    setupPrintSettingsForA4(targetId);

    // Step 3: 列幅をA4縦対応に調整
    Logger.log('\nStep 3: 列幅をA4縦対応に調整');
    adjustFormat2ForA4(targetId);

    Logger.log('\n=== 最適化完了 ===');
    Logger.log('印刷プレビューで確認してください');

    return true;

  } catch (error) {
    Logger.log(`✗ 最適化エラー: ${error.message}`);
    throw error;
  }
}

/**
 * 分離版テンプレートをPDFエクスポート用に最適化
 *
 * @param {string} spreadsheetId - 分離版テンプレートのID（省略時はFORMAT2_SEPARATED）
 */
function optimizeSeparatedTemplateForPdfExport(spreadsheetId) {
  const targetId = spreadsheetId || TEMPLATE_IDS.FORMAT2_SEPARATED;

  try {
    Logger.log('=== 分離版テンプレートPDFエクスポート最適化 ===\n');

    // Step 1: 繰り返しヘッダー行を削除
    Logger.log('Step 1: 繰り返しヘッダー行を削除');
    removeRepeatingHeaderRows(targetId);

    // Step 2: 印刷設定でヘッダー行固定
    Logger.log('\nStep 2: Sheets API v4で印刷設定を適用');
    setupPrintSettingsForA4(targetId);

    // Step 3: 列幅をA4縦対応に調整
    Logger.log('\nStep 3: 列幅をA4縦対応に調整');
    adjustFormat2SeparatedForA4(targetId);

    Logger.log('\n=== 最適化完了 ===');
    Logger.log('印刷プレビューで確認してください');

    return true;

  } catch (error) {
    Logger.log(`✗ 最適化エラー: ${error.message}`);
    throw error;
  }
}

// ============================================================
// PDFエクスポート関数（UrlFetchApp方式）
// ============================================================

/**
 * PDF出力用のエクスポートURL設定
 */
const PDF_EXPORT_SETTINGS = {
  format: 'pdf',
  portrait: true,           // 縦向き
  paperSize: 0,             // A4
  scale: 3,                 // ページに合わせる
  topMargin: 0.2,           // 上余白（インチ）- 狭い
  bottomMargin: 0.2,        // 下余白
  leftMargin: 0.2,          // 左余白
  rightMargin: 0.2,         // 右余白
  horizontalAlignment: 'CENTER',  // 水平位置: 中央
  gridlines: false          // グリッドライン非表示
};

/**
 * スプレッドシートをPDFとしてエクスポート
 *
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {number} sheetId - シートID（省略時は最初のシート）
 * @param {Object} options - オプション設定（PDF_EXPORT_SETTINGSを上書き）
 * @returns {Blob} PDFのBlob
 */
function exportToPdf(spreadsheetId, sheetId, options = {}) {
  const settings = { ...PDF_EXPORT_SETTINGS, ...options };

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = sheetId !== undefined
    ? ss.getSheets().find(s => s.getSheetId() === sheetId)
    : ss.getSheets()[0];

  const targetSheetId = sheet ? sheet.getSheetId() : 0;

  // エクスポートURLを構築
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
    `format=${settings.format}` +
    `&gid=${targetSheetId}` +
    `&portrait=${settings.portrait}` +
    `&size=${settings.paperSize}` +       // 0=A4
    `&scale=${settings.scale}` +           // 3=ページに合わせる
    `&top_margin=${settings.topMargin}` +
    `&bottom_margin=${settings.bottomMargin}` +
    `&left_margin=${settings.leftMargin}` +
    `&right_margin=${settings.rightMargin}` +
    `&horizontal_alignment=${settings.horizontalAlignment}` +
    `&gridlines=${settings.gridlines ? 'true' : 'false'}`;

  Logger.log(`PDFエクスポートURL: ${url}`);

  const response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }
  });

  return response.getBlob().setName(`${ss.getName()}.pdf`);
}

/**
 * スプレッドシートをExcel（xlsx）としてエクスポート
 *
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {Blob} xlsxのBlob
 */
function exportToExcel(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;

  Logger.log(`Excelエクスポート: ${ss.getName()}`);

  const response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }
  });

  return response.getBlob().setName(`${ss.getName()}.xlsx`);
}

// ============================================================
// 【実行用】ショートカット関数
// ============================================================

/**
 * 【実行用】元の様式2をPDFエクスポート用に最適化
 */
function optimizeOriginalForPdf() {
  optimizeTemplateForPdfExport(TEMPLATE_IDS.FORMAT2_ORIGINAL);
}

/**
 * 【実行用】分離版をPDFエクスポート用に最適化
 */
function optimizeSeparatedForPdf() {
  optimizeSeparatedTemplateForPdfExport(TEMPLATE_IDS.FORMAT2_SEPARATED);
}

/**
 * 【実行用】元の様式2の印刷設定を適用
 */
function setupOriginalPrintSettings() {
  setupPrintSettingsForA4(TEMPLATE_IDS.FORMAT2_ORIGINAL);
}

/**
 * 【実行用】分離版の印刷設定を適用
 */
function setupSeparatedPrintSettings() {
  setupPrintSettingsForA4(TEMPLATE_IDS.FORMAT2_SEPARATED);
}
