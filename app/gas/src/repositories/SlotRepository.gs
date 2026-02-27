/**
 * Slot Repository
 *
 * T_JobSlots テーブルのシートI/O処理
 * 案件に紐づく「枠」を管理する
 */

const SlotRepository = {
  TABLE_NAME: 'T_JobSlots',
  ID_COLUMN: 'slot_id',

  /**
   * 許可されるtime_slot値
   * 既存のT_Jobsのtime_slotと同じ値を使用
   */
  VALID_TIME_SLOTS: ['jotou', 'shuujitsu', 'am', 'pm', 'yakin', 'mitei'],

  /**
   * 許可されるpay_unit値
   * 既存のT_JobAssignmentsのpay_unitと同じ値を使用
   */
  VALID_PAY_UNITS: ['basic', 'halfday', 'fullday', 'night', 'tobi', 'age', 'tobiage'],

  /**
   * IDで枠を取得
   * @param {string} slotId - 枠ID
   * @returns {Object|null} 枠レコードまたはnull
   */
  findById: function(slotId) {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, slotId);
    if (!record || record.is_deleted) return null;
    return record;
  },

  /**
   * 案件IDで枠を検索
   * @param {string} jobId - 案件ID
   * @returns {Object[]} 枠配列（sort_order順）
   */
  findByJobId: function(jobId) {
    const records = getAllRecords(this.TABLE_NAME);

    const filtered = records.filter(r => {
      if (r.is_deleted) return false;
      return r.job_id === jobId;
    });

    // sort_order で昇順ソート
    filtered.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return filtered;
  },

  /**
   * 複数案件の枠を一括取得
   * @param {string[]} jobIds - 案件ID配列
   * @returns {Object} { [jobId]: Object[] } 案件IDごとの枠配列
   */
  findByJobIds: function(jobIds) {
    if (!jobIds || jobIds.length === 0) return {};

    const records = getAllRecords(this.TABLE_NAME);
    const jobIdSet = new Set(jobIds);
    const result = {};

    // 初期化
    for (const jobId of jobIds) {
      result[jobId] = [];
    }

    // フィルタリング
    for (const record of records) {
      if (record.is_deleted) continue;
      if (!jobIdSet.has(record.job_id)) continue;
      result[record.job_id].push(record);
    }

    // 各案件の枠をsort_order順にソート
    for (const jobId of jobIds) {
      result[jobId].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    return result;
  },

  /**
   * 新規枠を作成
   * @param {Object} slot - 枠データ
   * @returns {Object} 作成結果 { success: boolean, slot?: Object, error?: string }
   */
  insert: function(slot) {
    // バリデーション
    const validation = this._validate(slot);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const user = getCurrentUserEmail() || 'system';
    const now = getCurrentTimestamp();

    const newSlot = {
      slot_id: slot.slot_id || generateId('slt'),
      job_id: slot.job_id,
      slot_time_slot: slot.slot_time_slot,
      slot_pay_unit: slot.slot_pay_unit,
      slot_count: Number(slot.slot_count) || 1,
      sort_order: Number(slot.sort_order) || 0,
      notes: slot.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false
    };

    insertRecord(this.TABLE_NAME, newSlot);

    return { success: true, slot: newSlot };
  },

  /**
   * 枠を更新（楽観ロック付き）
   * @param {Object} slot - 更新データ（slot_id必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, slot?: Object, error?: string }
   */
  update: function(slot, expectedUpdatedAt) {
    if (!slot.slot_id) {
      return { success: false, error: 'slot_id is required' };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, slot.slot_id);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentSlot = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentSlot.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 楽観ロックチェック
    if (expectedUpdatedAt && currentSlot.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: 'CONFLICT_ERROR',
        currentUpdatedAt: currentSlot.updated_at
      };
    }

    // バリデーション（更新内容）
    const mergedSlot = { ...currentSlot, ...slot };
    const validation = this._validate(mergedSlot);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const user = getCurrentUserEmail() || 'system';
    const now = getCurrentTimestamp();

    // 更新可能フィールド（ホワイトリスト）
    const updatableFields = [
      'slot_time_slot', 'slot_pay_unit', 'slot_count', 'sort_order', 'notes'
    ];

    const updatedSlot = { ...currentSlot };

    for (const field of updatableFields) {
      if (slot[field] !== undefined) {
        updatedSlot[field] = slot[field];
      }
    }

    updatedSlot.updated_at = now;
    updatedSlot.updated_by = user;

    const newRow = objectToRow(headers, updatedSlot);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    invalidateExecutionCache(this.TABLE_NAME);

    return {
      success: true,
      slot: updatedSlot,
      before: currentSlot
    };
  },

  /**
   * 論理削除
   * @param {string} slotId - 枠ID
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 削除結果 { success: boolean, error?: string }
   */
  softDelete: function(slotId, expectedUpdatedAt) {
    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, slotId);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentSlot = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentSlot.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 楽観ロックチェック
    if (expectedUpdatedAt && currentSlot.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: 'CONFLICT_ERROR',
        currentUpdatedAt: currentSlot.updated_at
      };
    }

    const user = getCurrentUserEmail() || 'system';
    const now = getCurrentTimestamp();

    currentSlot.is_deleted = true;
    currentSlot.updated_at = now;
    currentSlot.updated_by = user;

    const newRow = objectToRow(headers, currentSlot);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    invalidateExecutionCache(this.TABLE_NAME);

    return { success: true, before: currentSlot };
  },

  /**
   * 案件の全枠を一括更新（差分更新）
   * @param {string} jobId - 案件ID
   * @param {Object[]} slots - 新しい枠配列
   * @param {string} expectedUpdatedAt - 期待するupdated_at（最新枠の値）
   * @returns {Object} 更新結果
   */
  bulkUpdateForJob: function(jobId, slots, expectedUpdatedAt) {
    const existingSlots = this.findByJobId(jobId);
    const existingMap = new Map(existingSlots.map(s => [s.slot_id, s]));

    const results = {
      created: [],
      updated: [],
      deleted: [],
      errors: []
    };

    // 新しい枠リストに含まれるslot_idを収集
    const newSlotIds = new Set();

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      slot.sort_order = i; // 配列順にsort_orderを設定

      if (slot.slot_id && existingMap.has(slot.slot_id)) {
        // 更新（スロット自身のupdated_atを使用して楽観ロック）
        const existing = existingMap.get(slot.slot_id);
        const result = this.update(
          { ...slot, job_id: jobId },
          existing.updated_at
        );
        if (result.success) {
          results.updated.push(result.slot);
        } else {
          results.errors.push({ slot, error: result.error });
        }
        newSlotIds.add(slot.slot_id);
      } else {
        // 新規作成
        const result = this.insert({ ...slot, job_id: jobId });
        if (result.success) {
          results.created.push(result.slot);
          newSlotIds.add(result.slot.slot_id);
        } else {
          results.errors.push({ slot, error: result.error });
        }
      }
    }

    // 削除（新しいリストに含まれない既存枠）
    for (const existing of existingSlots) {
      if (!newSlotIds.has(existing.slot_id)) {
        const result = this.softDelete(existing.slot_id, existing.updated_at);
        if (result.success) {
          results.deleted.push(existing);
        } else {
          results.errors.push({ slot: existing, error: result.error });
        }
      }
    }

    return {
      success: results.errors.length === 0,
      ...results
    };
  },

  /**
   * 案件の枠合計人数を取得
   * @param {string} jobId - 案件ID
   * @returns {number} 合計人数
   */
  getTotalCount: function(jobId) {
    const slots = this.findByJobId(jobId);
    return slots.reduce((sum, s) => sum + (Number(s.slot_count) || 0), 0);
  },

  /**
   * 入力バリデーション
   * @private
   */
  _validate: function(slot) {
    if (!slot.job_id) {
      return { valid: false, error: 'job_id is required' };
    }

    if (!slot.slot_time_slot) {
      return { valid: false, error: 'slot_time_slot is required' };
    }

    if (!this.VALID_TIME_SLOTS.includes(slot.slot_time_slot)) {
      return {
        valid: false,
        error: `Invalid slot_time_slot: ${slot.slot_time_slot}. ` +
               `Valid values: ${this.VALID_TIME_SLOTS.join(', ')}`
      };
    }

    if (!slot.slot_pay_unit) {
      return { valid: false, error: 'slot_pay_unit is required' };
    }

    if (!this.VALID_PAY_UNITS.includes(slot.slot_pay_unit)) {
      return {
        valid: false,
        error: `Invalid slot_pay_unit: ${slot.slot_pay_unit}. ` +
               `Valid values: ${this.VALID_PAY_UNITS.join(', ')}`
      };
    }

    const count = Number(slot.slot_count);
    if (isNaN(count) || count < 1) {
      return { valid: false, error: 'slot_count must be >= 1' };
    }

    return { valid: true };
  }
};
