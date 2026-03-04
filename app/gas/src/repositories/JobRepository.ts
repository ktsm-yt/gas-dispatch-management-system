/**
 * Job Repository
 *
 * T_Jobs テーブルのシートI/O処理
 */

const JobRepository = {
  TABLE_NAME: 'T_Jobs',
  ID_COLUMN: 'job_id',

  /**
   * IDで案件を取得（アーカイブDBフォールバック付き）
   */
  findById: function(jobId: string): JobRecord | null {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, jobId);
    if (record) {
      return this._normalizeRecord(record);
    }

    return this._findInArchive(jobId);
  },

  findByDate: function(date: string): JobRecord[] {
    const records = getAllRecords(this.TABLE_NAME);
    const result: JobRecord[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.is_deleted) continue;
      if (!r.work_date) continue;

      const workDateStr = this._normalizeDate(r.work_date);
      if (workDateStr !== date) continue;

      result.push(this._normalizeRecord(r));
    }

    return result;
  },

  search: function(query: JobSearchQuery = {}): JobRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    if (query.includeArchive) {
      const archiveRecords = this._getArchiveRecords(query);
      records = records.concat(archiveRecords as unknown as Record<string, unknown>[]);
    }

    const dateFrom = this._normalizeDate(query.work_date_from || query.date_from);
    const dateTo = this._normalizeDate(query.work_date_to || query.date_to);

    const normalizedRecords: (JobRecord & { _sortDate: string })[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.is_deleted) continue;

      const workDateStr = this._normalizeDate(r.work_date);

      if (query.customer_id && r.customer_id !== query.customer_id) continue;
      if (dateFrom && (!workDateStr || workDateStr < dateFrom)) continue;
      if (dateTo && (!workDateStr || workDateStr > dateTo)) continue;
      if (query.status && r.status !== query.status) continue;
      if (query.time_slot && r.time_slot !== query.time_slot) continue;
      if (query.site_name) {
        const searchTerm = (query.site_name as string).toLowerCase();
        if (!r.site_name || !(r.site_name as string).toLowerCase().includes(searchTerm)) continue;
      }

      normalizedRecords.push({
        ...this._normalizeRecord(r),
        _sortDate: workDateStr || ''
      });
    }

    const sortOrder = query.sort_order || 'asc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
    const timeOrder: Record<string, number> = { am: 0, pm: 1, night: 2 };

    normalizedRecords.sort((a, b) => {
      if (a._sortDate !== b._sortDate) {
        return (a._sortDate > b._sortDate ? 1 : -1) * sortMultiplier;
      }
      const timeA = timeOrder[a.time_slot as string] ?? 9;
      const timeB = timeOrder[b.time_slot as string] ?? 9;
      if (timeA !== timeB) {
        return (timeA - timeB) * sortMultiplier;
      }
      return (a.created_at > b.created_at ? 1 : -1) * sortMultiplier;
    });

    let result = normalizedRecords;
    if (query.limit && query.limit > 0) {
      result = normalizedRecords.slice(0, query.limit);
    }

    return result.map(r => {
      const { _sortDate, ...rest } = r;
      return rest;
    });
  },

  insert: function(job: Record<string, unknown>): JobRecord {
    const user = getCurrentUserEmail() || 'system';
    const now = getCurrentTimestamp();

    const newJob: Record<string, unknown> = {
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
      work_detail_other_text: job.work_detail_other_text || '',
      supervisor_name: job.supervisor_name || '',
      order_number: job.order_number || '',
      branch_office: job.branch_office || '',
      property_code: job.property_code || '',
      construction_div: job.construction_div || '',
      client_contact: job.client_contact || '',
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

    return this._normalizeRecord(newJob);
  },

  update: function(job: Record<string, unknown>, expectedUpdatedAt?: string): JobUpdateResult {
    if (!job.job_id) {
      return { success: false, error: 'job_id is required' };
    }

    if (job._archived && job._archiveFiscalYear) {
      return this._updateArchiveRecord(job, expectedUpdatedAt);
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, job.job_id as string);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentJob = rowToObject(headers, currentRow);

    if (currentJob.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    if (expectedUpdatedAt && currentJob.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: 'CONFLICT_ERROR',
        currentUpdatedAt: currentJob.updated_at as string
      };
    }

    const user = getCurrentUserEmail() || 'system';
    const now = getCurrentTimestamp();

    const updatableFields = [
      'customer_id', 'site_name', 'site_address', 'work_date', 'time_slot',
      'start_time', 'required_count',
      'pay_unit', 'work_category', 'work_detail', 'work_detail_other_text',
      'supervisor_name', 'order_number', 'branch_office', 'property_code', 'construction_div',
      'client_contact', 'status', 'is_damaged', 'is_uncollected', 'is_claimed', 'notes'
    ];

    const updatedJob: Record<string, unknown> = { ...currentJob };

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
      job: this._normalizeRecord(updatedJob),
      before: currentJob
    };
  },

  softDelete: function(jobId: string, expectedUpdatedAt?: string): JobUpdateResult {
    return this.update(
      { job_id: jobId, is_deleted: true, status: 'cancelled' },
      expectedUpdatedAt
    );
  },

  getMaxUpdatedAt: function(date: string): string | null {
    const jobs = this.findByDate(date);

    if (jobs.length === 0) {
      return null;
    }

    return jobs.reduce((max: string, job: JobRecord) => {
      return job.updated_at > max ? job.updated_at : max;
    }, jobs[0].updated_at);
  },

  getStatsByTimeSlot: function(date: string): Record<string, { total: number; required: number }> {
    const jobs = this.findByDate(date);

    const stats: Record<string, { total: number; required: number }> = {
      jotou: { total: 0, required: 0 },
      shuujitsu: { total: 0, required: 0 },
      am: { total: 0, required: 0 },
      pm: { total: 0, required: 0 },
      yakin: { total: 0, required: 0 },
      mitei: { total: 0, required: 0 }
    };

    for (const job of jobs) {
      const slot = job.time_slot as string;
      if (stats[slot]) {
        stats[slot].total++;
        stats[slot].required += Number(job.required_count) || 0;
      }
    }

    return stats;
  },

  _normalizeDate: function(dateValue: unknown): string | null {
    if (!dateValue) return null;

    if (dateValue instanceof Date) {
      if (isNaN(dateValue.getTime())) return null;
      // JST = UTC+9 固定（日本はDSTなし）
      const jst = new Date(dateValue.getTime() + 9 * 3600000);
      const y = jst.getUTCFullYear();
      if (y < 1901) return null; // 1899年問題ガード
      const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
      const d = String(jst.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return String(dateValue).replace(/\//g, '-');
  },

  _normalizeTime: function(timeValue: unknown): string {
    if (!timeValue && timeValue !== 0) return '';

    if (timeValue instanceof Date) {
      if (isNaN(timeValue.getTime())) return '';
      // GASはスプレッドシートの時刻セルをExcelエポック(1899-12-30)基準のDateで返す
      // getUTCHours()は0-23しか返せないため、24時以降(24:30, 25:00等)が失われる
      // エポックからの経過分で計算することで24時以降も正しく復元できる
      // GASのDateはJST(UTC+9)基準だがgetTime()はUTCミリ秒を返すため補正が必要
      // このプロジェクトはJST固定運用（Spreadsheet/Scriptのタイムゾーン="Asia/Tokyo"）
      const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30 UTC
      const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // JST = UTC+9（固定）
      const totalMinutes = Math.round((timeValue.getTime() - EXCEL_EPOCH_MS + JST_OFFSET_MS) / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    }

    if (typeof timeValue === 'number') {
      const totalMinutes = Math.round(timeValue * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    }

    return String(timeValue);
  },

  _normalizeRecord: function(record: Record<string, unknown>): JobRecord {
    return {
      ...record,
      work_date: this._normalizeDate(record.work_date) || '',
      start_time: this._normalizeTime(record.start_time),
      required_count: Number(record.required_count) || 0,
      pay_unit: (record.pay_unit as string) || '',
      is_damaged: record.is_damaged === true || record.is_damaged === 'true',
      is_uncollected: record.is_uncollected === true || record.is_uncollected === 'true',
      is_claimed: record.is_claimed === true || record.is_claimed === 'true',
      is_deleted: record.is_deleted === true || record.is_deleted === 'true',
      // GAS getValues() が Date オブジェクトを返す場合に備え、ISO文字列に正規化
      updated_at: record.updated_at instanceof Date
        ? (record.updated_at as Date).toISOString()
        : String(record.updated_at || ''),
      created_at: record.created_at instanceof Date
        ? (record.created_at as Date).toISOString()
        : String(record.created_at || ''),
    } as JobRecord;
  },

  _getArchiveRecords: function(query: JobSearchQuery): JobRecord[] {
    const archiveRecords: JobRecord[] = [];

    const targetYears = this._getTargetFiscalYears(query);

    for (const fiscalYear of targetYears) {
      const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, this.TABLE_NAME);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0] as string[];

        for (let i = 1; i < data.length; i++) {
          const record: Record<string, unknown> = {};
          for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = data[i][j];
          }
          record._archived = true;
          record._archiveFiscalYear = fiscalYear;
          archiveRecords.push(this._normalizeRecord(record));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`アーカイブDB読み込みエラー (${fiscalYear}): ${msg}`);
      }
    }

    return archiveRecords;
  },

  _getTargetFiscalYears: function(query: JobSearchQuery): number[] {
    const years: number[] = [];
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    if (query.work_date_from || query.work_date_to) {
      const from = query.work_date_from ? new Date(query.work_date_from) : new Date('2020-03-01');
      const to = query.work_date_to ? new Date(query.work_date_to) : new Date();

      const fromYear = getFiscalYear_(from);
      const toYear = getFiscalYear_(to);

      for (let y = fromYear; y <= toYear && y < currentFiscalYear; y++) {
        years.push(y);
      }
    } else {
      for (let y = currentFiscalYear - 3; y < currentFiscalYear; y++) {
        if (y >= 2020) years.push(y);
      }
    }

    return years;
  },

  _updateArchiveRecord: function(job: Record<string, unknown>, expectedUpdatedAt?: string): JobUpdateResult {
    const fiscalYear = job._archiveFiscalYear as number;
    const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);

    if (!archiveDbId) {
      return { success: false, error: 'ARCHIVE_DB_NOT_FOUND', message: `${fiscalYear}年度のアーカイブDBが見つかりません。` };
    }

    try {
      const archiveDb = SpreadsheetApp.openById(archiveDbId);
      const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
      const sheet = archiveDb.getSheetByName(sheetName);

      if (!sheet) {
        return { success: false, error: 'ARCHIVE_SHEET_NOT_FOUND', message: `アーカイブDBに${sheetName}シートが見つかりません。` };
      }

      const headers = getHeaders(sheet);
      const idColIndex = headers.indexOf(this.ID_COLUMN);
      const updatedAtColIndex = headers.indexOf('updated_at');

      if (idColIndex === -1) {
        return { success: false, error: 'SCHEMA_ERROR', message: 'アーカイブDBのスキーマが不正です。' };
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return { success: false, error: 'NOT_FOUND' };
      }

      const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      let targetRowIndex = -1;
      let currentRecord: Record<string, unknown> | null = null;

      for (let i = 0; i < data.length; i++) {
        if (data[i][idColIndex] === job.job_id) {
          targetRowIndex = i;
          currentRecord = rowToObject(headers, data[i]);
          break;
        }
      }

      if (targetRowIndex === -1 || !currentRecord) {
        return { success: false, error: 'NOT_FOUND' };
      }

      if (expectedUpdatedAt && currentRecord.updated_at !== expectedUpdatedAt) {
        return {
          success: false,
          error: 'CONFLICT_ERROR',
          currentUpdatedAt: currentRecord.updated_at as string
        };
      }

      const user = getCurrentUserEmail() || 'system';
      const now = getCurrentTimestamp();

      const updatableFields = [
        'customer_id', 'site_name', 'site_address', 'work_date', 'time_slot',
        'start_time', 'required_count',
        'pay_unit', 'work_category', 'work_detail', 'work_detail_other_text',
        'supervisor_name', 'order_number', 'branch_office', 'property_code', 'construction_div',
        'client_contact', 'status', 'is_damaged', 'is_uncollected', 'is_claimed', 'notes'
      ];

      const updatedJob: Record<string, unknown> = { ...currentRecord };

      for (const field of updatableFields) {
        if (job[field] !== undefined) {
          updatedJob[field] = job[field];
        }
      }

      updatedJob.updated_at = now;
      updatedJob.updated_by = user;

      const newRow = objectToRow(headers, updatedJob);
      sheet.getRange(targetRowIndex + 2, 1, 1, headers.length).setValues([newRow]);

      const normalized = this._normalizeRecord(updatedJob);
      normalized._archived = true;
      normalized._archiveFiscalYear = fiscalYear;

      return {
        success: true,
        job: normalized,
        before: currentRecord
      };

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`アーカイブDB更新エラー: ${msg}`);
      return { success: false, error: 'ARCHIVE_UPDATE_ERROR', message: msg };
    }
  },

  _findInArchive: function(jobId: string): JobRecord | null {
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    for (let y = currentFiscalYear - 1; y >= currentFiscalYear - 3 && y >= 2020; y--) {
      const archiveDbId = ArchiveService.getArchiveDbId(y);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
        const sheet = archiveDb.getSheetByName(sheetName);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0] as string[];
        const idColIndex = headers.indexOf(this.ID_COLUMN);
        if (idColIndex === -1) continue;

        for (let i = 1; i < data.length; i++) {
          if (data[i][idColIndex] === jobId) {
            const record: Record<string, unknown> = {};
            for (let j = 0; j < headers.length; j++) {
              record[headers[j]] = data[i][j];
            }
            record._archived = true;
            record._archiveFiscalYear = y;

            return this._normalizeRecord(record);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`アーカイブDB検索エラー (${y}): ${msg}`);
      }
    }

    return null;
  }
};
