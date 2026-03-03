/**
 * 全マスターキャッシュを再構築（GASエディタから実行可能）
 * CacheServiceの汚染をクリアし、正しいDBから再読み込み
 */
function rebuildMasterCache() {
  var result = MasterCache.warmup();
  Logger.log('MasterCache rebuild result: ' + JSON.stringify(result));
  return result;
}

/**
 * WorkDetailsシートを既存DBに追加（ワンタイム実行）
 * GASエディタから実行: addWorkDetailsSheet()
 */
function addWorkDetailsSheet() {
  var ssId = getSpreadsheetId();
  Logger.log('対象スプレッドシートID: ' + ssId);
  var ss = SpreadsheetApp.openById(ssId);
  Logger.log('対象スプレッドシート名: ' + ss.getName());

  // 既に存在する場合はスキップ
  if (ss.getSheetByName('WorkDetails')) {
    Logger.log('WorkDetailsシートは既に存在します。スキップします。');
    return { skipped: true };
  }

  var definition = TABLE_DEFINITIONS['M_WorkDetails'];
  if (!definition) {
    Logger.log('TABLE_DEFINITIONS に M_WorkDetails が見つかりません');
    return { error: 'definition not found' };
  }

  createSheet(ss, 'M_WorkDetails', definition);
  Logger.log('✓ WorkDetailsシートを作成しました');
  return { success: true };
}

/**
 * M_WorkDetails 初期データ投入スクリプト（ワンタイム実行）
 *
 * 既存のハードコードされた22項目 + "その他" をM_WorkDetailsシートに投入
 * "その他" は is_protected=true, sort_order=9999 で削除不可・常に末尾
 */
function seedWorkDetails() {
  var items = [
    { value: 'sekkou',    label: 'ボード' },
    { value: 'tategu',    label: '建具' },
    { value: 'kitchen',   label: 'キッチン' },
    { value: 'unit_bath', label: 'ユニットバス' },
    { value: 'flooring',  label: 'フローリング' },
    { value: 'habaki',    label: '幅木' },
    { value: 'cross',     label: 'クロス' },
    { value: 'prefab',    label: 'プレハブ材' },
    { value: 'scaffold',  label: '足場材' },
    { value: 'material',  label: '資材一般' },
    { value: 'sk',        label: 'SK' },
    { value: 'toilet',    label: 'トイレ' },
    { value: 'furniture', label: '家具' },
    { value: 'appliance', label: '家電' },
    { value: 'tobi',      label: '鳶' },
    { value: 'tobi_hojo', label: '鳶補助' },
    { value: 'niage',     label: '荷揚げ' },
    { value: 'tobiage',   label: '鳶揚げ' },
    { value: 'hansyutsu', label: '搬出' },
    { value: 'temoto',    label: '手元' },
    { value: 'kaitai',    label: '解体' },
    { value: 'seisou',    label: '清掃' }
  ];

  // 既存データチェック（冪等性）
  var existing = listWorkDetails();
  if (existing.ok && existing.data.items.length > 0) {
    Logger.log('M_WorkDetails already has ' + existing.data.items.length + ' items. Skipping seed.');
    return { skipped: true, existingCount: existing.data.items.length };
  }

  var now = getCurrentTimestamp();
  var user = getCurrentUserEmail();
  var records = [];

  for (var i = 0; i < items.length; i++) {
    records.push({
      work_detail_id: generateId(),
      value: items[i].value,
      label: items[i].label,
      sort_order: (i + 1) * 10,
      is_active: true,
      is_protected: false,
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false,
      deleted_at: '',
      deleted_by: ''
    });
  }

  // "その他" を最後に追加（is_protected=true, sort_order=9999）
  records.push({
    work_detail_id: generateId(),
    value: 'other',
    label: 'その他',
    sort_order: 9999,
    is_active: true,
    is_protected: true,
    created_at: now,
    created_by: user,
    updated_at: now,
    updated_by: user,
    is_deleted: false,
    deleted_at: '',
    deleted_by: ''
  });

  insertRecords('M_WorkDetails', records);
  MasterCache.invalidateWorkDetails();

  Logger.log('Seeded ' + records.length + ' work detail items.');
  return { success: true, count: records.length };
}
