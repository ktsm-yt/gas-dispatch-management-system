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

    // work_dateをYYYY-MM-DD形式の文字列に変換
    return {
      ...record,
      work_date: record.work_date instanceof Date
        ? Utilities.formatDate(record.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
        : record.work_date
    };
  },

  /**
   * 日付で案件を検索（ダッシュボード用）
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object[]} 案件配列
   */
  findByDate: function(date) {
    const records = getAllRecords(this.TABLE_NAME);

    // 日付比較（DateオブジェクトまたはYYYY-MM-DD文字列に対応）
    return records.filter(r => {
      if (r.is_deleted) return false;

      const workDate = r.work_date;
      if (!workDate) return false;

      // Dateオブジェクトの場合はフォーマット
      const workDateStr = workDate instanceof Date
        ? Utilities.formatDate(workDate, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(workDate);

      return workDateStr === date;
    });
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
   * @returns {Object[]} 案件配列
   */
  search: function(query = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    // 論理削除除外
    records = records.filter(r => !r.is_deleted);

    // 顧客IDで絞り込み
    if (query.customer_id) {
      records = records.filter(r => r.customer_id === query.customer_id);
    }

    // 日付範囲で絞り込み（Date型対応）
    if (query.work_date_from) {
      records = records.filter(r => {
        if (!r.work_date) return false;
        const workDateStr = r.work_date instanceof Date
          ? Utilities.formatDate(r.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
          : String(r.work_date);
        return workDateStr >= query.work_date_from;
      });
    }
    if (query.work_date_to) {
      records = records.filter(r => {
        if (!r.work_date) return false;
        const workDateStr = r.work_date instanceof Date
          ? Utilities.formatDate(r.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
          : String(r.work_date);
        return workDateStr <= query.work_date_to;
      });
    }

    // ステータスで絞り込み
    if (query.status) {
      records = records.filter(r => r.status === query.status);
    }

    // 時間区分で絞り込み
    if (query.time_slot) {
      records = records.filter(r => r.time_slot === query.time_slot);
    }

    // 現場名で絞り込み（部分一致）
    if (query.site_name) {
      const searchTerm = query.site_name.toLowerCase();
      records = records.filter(r =>
        r.site_name && r.site_name.toLowerCase().includes(searchTerm)
      );
    }

    // ソート（デフォルト: 昇順 = 近い日付が上）
    const sortOrder = query.sort_order || 'asc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;

    records.sort((a, b) => {
      const dateA = a.work_date instanceof Date
        ? Utilities.formatDate(a.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(a.work_date || '');
      const dateB = b.work_date instanceof Date
        ? Utilities.formatDate(b.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(b.work_date || '');
      if (dateA !== dateB) {
        return (dateA > dateB ? 1 : -1) * sortMultiplier;
      }
      // 同日内は時間帯順（am→pm→night）
      const timeOrder = { am: 0, pm: 1, night: 2 };
      const timeA = timeOrder[a.time_slot] ?? 9;
      const timeB = timeOrder[b.time_slot] ?? 9;
      if (timeA !== timeB) {
        return (timeA - timeB) * sortMultiplier;
      }
      return (a.created_at > b.created_at ? 1 : -1) * sortMultiplier;
    });

    // 件数制限
    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    // work_dateを文字列に変換
    return records.map(r => ({
      ...r,
      work_date: r.work_date instanceof Date
        ? Utilities.formatDate(r.work_date, 'Asia/Tokyo', 'yyyy-MM-dd')
        : r.work_date
    }));
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
      job_type: job.job_type,
      supervisor_name: job.supervisor_name || '',
      order_number: job.order_number || '',
      branch_office: job.branch_office || '',
      property_code: job.property_code || '',
      construction_div: job.construction_div || '',
      status: job.status || 'pending',
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
      'start_time', 'required_count', 'job_type', 'supervisor_name',
      'order_number', 'branch_office', 'property_code', 'construction_div',
      'status', 'notes'
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
  }
};
