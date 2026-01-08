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

      // 3. 対象期間の配置データを取得
      const assignments = this._getAssignmentsForPeriod(customerId, year, month);
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
        status: 'draft'
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
   * @returns {Object[]} 請求書配列
   */
  search: function(query = {}) {
    const invoices = InvoiceRepository.search(query);

    // 顧客情報を付加
    const customerCache = {};
    return invoices.map(inv => {
      if (!customerCache[inv.customer_id]) {
        customerCache[inv.customer_id] = this._getCustomer(inv.customer_id);
      }
      return {
        ...inv,
        customer: customerCache[inv.customer_id]
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
    // ステータス遷移の検証
    const validStatuses = ['draft', 'issued', 'sent', 'paid'];
    if (!validStatuses.includes(status)) {
      return { success: false, error: 'INVALID_STATUS' };
    }

    const current = InvoiceRepository.findById(invoiceId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // ステータス遷移ルール（逆戻りは基本的に不可、ただしdraftへの戻しは許可）
    const statusOrder = { draft: 0, issued: 1, sent: 2, paid: 3 };
    if (status !== 'draft' && statusOrder[status] < statusOrder[current.status]) {
      return { success: false, error: 'INVALID_STATUS_TRANSITION' };
    }

    return InvoiceRepository.update(
      { invoice_id: invoiceId, status: status },
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

    // 発行済み以降は削除不可
    if (invoice.status !== 'draft') {
      return { success: false, error: 'CANNOT_DELETE_ISSUED_INVOICE' };
    }

    // 明細を削除
    InvoiceLineRepository.deleteByInvoiceId(invoiceId);

    // 請求書を削除
    return InvoiceRepository.softDelete(invoiceId, expectedUpdatedAt);
  },

  /**
   * 請求書を一括生成（全アクティブ顧客）
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

    for (const customer of customers) {
      const customerId = customer.customer_id;
      const companyName = customer.company_name || '';

      try {
        // 既存チェック
        const existing = InvoiceRepository.findByCustomerAndPeriod(customerId, year, month);
        if (existing) {
          if (options.overwrite) {
            // 上書きモード: 既存を削除
            const deleteResult = this.delete(existing.invoice_id, existing.updated_at);
            if (!deleteResult.success) {
              results.failed.push({ customerId, companyName, error: `削除失敗: ${deleteResult.error}` });
              continue;
            }
          } else {
            results.skippedExisting.push({ customerId, companyName });
            continue;
          }
        }

        // 請求書を生成（allowEmpty=false で配置データなしはエラー）
        const generateResult = this.generate(customerId, year, month, { allowEmpty: false, allowDuplicate: true });

        if (generateResult.success) {
          results.success.push({
            customerId,
            companyName,
            invoiceId: generateResult.invoice.invoice_id,
            invoiceNumber: generateResult.invoice.invoice_number
          });
        } else if (generateResult.error === 'NO_ASSIGNMENTS_FOUND') {
          results.skippedNoData.push({ customerId, companyName });
        } else {
          results.failed.push({ customerId, companyName, error: generateResult.error });
        }
      } catch (e) {
        console.error(`BulkGenerate error for customer ${customerId}:`, e);
        results.failed.push({ customerId, companyName, error: e.message || 'UNKNOWN_ERROR' });
      }
    }

    return results;
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
   * 対象期間の配置データを取得
   * @param {string} customerId - 顧客ID
   * @param {number} year - 年
   * @param {number} month - 月
   * @returns {Object[]} 配置データ（案件情報付き）
   */
  _getAssignmentsForPeriod: function(customerId, year, month) {
    // 対象期間の開始日・終了日
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

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

    for (const asg of assignments) {
      const job = asg.job;

      // 請求単価を決定
      let unitPrice = asg.invoice_rate;
      if (!unitPrice && unitPrice !== 0) {
        // 顧客マスターから取得
        unitPrice = getUnitPriceByJobType_(customer, asg.invoice_unit || job.pay_unit || 'basic');
      }

      // 品目名を決定
      const itemName = this._getItemName(asg, job, customer.invoice_format);

      // 金額を計算
      const quantity = 1; // 人数は1（複数人の場合は別行）
      const amount = Math.floor((unitPrice || 0) * quantity);

      lines.push({
        work_date: job.work_date,
        job_id: job.job_id,
        assignment_id: asg.assignment_id,
        site_name: job.site_name || '',
        item_name: itemName,
        time_note: job.start_time || '',
        quantity: quantity,
        unit: '人',
        unit_price: unitPrice || 0,
        amount: amount,
        order_number: job.order_number || '',
        branch_office: job.branch_office || '',
        construction_div: job.construction_div || '',
        supervisor_name: job.supervisor_name || '',
        property_code: job.property_code || ''
      });
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
   * 合計金額を計算
   * @param {Object[]} lines - 明細行
   * @param {number} taxRate - 税率
   * @param {number} expenseRate - 諸経費率
   * @param {string} format - 請求書フォーマット
   * @returns {Object} { subtotal, expenseAmount, taxAmount, totalAmount }
   */
  _calculateTotals: function(lines, taxRate, expenseRate, format) {
    // 小計（税抜）
    const subtotal = lines.reduce((sum, line) => {
      return sum + (Number(line.amount) || 0);
    }, 0);

    // 頭紙の場合は諸経費を加算
    let expenseAmount = 0;
    if (format === 'atamagami' && expenseRate > 0) {
      expenseAmount = calculateExpense_(subtotal, expenseRate);
    }

    // 消費税
    const taxableAmount = subtotal + expenseAmount;
    const taxAmount = calculateTaxAmount_(taxableAmount, taxRate);

    // 合計
    const totalAmount = Math.floor(taxableAmount + taxAmount);

    return {
      subtotal: Math.floor(subtotal),
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
