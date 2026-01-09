/**
 * Subcontractor Repository Wrapper
 *
 * master_service.gs の既存関数をリポジトリパターンでラップ
 */

const SubcontractorRepository = {

  /**
   * IDで外注先を取得
   * @param {string} subcontractorId - 外注先ID
   * @returns {Object|null} 外注先データ
   */
  findById: function(subcontractorId) {
    const result = getSubcontractor(subcontractorId);
    if (result && result.ok && result.data) {
      return result.data;
    }
    return null;
  },

  /**
   * 外注先を検索
   * @param {Object} query - 検索条件
   * @param {boolean} query.is_active - アクティブのみ
   * @param {number} query.limit - 取得件数上限
   * @returns {Object[]} 外注先配列
   */
  search: function(query = {}) {
    const options = {};
    if (query.limit) {
      options.limit = query.limit;
    }

    const result = listSubcontractors(options);

    if (!result || !result.ok || !result.data || !result.data.items) {
      return [];
    }

    let list = result.data.items;

    // is_active フィルタリング
    if (query.is_active !== undefined) {
      list = list.filter(s => s.is_active === query.is_active);
    }

    return list;
  }
};
