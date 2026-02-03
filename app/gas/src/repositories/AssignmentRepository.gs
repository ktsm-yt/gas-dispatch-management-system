/**
 * Assignment Repository
 *
 * T_JobAssignments テーブルのシートI/O処理
 */

const AssignmentRepository = {
  TABLE_NAME: 'T_JobAssignments',
  ID_COLUMN: 'assignment_id',

  /**
   * IDで配置を取得
   * @param {string} assignmentId - 配置ID
   * @returns {Object|null} 配置レコードまたはnull
   */
  findById: function(assignmentId) {
    return getRecordById(this.TABLE_NAME, this.ID_COLUMN, assignmentId);
  },

  /**
   * 案件IDで配置を検索
   * @param {string} jobId - 案件ID
   * @returns {Object[]} 配置配列
   */
  findByJobId: function(jobId) {
    const records = findRecords(this.TABLE_NAME, { job_id: jobId });
    return records.filter(r => !r.is_deleted);
  },

  /**
   * スタッフIDで配置を検索
   * @param {string} staffId - スタッフID
   * @param {Object} options - 検索オプション
   * @param {string} options.date_from - 開始日
   * @param {string} options.date_to - 終了日
   * @returns {Object[]} 配置配列
   */
  findByStaffId: function(staffId, options = {}) {
    let records = findRecords(this.TABLE_NAME, { staff_id: staffId });
    records = records.filter(r => !r.is_deleted);

    // 日付範囲でフィルタリングする場合は案件情報も必要
    // （実際の実装ではServiceレイヤーでJoinする）

    return records;
  },

  /**
   * 日付で配置を検索（ダッシュボード用）
   * 案件テーブルとJoinして、指定日の配置を取得
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @param {string[]} [preloadedJobIds] - 案件ID配列（オプション、二重呼び出し防止）
   * @returns {Object[]} 配置配列
   */
  findByDate: function(date, preloadedJobIds) {
    // jobIdsが渡されなかった場合のみ案件を取得（二重呼び出し防止）
    let jobIds = preloadedJobIds;
    if (!jobIds) {
      const jobs = JobRepository.findByDate(date);
      jobIds = jobs.map(j => j.job_id);
    }

    if (jobIds.length === 0) {
      return [];
    }

    // Set化してO(1)ルックアップに最適化
    const jobIdSet = new Set(jobIds);

    // 全配置を取得してフィルタリング
    const allAssignments = getAllRecords(this.TABLE_NAME);
    return allAssignments.filter(a =>
      !a.is_deleted && jobIdSet.has(a.job_id)
    );
  },

  /**
   * 条件で配置を検索
   * @param {Object} query - 検索条件
   * @param {string} query.job_id - 案件ID
   * @param {string} query.staff_id - スタッフID
   * @param {string} query.worker_type - 種別（STAFF/SUBCONTRACT）
   * @param {string} query.status - ステータス
   * @returns {Object[]} 配置配列
   */
  search: function(query = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    // 案件IDで絞り込み
    if (query.job_id) {
      records = records.filter(r => r.job_id === query.job_id);
    }

    // スタッフIDで絞り込み
    if (query.staff_id) {
      records = records.filter(r => r.staff_id === query.staff_id);
    }

    // 種別で絞り込み
    if (query.worker_type) {
      records = records.filter(r => r.worker_type === query.worker_type);
    }

    // ステータスで絞り込み
    if (query.status) {
      records = records.filter(r => r.status === query.status);
    }

    return records;
  },

  /**
   * 新規配置を作成
   * @param {Object} assignment - 配置データ
   * @returns {Object} 作成した配置
   */
  insert: function(assignment) {
    const user = Session.getActiveUser().getEmail() || 'system';
    const now = getCurrentTimestamp();

    const newAssignment = {
      assignment_id: assignment.assignment_id || generateId('asg'),
      job_id: assignment.job_id,
      staff_id: assignment.staff_id,
      worker_type: assignment.worker_type || 'STAFF',
      subcontractor_id: assignment.subcontractor_id || '',
      display_time_slot: assignment.display_time_slot,
      pay_unit: assignment.pay_unit,
      invoice_unit: assignment.invoice_unit,
      wage_rate: assignment.wage_rate || '',
      invoice_rate: assignment.invoice_rate || '',
      transport_area: assignment.transport_area || '',
      transport_amount: assignment.transport_amount || '',
      transport_is_manual: assignment.transport_is_manual || false,
      transport_station: assignment.transport_station || '',
      transport_has_bus: assignment.transport_has_bus || false,
      site_role: assignment.site_role || '',
      assignment_role: assignment.assignment_role || '',
      is_leader: assignment.is_leader || false,
      entry_date: assignment.entry_date || '',
      safety_training_date: assignment.safety_training_date || '',
      status: assignment.status || 'ASSIGNED',
      notes: assignment.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false
    };

    insertRecord(this.TABLE_NAME, newAssignment);

    return newAssignment;
  },

  /**
   * 配置を更新
   * @param {Object} assignment - 更新データ（assignment_id必須）
   * @returns {Object} 更新結果 { success: boolean, assignment?: Object, error?: string }
   */
  update: function(assignment) {
    if (!assignment.assignment_id) {
      return { success: false, error: 'assignment_id is required' };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, assignment.assignment_id);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentAssignment = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentAssignment.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const user = Session.getActiveUser().getEmail() || 'system';
    const now = getCurrentTimestamp();

    // 更新可能フィールド（ホワイトリスト）
    const updatableFields = [
      'staff_id', 'worker_type', 'subcontractor_id', 'display_time_slot',
      'pay_unit', 'invoice_unit', 'wage_rate', 'invoice_rate',
      'transport_area', 'transport_amount', 'transport_is_manual',
      'transport_station', 'transport_has_bus',
      'site_role', 'assignment_role', 'is_leader',
      'entry_date', 'safety_training_date',
      'status', 'payout_id',  // P2-3: 二重計上防止用
      'notes'
    ];

    const updatedAssignment = { ...currentAssignment };

    for (const field of updatableFields) {
      if (assignment[field] !== undefined) {
        updatedAssignment[field] = assignment[field];
      }
    }

    updatedAssignment.updated_at = now;
    updatedAssignment.updated_by = user;

    const newRow = objectToRow(headers, updatedAssignment);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      assignment: updatedAssignment,
      before: currentAssignment
    };
  },

  /**
   * 論理削除
   * @param {string} assignmentId - 配置ID
   * @returns {Object} 削除結果 { success: boolean, error?: string }
   */
  softDelete: function(assignmentId) {
    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, assignmentId);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentAssignment = rowToObject(headers, currentRow);

    if (currentAssignment.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const user = Session.getActiveUser().getEmail() || 'system';
    const now = getCurrentTimestamp();

    const updatedAssignment = {
      ...currentAssignment,
      is_deleted: true,
      status: 'CANCELLED',
      updated_at: now,
      updated_by: user
    };

    const newRow = objectToRow(headers, updatedAssignment);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      assignment: updatedAssignment,
      before: currentAssignment
    };
  },

  /**
   * 複数配置を一括挿入
   * @param {Object[]} assignments - 配置データ配列
   * @returns {Object[]} 作成した配置配列
   */
  bulkInsert: function(assignments) {
    if (!assignments || assignments.length === 0) {
      return [];
    }

    const user = Session.getActiveUser().getEmail() || 'system';
    const now = getCurrentTimestamp();
    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);

    const newAssignments = assignments.map(assignment => ({
      assignment_id: assignment.assignment_id || generateId('asg'),
      job_id: assignment.job_id,
      staff_id: assignment.staff_id,
      worker_type: assignment.worker_type || 'STAFF',
      subcontractor_id: assignment.subcontractor_id || '',
      display_time_slot: assignment.display_time_slot,
      pay_unit: assignment.pay_unit,
      invoice_unit: assignment.invoice_unit,
      wage_rate: assignment.wage_rate || '',
      invoice_rate: assignment.invoice_rate || '',
      transport_area: assignment.transport_area || '',
      transport_amount: assignment.transport_amount || '',
      transport_is_manual: assignment.transport_is_manual || false,
      transport_station: assignment.transport_station || '',
      transport_has_bus: assignment.transport_has_bus || false,
      site_role: assignment.site_role || '',
      assignment_role: assignment.assignment_role || '',
      is_leader: assignment.is_leader || false,
      entry_date: assignment.entry_date || '',
      safety_training_date: assignment.safety_training_date || '',
      status: assignment.status || 'ASSIGNED',
      notes: assignment.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false
    }));

    // 一括書き込み
    const rows = newAssignments.map(a => objectToRow(headers, a));
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);

    return newAssignments;
  },

  /**
   * 複数配置のpayout_idを一括更新
   * @param {Object[]} updates - { assignment_id, payout_id } の配列
   * @returns {Object} { success: number, failed: number }
   *
   * Note: payout_idはメタデータであり、配置の実質的な内容変更ではないため
   *       updated_at/updated_by は更新しない（請求変更検知の誤検知防止）
   *
   * ★ パフォーマンス改善: 連続範囲をバッチ化してsetValues
   *   - 読み込み: 全行（対象行を特定するため）
   *   - 書き込み: 連続範囲ごとにsetValues（API呼び出し回数を大幅削減）
   */
  bulkUpdatePayoutId: function(updates) {
    if (!updates || updates.length === 0) {
      return { success: 0, failed: 0 };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const allRows = sheet.getDataRange().getValues();

    // assignment_idをキーにしたMapを作成
    const updateMap = new Map(updates.map(u => [u.assignment_id, u.payout_id]));

    // IDカラムのインデックスを取得
    const idColIdx = headers.indexOf(this.ID_COLUMN);
    const payoutIdColIdx = headers.indexOf('payout_id');

    // デバッグ: カラムが見つからない場合
    if (payoutIdColIdx === -1) {
      Logger.log(`[bulkUpdatePayoutId] ERROR: payout_id column not found. headers=${JSON.stringify(headers)}`);
      throw new Error('payout_id column not found in T_JobAssignments');
    }

    const payoutIdColNum = payoutIdColIdx + 1;  // 1-indexed for getRange
    Logger.log(`[bulkUpdatePayoutId] Starting: ${updates.length} updates, payoutIdColNum=${payoutIdColNum}`);

    // Phase 1: 更新対象を収集
    const updateBatch = [];
    for (let i = 1; i < allRows.length; i++) {
      const assignmentId = allRows[i][idColIdx];
      if (updateMap.has(assignmentId)) {
        updateBatch.push({
          rowNum: i + 1,  // 1-indexed for getRange
          value: updateMap.get(assignmentId)
        });
        // 全件見つかったら早期終了
        if (updateBatch.length >= updates.length) {
          break;
        }
      }
    }

    // Phase 2: 連続範囲にグループ化してバッチ書き込み
    const ranges = this._groupContiguousRanges(updateBatch);
    let successCount = 0;

    for (const range of ranges) {
      const values = range.map(r => [r.value]);
      sheet.getRange(range[0].rowNum, payoutIdColNum, range.length, 1).setValues(values);
      successCount += range.length;
    }

    Logger.log(`[bulkUpdatePayoutId] Completed: ${successCount}/${updates.length} updated (${ranges.length} batch writes)`);
    return { success: successCount, failed: updates.length - successCount };
  },

  /**
   * 連続する行番号をグループ化
   * @param {Object[]} updateBatch - { rowNum, value } の配列
   * @returns {Object[][]} グループ化された配列の配列
   * @private
   */
  _groupContiguousRanges: function(updateBatch) {
    if (updateBatch.length === 0) return [];

    // 行番号でソート
    const sorted = updateBatch.slice().sort((a, b) => a.rowNum - b.rowNum);

    const ranges = [];
    let currentRange = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].rowNum === sorted[i - 1].rowNum + 1) {
        // 連続 → 現在のグループに追加
        currentRange.push(sorted[i]);
      } else {
        // 不連続 → 新しいグループを開始
        ranges.push(currentRange);
        currentRange = [sorted[i]];
      }
    }
    ranges.push(currentRange);

    return ranges;
  },

  /**
   * 案件の配置数を取得（一意なスタッフ数）
   * @param {string} jobId - 案件ID
   * @returns {number} 配置数（有効な配置の一意なスタッフ数）
   */
  countByJobId: function(jobId) {
    const assignments = this.findByJobId(jobId);
    const activeAssignments = assignments.filter(a => a.status !== 'CANCELLED');
    const uniqueStaffIds = new Set(activeAssignments.map(a => a.staff_id));
    return uniqueStaffIds.size;
  },

  /**
   * 案件IDで最大updated_atを取得
   * @param {string} jobId - 案件ID
   * @returns {string|null} 最大のupdated_at
   */
  getMaxUpdatedAtByJobId: function(jobId) {
    const assignments = this.findByJobId(jobId);

    if (assignments.length === 0) {
      return null;
    }

    return assignments.reduce((max, a) => {
      return a.updated_at > max ? a.updated_at : max;
    }, assignments[0].updated_at);
  },

  /**
   * スタッフの重複配置をチェック
   * @param {string} staffId - スタッフID
   * @param {string} jobId - 案件ID
   * @param {string} excludeAssignmentId - 除外する配置ID（更新時用）
   * @returns {boolean} 重複があればtrue
   */
  checkDuplicateAssignment: function(staffId, jobId, excludeAssignmentId = null) {
    const assignments = this.findByJobId(jobId);

    return assignments.some(a =>
      a.staff_id === staffId &&
      a.status !== 'CANCELLED' &&
      a.assignment_id !== excludeAssignmentId
    );
  }
};
