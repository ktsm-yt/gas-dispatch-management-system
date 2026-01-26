/**
 * Staff Repository Wrapper
 *
 * master_service.gs の既存関数をリポジトリパターンでラップ
 */

const StaffRepository = {

  /**
   * IDでスタッフを取得
   * @param {string} staffId - スタッフID
   * @returns {Object|null} スタッフデータ
   */
  findById: function(staffId) {
    const result = getStaff(staffId);
    if (result && result.ok && result.data) {
      return result.data;
    }
    return null;
  },

  /**
   * スタッフを検索
   * @param {Object} query - 検索条件
   * @param {boolean} query.is_active - アクティブのみ（デフォルト: true）
   * @param {string} query.staff_type - スタッフ種別（'internal', 'subcontract'）
   * @param {string} query.subcontractor_id - 外注先ID
   * @param {number} query.limit - 取得件数上限
   * @returns {Object[]} スタッフ配列
   */
  search: function(query = {}) {
    const options = {};
    if (query.limit) {
      options.limit = query.limit;
    }

    const result = listStaff(options);

    if (!result || !result.ok || !result.data || !result.data.items) {
      return [];
    }

    let staffList = result.data.items;

    // is_active フィルタリング
    if (query.is_active !== undefined) {
      staffList = staffList.filter(s => s.is_active === query.is_active);
    }

    // staff_type フィルタリング
    if (query.staff_type) {
      staffList = staffList.filter(s => s.staff_type === query.staff_type);
    }

    // subcontractor_id フィルタリング
    if (query.subcontractor_id) {
      staffList = staffList.filter(s => s.subcontractor_id === query.subcontractor_id);
    }

    return staffList;
  }
};
