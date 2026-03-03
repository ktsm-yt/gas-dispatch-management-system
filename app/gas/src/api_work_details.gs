/**
 * Work Details API Controller
 *
 * google.script.run エントリーポイント
 * 作業詳細マスターのCRUD操作
 */

/**
 * 作業詳細オプション一覧を取得
 * @returns {Object} { ok, data: { items: [...], count } }
 */
function getWorkDetailOptions() {
  return listWorkDetails({ activeOnly: false });
}

/**
 * 作業詳細オプションを保存（新規/更新）
 * @param {Object} data - { value, label, sort_order, work_detail_id? }
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function saveWorkDetailOption(data, expectedUpdatedAt) {
  return saveWorkDetail(data, expectedUpdatedAt);
}

/**
 * 作業詳細オプションを削除
 * @param {string} id - work_detail_id
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function deleteWorkDetailOption(id, expectedUpdatedAt) {
  return deleteWorkDetail(id, expectedUpdatedAt);
}

/**
 * 作業詳細の並び順を一括更新
 * @param {string[]} orderedIds - 並び順通りのwork_detail_id配列
 * @param {Object} expectedUpdatedAts - 楽観ロック用マップ
 * @returns {Object} APIレスポンス
 */
function reorderWorkDetailOptions(orderedIds, expectedUpdatedAts) {
  return reorderWorkDetails(orderedIds, expectedUpdatedAts);
}
