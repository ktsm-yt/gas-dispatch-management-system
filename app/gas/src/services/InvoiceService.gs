/**
 * Invoice Service
 *
 * 請求管理の業務ロジック
 */

const InvoiceService = {
  /**
   * 請求書を生成（配置データから自動作成）
   * @param {string} customerId - 顧客ID
   * @param {number} year - 請求年
   * @param {number} month - 請求月
   * @param {Object} options - オプション
   * @returns {Object} 生成結果 { success, invoice, lines, error }
   */
  generate: function(customerId, year, month, options = {}) {
    try {
      // 1. 顧客情報を取得
      const customer = this._getCustomer(customerId);
      if (!customer) {
        return { success: false, error: 'CUSTOMER_NOT_FOUND' };
      }

      // 2. 既存の請求書をチェック（重複防止）
      const existingInvoices = InvoiceRepository.findByPeriod(year, month, {
        customer_id: customerId
      });
      if (existingInvoices.length > 0 && !options.allowDuplicate) {
        return {
          success: false,
          error: 'INVOICE_ALREADY_EXISTS',
          existingInvoice: existingInvoices[0]
        };
      }

      // 3. 対象期間の配置データを取得（顧客の締め日を考慮）
      const closingDay = customer.closing_day || 31;
      const assignments = this._getAssignmentsForPeriod(customerId, year, month, closingDay);
      if (assignments.length === 0 && !options.allowEmpty) {
        return { success: false, error: 'NO_ASSIGNMENTS_FOUND' };
      }

      // 4. 明細行を生成
      const lines = this._generateLines(assignments, customer);

      // 5. 合計金額を計算
      const taxRate = customer.tax_rate || DEFAULT_TAX_RATE;
      const expenseRate = customer.expense_rate || 0;
      const totals = this._calculateTotals(lines, taxRate, expenseRate, customer.invoice_format);

      // 6. 請求番号を生成
      const invoiceNumber = InvoiceRepository.generateInvoiceNumber(year, month, customerId);

      // 7. 発行日・支払期限を計算
      const dates = this._calculateDates(customer, year, month);

      // 8. 請求書を作成
      const invoice = InvoiceRepository.insert({
        invoice_number: invoiceNumber,
        customer_id: customerId,
        billing_year: year,
        billing_month: month,
        issue_date: dates.issueDate,
        due_date: dates.dueDate,
        subtotal: totals.subtotal,
        expense_amount: totals.expenseAmount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        invoice_format: customer.invoice_format || 'format1',
        shipper_name: customer.shipper_name || customer.company_name || '',
        status: 'unsent'
      });

      // 9. 明細行を作成
      const createdLines = InvoiceLineRepository.bulkInsert(
        lines.map((line, index) => ({
          ...line,
          invoice_id: invoice.invoice_id,
          line_number: index + 1
        }))
      );

      return {
        success: true,
        invoice: invoice,
        lines: createdLines
      };
    } catch (error) {
      console.error('InvoiceService.generate error:', error);
      return { success: false, error: error.message || 'GENERATE_ERROR' };
    }
  },

  /**
   * 請求書を取得（明細付き）
   * @param {string} invoiceId - 請求ID
   * @returns {Object|null} 請求書（明細付き）
   */
  get: function(invoiceId) {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) return null;

    const lines = InvoiceLineRepository.findByInvoiceId(invoiceId);
    const customer = this._getCustomer(invoice.customer_id);

    return {
      ...invoice,
      lines: lines,
      customer: customer
    };
  },

  /**
   * 請求書一覧を検索
   * @param {Object} query - 検索条件
   * @param {boolean} query.includeChangeDetection - 配置変更検知フラグを含めるか
   * @returns {Object[]} 請求書配列
   */
  search: function(query = {}) {
    const invoices = InvoiceRepository.search(query);
    const includeChangeDetection = query.includeChangeDetection !== false; // デフォルトtrue

    // 顧客情報を付加
    const customerCache = {};

    // 配置変更検知のためのデータを一括取得
    let assignmentUpdates = {};
    if (includeChangeDetection && invoices.length > 0) {
      assignmentUpdates = this._getAssignmentUpdatesForInvoices(invoices);
    }

    return invoices.map(inv => {
      if (!customerCache[inv.customer_id]) {
        customerCache[inv.customer_id] = this._getCustomer(inv.customer_id);
      }

      // 配置変更があるかチェック
      let hasAssignmentChanges = false;
      if (includeChangeDetection) {
        const latestUpdate = assignmentUpdates[inv.invoice_id];
        if (latestUpdate && inv.created_at) {
          const invoiceCreatedAt = new Date(inv.created_at).getTime();
          const assignmentUpdatedAt = new Date(latestUpdate).getTime();
          hasAssignmentChanges = assignmentUpdatedAt > invoiceCreatedAt;
        }
      }

      return {
        ...inv,
        customer: customerCache[inv.customer_id],
        has_assignment_changes: hasAssignmentChanges
      };
    });
  },

  /**
   * 請求書を保存（下書き編集）
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 保存結果
   */
  save: function(invoice, lines, expectedUpdatedAt) {
    try {
      // 請求書を更新
      const invoiceResult = InvoiceRepository.update(invoice, expectedUpdatedAt);
      if (!invoiceResult.success) {
        return invoiceResult;
      }

      // 明細を更新（差分適用）
      if (lines && lines.length > 0) {
        const existingLines = InvoiceLineRepository.findByInvoiceId(invoice.invoice_id);
        const existingIds = existingLines.map(l => l.line_id);

        const toAdd = [];
        const toUpdate = [];
        const toDelete = [];

        for (const line of lines) {
          if (line._deleted) {
            if (line.line_id && existingIds.includes(line.line_id)) {
              toDelete.push(line.line_id);
            }
          } else if (line.line_id && existingIds.includes(line.line_id)) {
            toUpdate.push(line);
          } else {
            toAdd.push({ ...line, invoice_id: invoice.invoice_id });
          }
        }

        // 削除されたIDを特定
        const updatedIds = lines.filter(l => !l._deleted && l.line_id).map(l => l.line_id);
        for (const existingId of existingIds) {
          if (!updatedIds.includes(existingId) && !toDelete.includes(existingId)) {
            toDelete.push(existingId);
          }
        }

        // 適用
        if (toAdd.length > 0) {
          InvoiceLineRepository.bulkInsert(toAdd);
        }
        if (toUpdate.length > 0) {
          InvoiceLineRepository.bulkUpdate(toUpdate);
        }
        for (const lineId of toDelete) {
          InvoiceLineRepository.update({ line_id: lineId, is_deleted: true });
        }
      }

      // 合計を再計算
      const currentInvoice = InvoiceRepository.findById(invoice.invoice_id);
      const currentLines = InvoiceLineRepository.findByInvoiceId(invoice.invoice_id);
      const customer = this._getCustomer(currentInvoice.customer_id);
      const taxRate = customer?.tax_rate || DEFAULT_TAX_RATE;
      const expenseRate = customer?.expense_rate || 0;
      const totals = this._calculateTotals(currentLines, taxRate, expenseRate, currentInvoice.invoice_format);

      // 合計を更新
      InvoiceRepository.update({
        invoice_id: invoice.invoice_id,
        subtotal: totals.subtotal,
        expense_amount: totals.expenseAmount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount
      }, currentInvoice.updated_at);

      return {
        success: true,
        invoice: InvoiceRepository.findById(invoice.invoice_id),
        lines: InvoiceLineRepository.findByInvoiceId(invoice.invoice_id)
      };
    } catch (error) {
      console.error('InvoiceService.save error:', error);
      return { success: false, error: error.message || 'SAVE_ERROR' };
    }
  },

  /**
   * ステータスを更新
   * @param {string} invoiceId - 請求ID
   * @param {string} status - 新しいステータス
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果
   */
  updateStatus: function(invoiceId, status, expectedUpdatedAt) {
    const normalizeStatus = s => String(s || '').trim().toLowerCase();
    const normalizedStatus = normalizeStatus(status);

    // ステータス遷移の検証
    const validStatuses = ['unsent', 'sent', 'unpaid', 'paid'];
    if (!validStatuses.includes(normalizedStatus)) {
      return { success: false, error: 'INVALID_STATUS' };
    }

    const current = InvoiceRepository.findById(invoiceId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // ステータス遷移ルール（status_rules.js の INVOICE_STATUS_TRANSITIONS に準拠）
    // 旧ステータスも新ステータスにマッピング
    const currentStatusNormalized = normalizeStatus(
      (current.status === 'draft' || current.status === 'issued') ? 'unsent' : current.status
    );
    const allowedTransitions = {
      unsent: ['sent'],
      sent: ['paid', 'unpaid', 'unsent'],
      unpaid: ['paid', 'sent'],
      paid: ['sent']
    };
    if (currentStatusNormalized !== normalizedStatus && !allowedTransitions[currentStatusNormalized]?.includes(normalizedStatus)) {
      return { success: false, error: 'INVALID_STATUS_TRANSITION' };
    }

    return InvoiceRepository.update(
      { invoice_id: invoiceId, status: normalizedStatus },
      expectedUpdatedAt
    );
  },

  /**
   * 請求書を削除
   * @param {string} invoiceId - 請求ID
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 削除結果
   */
  delete: function(invoiceId, expectedUpdatedAt) {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 送付済み以降は削除不可（未送付/draft/issuedのみ削除可能）
    const deletableStatuses = ['unsent', 'draft', 'issued'];
    if (!deletableStatuses.includes(invoice.status)) {
      return { success: false, error: 'CANNOT_DELETE_SENT_INVOICE' };
    }

    // 明細を削除
    InvoiceLineRepository.deleteByInvoiceId(invoiceId);

    // 請求書を削除
    return InvoiceRepository.softDelete(invoiceId, expectedUpdatedAt);
  },

  /**
   * 請求書を一括生成（全アクティブ顧客）- 最適化版
   * バッチ内でシートI/Oを集約し、パフォーマンスを大幅に向上
   * @param {number} year - 請求年
   * @param {number} month - 請求月
   * @param {Object} options - オプション
   * @param {boolean} options.overwrite - 既存を上書きするか
   * @param {number} options.offset - 開始位置（デフォルト0）
   * @param {number} options.limit - 処理件数（デフォルト10）
   * @returns {Object} 生成結果 { success, skippedNoData, skippedExisting, failed, progress }
   */
  bulkGenerate: function(year, month, options = {}) {
    const offset = options.offset || 0;
    const limit = options.limit || 10;

    const results = {
      success: [],
      skippedNoData: [],
      skippedExisting: [],
      failed: [],
      progress: { processed: 0, total: 0, hasMore: false }
    };

    // アクティブな全顧客を取得
    const customersResult = listCustomers({ activeOnly: true });
    if (!customersResult.ok) {
      return { success: [], skippedNoData: [], skippedExisting: [], failed: [{ error: 'Failed to fetch customers' }], progress: { processed: 0, total: 0, hasMore: false } };
    }

    const allCustomers = customersResult.data?.items || [];
    const totalCount = allCustomers.length;

    // offset から limit 件だけ処理
    const customers = allCustomers.slice(offset, offset + limit);

    results.progress.total = totalCount;
    results.progress.processed = Math.min(offset + customers.length, totalCount);
    results.progress.hasMore = offset + limit < totalCount;

    if (customers.length === 0) {
      return results;
    }

    try {
      // === バッチ最適化: 1回だけシートを読み込み ===
      const allJobs = getAllRecords('T_Jobs');
      const allAssignments = getAllRecords('T_JobAssignments');
      const allInvoices = getAllRecords('T_Invoices');

      // インデックス構築: 顧客IDでグループ化
      const jobsByCustomer = this._groupBy(allJobs, 'customer_id');
      const assignmentsByJob = this._groupBy(allAssignments, 'job_id');

      // 既存請求書のインデックス: {customerId_year_month: invoice}
      const existingInvoiceIndex = {};
      for (const inv of allInvoices) {
        if (!inv.is_deleted) {
          const key = `${inv.customer_id}_${inv.billing_year}_${inv.billing_month}`;
          existingInvoiceIndex[key] = inv;
        }
      }

      // 請求番号の開始連番を取得（ロック内で1回だけ）
      const yy = String(year).slice(-2);
      const mm = String(month).padStart(2, '0');
      const prefix = `${yy}${mm}_`;
      let maxSeq = this._getMaxInvoiceSequence(allInvoices, prefix);

      // === 上書きモード: 既存請求書を一括削除（最適化） ===
      if (options.overwrite) {
        const toDeleteInvoiceIds = [];
        for (const customer of customers) {
          const existingKey = `${customer.customer_id}_${year}_${month}`;
          const existing = existingInvoiceIndex[existingKey];
          if (existing) {
            toDeleteInvoiceIds.push(existing.invoice_id);
            delete existingInvoiceIndex[existingKey];
          }
        }

        if (toDeleteInvoiceIds.length > 0) {
          // 明細を一括削除（1回のシートI/O）
          InvoiceLineRepository.bulkDeleteByInvoiceIds(toDeleteInvoiceIds);
          // 請求書を一括論理削除（1回のシートI/O）
          InvoiceRepository.bulkSoftDelete(toDeleteInvoiceIds);
          console.log(`BulkGenerate: 既存 ${toDeleteInvoiceIds.length} 件を一括削除`);
        }
      }

      // バッチ用の新規請求書・明細を集約
      const newInvoices = [];
      const newLines = [];

      for (const customer of customers) {
        const customerId = customer.customer_id;
        const companyName = customer.company_name || '';

        try {
          // 既存チェック（メモリ上で高速判定）
          // 注: 上書きモードの場合、既存請求書は事前に一括削除済みでインデックスからも除去済み
          const existingKey = `${customerId}_${year}_${month}`;
          const existing = existingInvoiceIndex[existingKey];

          if (existing) {
            // overwrite=false の場合のみここに到達
            results.skippedExisting.push({ customerId, companyName });
            continue;
          }

          // 対象期間の配置データを取得（メモリ上で処理）
          const closingDay = customer.closing_day || 31;
          const assignments = this._getAssignmentsFromCache(
            customerId, year, month, closingDay,
            jobsByCustomer, assignmentsByJob
          );

          if (assignments.length === 0) {
            results.skippedNoData.push({ customerId, companyName });
            continue;
          }

          // 明細行を生成
          const lines = this._generateLines(assignments, customer);

          // 合計金額を計算
          const taxRate = customer.tax_rate || DEFAULT_TAX_RATE;
          const expenseRate = customer.expense_rate || 0;
          const totals = this._calculateTotals(lines, taxRate, expenseRate, customer.invoice_format);

          // 請求番号を生成（メモリ上で連番配布）
          maxSeq++;
          const invoiceNumber = `${prefix}${maxSeq}`;

          // 発行日・支払期限を計算
          const dates = this._calculateDates(customer, year, month);

          // 請求書データを作成
          const invoiceId = generateId('inv');
          const user = getCurrentUserEmail();
          const now = getCurrentTimestamp();

          const invoice = {
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            customer_id: customerId,
            billing_year: year,
            billing_month: month,
            issue_date: dates.issueDate,
            due_date: dates.dueDate,
            subtotal: totals.subtotal,
            expense_amount: totals.expenseAmount,
            tax_amount: totals.taxAmount,
            total_amount: totals.totalAmount,
            invoice_format: customer.invoice_format || 'format1',
            shipper_name: customer.shipper_name || customer.company_name || '',
            pdf_file_id: '',
            excel_file_id: '',
            sheet_file_id: '',
            status: 'unsent',
            notes: '',
            created_at: now,
            created_by: user,
            updated_at: now,
            is_deleted: false
          };

          newInvoices.push(invoice);

          // 明細データを作成
          for (let i = 0; i < lines.length; i++) {
            newLines.push({
              ...lines[i],
              line_id: generateId('line'),
              invoice_id: invoiceId,
              line_number: i + 1,
              created_at: now,
              created_by: user,
              updated_at: now,
              is_deleted: false
            });
          }

          results.success.push({
            customerId,
            companyName,
            invoiceId: invoiceId,
            invoiceNumber: invoiceNumber
          });

        } catch (e) {
          console.error(`BulkGenerate error for customer ${customerId}:`, e);
          results.failed.push({ customerId, companyName, error: e.message || 'UNKNOWN_ERROR' });
        }
      }

      // === 一括挿入（シート書き込みを最小化）===
      if (newInvoices.length > 0) {
        insertRecords('T_Invoices', newInvoices);
      }
      if (newLines.length > 0) {
        insertRecords('T_InvoiceLines', newLines);
      }

    } catch (e) {
      console.error('BulkGenerate batch error:', e);
      // バッチ全体のエラーは全顧客に影響
      for (const customer of customers) {
        if (!results.success.find(s => s.customerId === customer.customer_id) &&
            !results.skippedExisting.find(s => s.customerId === customer.customer_id) &&
            !results.skippedNoData.find(s => s.customerId === customer.customer_id) &&
            !results.failed.find(f => f.customerId === customer.customer_id)) {
          results.failed.push({
            customerId: customer.customer_id,
            companyName: customer.company_name || '',
            error: e.message || 'BATCH_ERROR'
          });
        }
      }
    }

    return results;
  },

  /**
   * 配列をキーでグループ化
   * @param {Object[]} array - 配列
   * @param {string} key - グループ化キー
   * @returns {Object} { keyValue: [items...], ... }
   */
  _groupBy: function(array, key) {
    const result = {};
    for (const item of array) {
      const keyValue = item[key];
      if (!result[keyValue]) {
        result[keyValue] = [];
      }
      result[keyValue].push(item);
    }
    return result;
  },

  /**
   * 請求番号の最大連番を取得
   * @param {Object[]} invoices - 請求書配列
   * @param {string} prefix - プレフィックス（YYMM_）
   * @returns {number} 最大連番（なければ0）
   */
  _getMaxInvoiceSequence: function(invoices, prefix) {
    let maxSeq = 0;
    for (const inv of invoices) {
      if (!inv.is_deleted && inv.invoice_number && inv.invoice_number.startsWith(prefix)) {
        const parts = inv.invoice_number.split('_');
        if (parts.length === 2) {
          const seq = parseInt(parts[1], 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      }
    }
    return maxSeq;
  },

  /**
   * キャッシュから配置データを取得（メモリ上で処理）
   * @param {string} customerId - 顧客ID
   * @param {number} year - 年
   * @param {number} month - 月
   * @param {number} closingDay - 締め日
   * @param {Object} jobsByCustomer - 顧客別案件インデックス
   * @param {Object} assignmentsByJob - 案件別配置インデックス
   * @returns {Object[]} 配置データ（案件情報付き）
   */
  _getAssignmentsFromCache: function(customerId, year, month, closingDay, jobsByCustomer, assignmentsByJob) {
    const { startDate, endDate } = calculateClosingPeriod_(year, month, closingDay || 31);

    const customerJobs = jobsByCustomer[customerId] || [];
    const result = [];

    for (const job of customerJobs) {
      // 削除済み・キャンセル・保留は除外
      if (job.is_deleted || job.status === 'cancelled' || job.status === 'hold') {
        continue;
      }

      // 日付を正規化
      let workDateStr = job.work_date;
      if (job.work_date instanceof Date) {
        workDateStr = Utilities.formatDate(job.work_date, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (typeof job.work_date === 'string') {
        workDateStr = job.work_date.replace(/\//g, '-');
      }

      // 期間チェック
      if (!workDateStr || workDateStr < startDate || workDateStr > endDate) {
        continue;
      }

      // 案件の配置を取得
      const assignments = assignmentsByJob[job.job_id] || [];
      for (const assignment of assignments) {
        // 削除済み・キャンセルは除外
        if (assignment.is_deleted || assignment.status === 'CANCELLED') {
          continue;
        }

        result.push({
          ...assignment,
          job: {
            ...job,
            work_date: workDateStr
          }
        });
      }
    }

    // 作業日順でソート
    result.sort((a, b) => {
      const dateA = a.job.work_date || '';
      const dateB = b.job.work_date || '';
      if (dateA !== dateB) {
        return dateA < dateB ? -1 : 1;
      }
      return (a.job.site_name || '').localeCompare(b.job.site_name || '');
    });

    return result;
  },

  /**
   * 請求書を再生成（既存の請求書を削除して新規作成）
   * @param {string} invoiceId - 請求ID
   * @returns {Object} 再生成結果
   */
  regenerate: function(invoiceId) {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      return { success: false, error: 'NOT_FOUND' };
    }

    if (invoice.status !== 'draft') {
      return { success: false, error: 'CANNOT_REGENERATE_ISSUED_INVOICE' };
    }

    // 既存を削除
    this.delete(invoiceId, invoice.updated_at);

    // 新規生成
    return this.generate(
      invoice.customer_id,
      invoice.billing_year,
      invoice.billing_month,
      { allowDuplicate: true }
    );
  },

  // ============================================
  // Private Methods
  // ============================================

  /**
   * 顧客情報を取得
   * @param {string} customerId - 顧客ID
   * @returns {Object|null} 顧客情報
   */
  _getCustomer: function(customerId) {
    return getRecordById('M_Customers', 'customer_id', customerId);
  },

  /**
   * 請求書に関連する配置の最新更新日時を取得
   * @param {Object[]} invoices - 請求書配列
   * @returns {Object} { invoice_id: latest_updated_at }
   */
  _getAssignmentUpdatesForInvoices: function(invoices) {
    if (!invoices || invoices.length === 0) {
      return {};
    }

    // 請求書IDのセットを作成
    const invoiceIds = invoices.map(inv => inv.invoice_id);

    // 全明細を一括取得
    const allLines = getAllRecords('T_InvoiceLines');
    const relevantLines = allLines.filter(line =>
      !line.is_deleted && invoiceIds.includes(line.invoice_id)
    );

    // 明細からassignment_idを抽出
    const assignmentIds = new Set();
    const linesByInvoice = {};
    for (const line of relevantLines) {
      if (line.assignment_id) {
        assignmentIds.add(line.assignment_id);
        if (!linesByInvoice[line.invoice_id]) {
          linesByInvoice[line.invoice_id] = [];
        }
        linesByInvoice[line.invoice_id].push(line.assignment_id);
      }
    }

    if (assignmentIds.size === 0) {
      return {};
    }

    // 配置を一括取得
    const allAssignments = getAllRecords('T_JobAssignments');
    const assignmentMap = {};
    for (const asg of allAssignments) {
      if (!asg.is_deleted && assignmentIds.has(asg.assignment_id)) {
        assignmentMap[asg.assignment_id] = asg.updated_at;
      }
    }

    // 請求書ごとに最新のupdated_atを計算
    const result = {};
    for (const invoiceId of Object.keys(linesByInvoice)) {
      const asgIds = linesByInvoice[invoiceId];
      let latestUpdate = null;
      for (const asgId of asgIds) {
        const updatedAt = assignmentMap[asgId];
        if (updatedAt) {
          if (!latestUpdate || updatedAt > latestUpdate) {
            latestUpdate = updatedAt;
          }
        }
      }
      if (latestUpdate) {
        result[invoiceId] = latestUpdate;
      }
    }

    return result;
  },

  /**
   * 対象期間の配置データを取得
   * @param {string} customerId - 顧客ID
   * @param {number} year - 年
   * @param {number} month - 月
   * @param {number} closingDay - 締め日（1-31、31=月末）
   * @returns {Object[]} 配置データ（案件情報付き）
   */
  _getAssignmentsForPeriod: function(customerId, year, month, closingDay) {
    // 対象期間の開始日・終了日（顧客の締め日に基づいて計算）
    const { startDate, endDate } = calculateClosingPeriod_(year, month, closingDay || 31);

    // 顧客の案件を取得
    const jobs = JobRepository.search({
      customer_id: customerId,
      work_date_from: startDate,
      work_date_to: endDate
    });

    if (jobs.length === 0) {
      return [];
    }

    // 案件ごとの配置を取得
    const result = [];
    for (const job of jobs) {
      // キャンセル・保留は除外
      if (job.status === 'cancelled' || job.status === 'hold') {
        continue;
      }

      const assignments = AssignmentRepository.findByJobId(job.job_id);
      for (const assignment of assignments) {
        // キャンセル済みは除外
        if (assignment.status === 'CANCELLED') {
          continue;
        }

        result.push({
          ...assignment,
          job: job
        });
      }
    }

    // 作業日順でソート
    result.sort((a, b) => {
      const dateA = a.job.work_date || '';
      const dateB = b.job.work_date || '';
      if (dateA !== dateB) {
        return dateA < dateB ? -1 : 1;
      }
      return (a.job.site_name || '').localeCompare(b.job.site_name || '');
    });

    return result;
  },

  /**
   * 明細行を生成
   * @param {Object[]} assignments - 配置データ（案件情報付き）
   * @param {Object} customer - 顧客情報
   * @returns {Object[]} 明細行
   */
  _generateLines: function(assignments, customer) {
    const lines = [];

    // P2-8: 顧客の諸経費請求設定を確認
    const hasTransportFee = customer.has_transport_fee === true || customer.has_transport_fee === 'true';

    // P2-8: エリアコード→エリア名のマップを事前に作成（諸経費請求がONの場合のみ）
    let transportAreaMap = {};
    if (hasTransportFee) {
      try {
        const transportFees = listTransportFees();
        transportFees.forEach(fee => {
          transportAreaMap[fee.area_code] = fee.area_name;
        });
      } catch (e) {
        console.warn('交通費マスタの取得に失敗:', e.message);
      }
    }

    // ============================================
    // P2-8: 同一作業種別の集約処理
    // 同じ案件+作業種別+単価の配置は1行に集約（数量で調整）
    // 異なる作業種別（ハーフ/終日/上棟など）は別行
    // ============================================

    // Step 1: 配置を job_id + invoice_unit + unit_price でグループ化
    const workGroups = {};   // 作業行グループ
    const expenseGroups = {}; // 諸経費行グループ

    for (const asg of assignments) {
      const job = asg.job;
      const invoiceUnit = asg.invoice_unit || job.pay_unit || 'basic';

      // 請求単価を決定
      let unitPrice = asg.invoice_rate;
      if (!unitPrice && unitPrice !== 0) {
        unitPrice = getUnitPriceByJobType_(customer, invoiceUnit);
      }
      unitPrice = unitPrice || 0;

      // 作業行のグループキー: job_id + invoice_unit + unit_price
      const workKey = `${job.job_id}_${invoiceUnit}_${unitPrice}`;
      if (!workGroups[workKey]) {
        workGroups[workKey] = {
          assignments: [],
          job: job,
          invoiceUnit: invoiceUnit,
          unitPrice: unitPrice
        };
      }
      workGroups[workKey].assignments.push(asg);

      // 諸経費行のグループ化
      const transportAmount = Number(asg.transport_amount) || 0;
      if (hasTransportFee && transportAmount > 0) {
        // 備考欄の生成: 駅名があれば優先、なければエリア名
        let expenseNote = '';
        if (asg.transport_station) {
          expenseNote = asg.transport_station;
          if (asg.transport_has_bus === true || asg.transport_has_bus === 'true') {
            expenseNote += '（バス）';
          }
        } else if (asg.transport_area && transportAreaMap[asg.transport_area]) {
          expenseNote = transportAreaMap[asg.transport_area];
        }

        // 諸経費行のグループキー: job_id + expense_note + unit_price
        const expenseKey = `${job.job_id}_${expenseNote}_${transportAmount}`;
        if (!expenseGroups[expenseKey]) {
          expenseGroups[expenseKey] = {
            assignments: [],
            job: job,
            expenseNote: expenseNote,
            unitPrice: transportAmount
          };
        }
        expenseGroups[expenseKey].assignments.push(asg);
      }
    }

    // Step 2: グループを日付+現場名でソートして明細行を生成
    const workGroupsSorted = Object.values(workGroups).sort((a, b) => {
      const dateA = a.job.work_date || '';
      const dateB = b.job.work_date || '';
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      const siteCompare = (a.job.site_name || '').localeCompare(b.job.site_name || '');
      if (siteCompare !== 0) return siteCompare;
      // 同一案件内は作業種別でソート
      return (a.invoiceUnit || '').localeCompare(b.invoiceUnit || '');
    });

    // P2-8: 日付+現場名の重複表示抑制用
    let prevDateSite = null;
    // 各job_idの諸経費行出力済みフラグ
    const expenseAddedForJob = {};

    for (const group of workGroupsSorted) {
      const job = group.job;
      const quantity = group.assignments.length;
      const unitPrice = group.unitPrice;
      const amount = Math.floor(unitPrice * quantity);
      const itemName = this._getItemName({ invoice_unit: group.invoiceUnit }, job, customer.invoice_format);

      // P2-8: 同じ日付+現場の続き行は日付・現場名を空にする
      const currentDateSite = `${job.work_date}_${job.site_name || ''}`;
      const isFirstLineForDateSite = (currentDateSite !== prevDateSite);
      prevDateSite = currentDateSite;

      // 作業行を追加
      // P2-8: start_timeがDate型の場合は文字列に変換
      const timeNote = this._formatTimeValue(job.start_time);

      lines.push({
        work_date: isFirstLineForDateSite ? job.work_date : '',
        job_id: job.job_id,
        assignment_id: group.assignments[0].assignment_id, // 代表として最初の配置ID
        site_name: isFirstLineForDateSite ? (job.site_name || '') : '',
        item_name: itemName,
        time_note: timeNote,
        quantity: quantity,
        unit: '人',
        unit_price: unitPrice,
        amount: amount,
        // format2: 同じ日付+現場の続き行は営業所・発注番号も省略
        order_number: isFirstLineForDateSite ? (job.order_number || '') : '',
        branch_office: isFirstLineForDateSite ? (job.branch_office || '') : '',
        construction_div: job.construction_div || '',
        supervisor_name: job.supervisor_name || '',
        property_code: job.property_code || ''
      });

      // この案件の諸経費行を追加（まだ出力していない場合）
      if (!expenseAddedForJob[job.job_id]) {
        expenseAddedForJob[job.job_id] = true;

        // この案件の諸経費グループを全て出力
        const jobExpenseGroups = Object.values(expenseGroups).filter(eg => eg.job.job_id === job.job_id);
        for (const expGroup of jobExpenseGroups) {
          const expQuantity = expGroup.assignments.length;
          const expAmount = Math.floor(expGroup.unitPrice * expQuantity);

          lines.push({
            work_date: '',
            job_id: job.job_id,
            assignment_id: expGroup.assignments[0].assignment_id,
            site_name: '',
            item_name: '諸経費',
            time_note: expGroup.expenseNote,
            quantity: expQuantity,
            unit: '人',
            unit_price: expGroup.unitPrice,
            amount: expAmount,
            // 諸経費行は作業行の続きなので営業所・発注番号も省略
            order_number: '',
            branch_office: '',
            construction_div: job.construction_div || '',
            supervisor_name: job.supervisor_name || '',
            property_code: job.property_code || ''
          });
        }
      }
    }

    return lines;
  },

  /**
   * 品目名を生成
   * @param {Object} assignment - 配置データ
   * @param {Object} job - 案件データ
   * @param {string} format - 請求書フォーマット
   * @returns {string} 品目名
   */
  _getItemName: function(assignment, job, format) {
    const invoiceUnit = assignment.invoice_unit || job.pay_unit || 'basic';

    // 作業種別に基づく品目名マッピング
    const itemNameMap = {
      'tobi': '作業員（上棟鳶）',
      'age': '作業員（荷揚げ）',
      'tobiage': '作業員（上棟荷揚げ）',
      'basic': '作業員',
      'half': '作業員（ハーフ）',
      'halfday': '作業員（ハーフ）',
      'fullday': '作業員（終日）',
      'night': '作業員（夜勤）',
      'jotou': '作業員（上棟）',
      'shuujitsu': '作業員（終日）',
      'am': '作業員（AM）',
      'pm': '作業員（PM）',
      'yakin': '作業員（夜勤）'
    };

    return itemNameMap[invoiceUnit] || '作業員';
  },

  /**
   * 時間値を文字列に変換
   * @param {Date|string|number|null} value - 時間値
   * @returns {string} 時間文字列（HH:mm形式）または空文字
   */
  _formatTimeValue: function(value) {
    if (!value) return '';

    // 既に文字列の場合はそのまま返す
    if (typeof value === 'string') {
      return value;
    }

    // Date型の場合は時間部分を抽出
    if (value instanceof Date) {
      try {
        // 時間のみのDateオブジェクトは1899年12月30日になるため、
        // 年が1900未満の場合は時間として解釈
        const hours = value.getHours();
        const minutes = value.getMinutes();
        if (hours === 0 && minutes === 0) {
          return '';  // 00:00は空とみなす
        }
        return Utilities.formatDate(value, 'Asia/Tokyo', 'HH:mm');
      } catch (e) {
        return '';
      }
    }

    // 数値の場合は文字列に変換
    if (typeof value === 'number') {
      return String(value);
    }

    return '';
  },

  /**
   * 合計金額を計算
   * @param {Object[]} lines - 明細行
   * @param {number} taxRate - 税率
   * @param {number} expenseRate - 諸経費率
   * @param {string} format - 請求書フォーマット
   * @returns {Object} { subtotal, expenseAmount, taxAmount, totalAmount }
   */
  _calculateTotals: function(lines, taxRate, expenseRate, format) {
    // P2-8: 作業費と諸経費を分けて集計
    let workAmount = 0;    // 作業費（諸経費以外）
    let expenseAmount = 0; // 諸経費（交通費等）

    lines.forEach(line => {
      const amount = Number(line.amount) || 0;
      if (line.item_name === '諸経費') {
        expenseAmount += amount;
      } else {
        workAmount += amount;
      }
    });

    // 小計（税抜）= 作業費 + 諸経費
    const subtotal = workAmount + expenseAmount;

    // 従来の諸経費率による計算（頭紙形式かつ交通費がない場合のフォールバック）
    // ただし、交通費が明細にある場合はそちらを優先
    if (format === 'atamagami' && expenseRate > 0 && expenseAmount === 0) {
      expenseAmount = calculateExpense_(workAmount, expenseRate);
    }

    // 消費税
    const taxableAmount = subtotal;
    const taxAmount = calculateTaxAmount_(taxableAmount, taxRate);

    // 合計
    const totalAmount = Math.floor(taxableAmount + taxAmount);

    return {
      subtotal: Math.floor(workAmount),  // 頭紙用: 作業費のみ
      expenseAmount: Math.floor(expenseAmount),
      taxAmount: Math.floor(taxAmount),
      totalAmount: totalAmount
    };
  },

  /**
   * 発行日・支払期限を計算
   * @param {Object} customer - 顧客情報
   * @param {number} year - 請求年
   * @param {number} month - 請求月
   * @returns {Object} { issueDate, dueDate }
   */
  _calculateDates: function(customer, year, month) {
    const closingDay = customer.closing_day || 31; // デフォルト末日締め
    const paymentDay = customer.payment_day || 31;
    const paymentMonthOffset = customer.payment_month_offset || 1; // デフォルト翌月

    // 発行日（締め日の翌日を基準）
    let issueDate;
    if (closingDay >= 28) {
      // 末日締め → 翌月1日発行
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      issueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    } else {
      // 中間日締め → 締め日翌日発行
      const nextDay = closingDay + 1;
      issueDate = `${year}-${String(month).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
    }

    // 支払期限
    let dueYear = year;
    let dueMonth = month + paymentMonthOffset;
    if (dueMonth > 12) {
      dueYear += Math.floor(dueMonth / 12);
      dueMonth = dueMonth % 12 || 12;
    }

    let dueDay = paymentDay;
    const lastDayOfMonth = new Date(dueYear, dueMonth, 0).getDate();
    if (dueDay > lastDayOfMonth) {
      dueDay = lastDayOfMonth;
    }

    const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

    return { issueDate, dueDate };
  }
};
