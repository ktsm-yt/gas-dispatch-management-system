/**
 * Job Repository
 *
 * T_Jobs テーブルのシートI/O処理
 */

const JobRepository = {
  TABLE_NAME: 'T_Jobs',
  ID_COLUMN: 'job_id',

  /**
   * IDで案件を取得
   * @param {string} jobId - 案件ID
   * @returns {Object|null} 案件レコードまたはnull
   */
  findById: function(jobId) {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, jobId);
    if (!record) return null;

    // work_dateをYYYY-MM-DD形式、start_timeをHH:mm形式の文字列に変換
    return {
      ...record,
      work_date: record.work_date instanceof Date
        ? Utilities.formatDate(record.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
        : record.work_date,
      start_time: this._normalizeTime(record.start_time)
    };
  },

  /**
   * 日付で案件を検索（ダッシュボード用）
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object[]} 案件配列
   */
  findByDate: function(date) {
    const records = getAllRecords(this.TABLE_NAME);
    const result = [];

    // === 最適化: 1回のループでフィルタと正規化を同時実行 ===
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.is_deleted) continue;
      if (!r.work_date) continue;

      const workDateStr = this._normalizeDate(r.work_date);
      if (workDateStr !== date) continue;

      result.push({
        ...r,
        work_date: workDateStr,
        start_time: this._normalizeTime(r.start_time)
      });
    }

    return result;
  },

  /**
   * 条件で案件を検索
   * @param {Object} query - 検索条件
   * @param {string} query.customer_id - 顧客ID
   * @param {string} query.work_date_from - 開始日
   * @param {string} query.work_date_to - 終了日
   * @param {string} query.status - ステータス
   * @param {string} query.time_slot - 時間区分
   * @param {string} query.site_name - 現場名（部分一致）
   * @param {number} query.limit - 取得件数制限
   * @param {boolean} query.includeArchive - アーカイブデータを含めるか
   * @returns {Object[]} 案件配列
   */
  search: function(query = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    // アーカイブデータを含める場合
    if (query.includeArchive) {
      const archiveRecords = this._getArchiveRecords(query);
      records = records.concat(archiveRecords);
    }

    // === 互換対応: date_from/date_to も work_date_from/work_date_to として扱う ===
    // 検索条件の日付も正規化（Dateオブジェクト混入対策）
    const dateFrom = this._normalizeDate(query.work_date_from || query.date_from);
    const dateTo = this._normalizeDate(query.work_date_to || query.date_to);

    // === 最適化: フィルタを先に、正規化は通過後のみ ===
    const normalizedRecords = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.is_deleted) continue;

      // 日付は先に正規化（フィルタに必要）
      const workDateStr = this._normalizeDate(r.work_date);

      // 全フィルタ条件を1回のループで評価
      if (query.customer_id && r.customer_id !== query.customer_id) continue;
      if (dateFrom && (!workDateStr || workDateStr < dateFrom)) continue;
      if (dateTo && (!workDateStr || workDateStr > dateTo)) continue;
      if (query.status && r.status !== query.status) continue;
      if (query.time_slot && r.time_slot !== query.time_slot) continue;
      if (query.site_name) {
        const searchTerm = query.site_name.toLowerCase();
        if (!r.site_name || !r.site_name.toLowerCase().includes(searchTerm)) continue;
      }

      // フィルタ通過後にのみstart_timeを正規化（無駄計算削減）
      normalizedRecords.push({
        ...r,
        work_date: workDateStr,
        start_time: this._normalizeTime(r.start_time),
        _sortDate: workDateStr || ''  // ソート用キャッシュ
      });
    }

    // ソート（デフォルト: 昇順 = 近い日付が上）
    const sortOrder = query.sort_order || 'asc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
    const timeOrder = { am: 0, pm: 1, night: 2 };

    normalizedRecords.sort((a, b) => {
      if (a._sortDate !== b._sortDate) {
        return (a._sortDate > b._sortDate ? 1 : -1) * sortMultiplier;
      }
      // 同日内は時間帯順（am→pm→night）
      const timeA = timeOrder[a.time_slot] ?? 9;
      const timeB = timeOrder[b.time_slot] ?? 9;
      if (timeA !== timeB) {
        return (timeA - timeB) * sortMultiplier;
      }
      return (a.created_at > b.created_at ? 1 : -1) * sortMultiplier;
    });

    // 件数制限
    let result = normalizedRecords;
    if (query.limit && query.limit > 0) {
      result = normalizedRecords.slice(0, query.limit);
    }

    // _sortDateを除去して返す
    return result.map(r => {
      const { _sortDate, ...rest } = r;
      return rest;
    });
  },

  /**
   * 新規案件を作成
   * @param {Object} job - 案件データ
   * @returns {Object} 作成した案件
   */
  insert: function(job) {
    const user = Session.getActiveUser().getEmail() || 'system';
    const now = getCurrentTimestamp();

    const newJob = {
      job_id: job.job_id || generateId('job'),
      customer_id: job.customer_id,
      site_name: job.site_name,
      site_address: job.site_address || '',
      work_date: job.work_date,
      time_slot: job.time_slot,
      start_time: job.start_time || '',
      required_count: job.required_count,
      pay_unit: job.pay_unit,
      work_category: job.work_category || '',
      work_detail: job.work_detail || '',
      supervisor_name: job.supervisor_name || '',
      order_number: job.order_number || '',
      branch_office: job.branch_office || '',
      property_code: job.property_code || '',
      construction_div: job.construction_div || '',
      status: job.status || 'pending',
      is_damaged: job.is_damaged || false,
      is_uncollected: job.is_uncollected || false,
      is_claimed: job.is_claimed || false,
      notes: job.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false
    };

    insertRecord(this.TABLE_NAME, newJob);

    return newJob;
  },

  /**
   * 案件を更新（楽観ロック付き）
   * @param {Object} job - 更新データ（job_id必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, job?: Object, error?: string }
   */
  update: function(job, expectedUpdatedAt) {
    if (!job.job_id) {
      return { success: false, error: 'job_id is required' };
    }

    // アーカイブデータの編集を防止
    if (job._archived) {
      return { success: false, error: 'ARCHIVED_DATA', message: '過去年度のデータは編集できません。' };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, job.job_id);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentJob = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentJob.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 楽観ロックチェック
    if (expectedUpdatedAt && currentJob.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: 'CONFLICT_ERROR',
        currentUpdatedAt: currentJob.updated_at
      };
    }

    const user = Session.getActiveUser().getEmail() || 'system';
    const now = getCurrentTimestamp();

    // 更新可能フィールド（ホワイトリスト）
    const updatableFields = [
      'customer_id', 'site_name', 'site_address', 'work_date', 'time_slot',
      'start_time', 'required_count',
      'pay_unit', 'work_category', 'work_detail',
      'supervisor_name', 'order_number', 'branch_office', 'property_code', 'construction_div',
      'status', 'is_damaged', 'is_uncollected', 'is_claimed', 'notes'
    ];

    const updatedJob = { ...currentJob };

    for (const field of updatableFields) {
      if (job[field] !== undefined) {
        updatedJob[field] = job[field];
      }
    }

    updatedJob.updated_at = now;
    updatedJob.updated_by = user;

    const newRow = objectToRow(headers, updatedJob);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      job: updatedJob,
      before: currentJob
    };
  },

  /**
   * 論理削除
   * @param {string} jobId - 案件ID
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 削除結果 { success: boolean, error?: string }
   */
  softDelete: function(jobId, expectedUpdatedAt) {
    return this.update(
      { job_id: jobId, is_deleted: true, status: 'cancelled' },
      expectedUpdatedAt
    );
  },

  /**
   * 指定日の最大updated_atを取得（更新検知用）
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {string|null} 最大のupdated_at
   */
  getMaxUpdatedAt: function(date) {
    const jobs = this.findByDate(date);

    if (jobs.length === 0) {
      return null;
    }

    return jobs.reduce((max, job) => {
      return job.updated_at > max ? job.updated_at : max;
    }, jobs[0].updated_at);
  },

  /**
   * 時間区分ごとの集計を取得
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object} 時間区分ごとの集計
   */
  getStatsByTimeSlot: function(date) {
    const jobs = this.findByDate(date);

    const stats = {
      jotou: { total: 0, required: 0 },
      shuujitsu: { total: 0, required: 0 },
      am: { total: 0, required: 0 },
      pm: { total: 0, required: 0 },
      yakin: { total: 0, required: 0 },
      mitei: { total: 0, required: 0 }
    };

    for (const job of jobs) {
      const slot = job.time_slot;
      if (stats[slot]) {
        stats[slot].total++;
        stats[slot].required += Number(job.required_count) || 0;
      }
    }

    return stats;
  },

  /**
   * 日付を正規化してYYYY-MM-DD形式の文字列に変換
   * @param {Date|string} dateValue - 日付値
   * @returns {string|null} 正規化された日付文字列
   */
  _normalizeDate: function(dateValue) {
    if (!dateValue) return null;

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    // 文字列の場合はスラッシュをハイフンに変換
    return String(dateValue).replace(/\//g, '-');
  },

  /**
   * 時刻をHH:mm形式に正規化
   * @param {Date|string} timeValue - 時刻値
   * @returns {string|null} HH:mm形式の文字列またはnull
   */
  _normalizeTime: function(timeValue) {
    if (!timeValue) return '';

    if (timeValue instanceof Date) {
      // 1899-1900年のDateはスプレッドシートの時刻のみセル
      return Utilities.formatDate(timeValue, 'Asia/Tokyo', 'HH:mm');
    }

    // 既に文字列の場合はそのまま返す
    return String(timeValue);
  },

  /**
   * アーカイブDBからレコードを取得（P2-5）
   * @param {Object} query - 検索条件
   * @returns {Object[]} アーカイブレコード配列（_archived: trueフラグ付き）
   */
  _getArchiveRecords: function(query) {
    const archiveRecords = [];

    // 日付範囲から対象年度を特定
    const targetYears = this._getTargetFiscalYears(query);

    for (const fiscalYear of targetYears) {
      const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        // TABLE_SHEET_MAPを使って日本語シート名に変換
        const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
        const sheet = archiveDb.getSheetByName(sheetName);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0];

        for (let i = 1; i < data.length; i++) {
          const record = {};
          for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = data[i][j];
          }
          // アーカイブフラグを付与
          record._archived = true;
          record._archiveFiscalYear = fiscalYear;
          archiveRecords.push(record);
        }
      } catch (e) {
        Logger.log(`アーカイブDB読み込みエラー (${fiscalYear}): ${e.message}`);
      }
    }

    return archiveRecords;
  },

  /**
   * 検索条件から対象の年度を特定
   * @param {Object} query - 検索条件
   * @returns {number[]} 対象年度の配列
   */
  _getTargetFiscalYears: function(query) {
    const years = [];
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    // 日付範囲が指定されている場合
    if (query.work_date_from || query.work_date_to) {
      const from = query.work_date_from ? new Date(query.work_date_from) : new Date('2020-04-01');
      const to = query.work_date_to ? new Date(query.work_date_to) : new Date();

      // 開始日と終了日から年度を算出
      const fromYear = from.getMonth() >= 3 ? from.getFullYear() : from.getFullYear() - 1;
      const toYear = to.getMonth() >= 3 ? to.getFullYear() : to.getFullYear() - 1;

      for (let y = fromYear; y <= toYear && y < currentFiscalYear; y++) {
        years.push(y);
      }
    } else {
      // 日付範囲が指定されていない場合は直近3年度分をチェック
      for (let y = currentFiscalYear - 3; y < currentFiscalYear; y++) {
        if (y >= 2020) years.push(y);
      }
    }

    return years;
  }
};
