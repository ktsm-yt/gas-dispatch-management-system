/**
 * Invoice Service
 *
 * 請求管理の業務ロジック
 */

interface InvoiceGenerateOptions {
  allowDuplicate?: boolean;
  allowEmpty?: boolean;
}

interface InvoiceGenerateResult {
  success: boolean;
  error?: string;
  existingInvoice?: InvoiceRecord;
  invoice?: Record<string, unknown>;
  lines?: InvoiceLineRecord[] | Record<string, unknown>[];
  errors?: unknown;
}

interface InvoiceSaveResult {
  success: boolean;
  error?: string;
  invoice?: InvoiceRecord | null;
  lines?: InvoiceLineRecord[];
  errors?: unknown;
}

interface BulkGenerateOptions {
  overwrite?: boolean;
  offset?: number;
  limit?: number;
}

interface BulkGenerateResults {
  success: { customerId: string; companyName: string; invoiceId: string; invoiceNumber: string }[];
  skippedNoData: { customerId: string; companyName: string }[];
  skippedExisting: { customerId: string; companyName: string }[];
  failed: { customerId?: string; companyName?: string; error: string }[];
  progress: { processed: number; total: number; hasMore: boolean };
  lastCustomerName?: string;
}

interface InvoiceSearchResult extends InvoiceRecord {
  customer: Record<string, unknown> | null;
  has_assignment_changes: boolean;
  total_paid?: number;
  outstanding?: number;
}

interface InvoiceTotals {
  subtotal: number;
  expenseAmount: number;
  adjustmentTotal: number;
  taxAmount: number;
  totalAmount: number;
}

interface UpdateDetailsResult {
  success: boolean;
  error?: string;
  invoice?: InvoiceRecord | null;
  lines?: InvoiceLineRecord[];
  adjustments?: InvoiceAdjustmentRecord[];
  errors?: unknown;
  partialUpdate?: boolean;
}

interface RegenerateResult extends InvoiceGenerateResult {
  adjustmentsPreserved?: number;
  adjustmentsCopyFailed?: boolean;
}

const InvoiceService = {
  /**
   * 請求集計（generate）- 配置データから自動作成
   */
  generate: function(customerId: string, year: number, month: number, options: InvoiceGenerateOptions = {}): InvoiceGenerateResult {
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
      const closingDay = Number(customer.closing_day) || 31;
      const assignments = this._getAssignmentsForPeriod(customerId, year, month, closingDay);
      if (assignments.length === 0 && !options.allowEmpty) {
        return { success: false, error: 'NO_ASSIGNMENTS_FOUND' };
      }

      // 4. 明細行を生成
      const lines = this._generateLines(assignments, customer);

      // 5. 合計金額を計算
      const taxRate = Number(customer.tax_rate) || DEFAULT_TAX_RATE;
      const expenseRate = Number(customer.expense_rate) || 0;
      const taxRoundingMode = this._getTaxRoundingMode(customer);
      const totals = this._calculateTotals(lines, taxRate, expenseRate, customer.invoice_format as string, taxRoundingMode);

      // 6. 請求番号を生成
      const invoiceNumber = InvoiceRepository.generateInvoiceNumber(year, month, String(customer.customer_code || ''));

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
        shipper_name: (customer.shipper_name || customer.company_name || '') as string,
        status: 'unsent'
      });

      // 9. 明細行を作成（バリデーション付き）
      const lineResult = InvoiceLineRepository.bulkInsert(
        lines.map((line: Record<string, unknown>, index: number) => ({
          ...line,
          invoice_id: invoice.invoice_id,
          line_number: index + 1
        }))
      );

      if (!lineResult.success) {
        // 明細バリデーションエラー時は請求書も削除
        InvoiceRepository.softDelete(invoice.invoice_id as string, invoice.updated_at as string);
        return {
          success: false,
          error: 'LINE_VALIDATION_ERROR',
          errors: lineResult.errors
        };
      }

      const createdLines = lineResult.lines;

      // 監査ログを記録
      try {
        logCreate('T_Invoices', invoice.invoice_id as string, {
          invoice_number: invoice.invoice_number,
          customer_id: customerId,
          billing_year: year,
          billing_month: month,
          total_amount: totals.totalAmount,
          status: 'unsent'
        });
      } catch (logError: unknown) {
        const msg = logError instanceof Error ? logError.message : String(logError);
        console.warn('監査ログ記録エラー (generate):', msg);
      }

      return {
        success: true,
        invoice: {
          ...invoice,
          customer: {
            customer_id: customer.customer_id,
            company_name: customer.company_name,
            folder_id: customer.folder_id
          }
        },
        lines: createdLines
      };
    } catch (error: unknown) {
      logErr('InvoiceService.generate', error);
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || 'GENERATE_ERROR' };
    }
  },

  /**
   * 請求書を取得（明細付き）
   */
  get: function(invoiceId: string): { invoice_id: string; lines: InvoiceLineRecord[]; adjustments: InvoiceAdjustmentRecord[]; customer: Record<string, unknown> | null } & InvoiceRecord | null {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) return null;

    const lines = InvoiceLineRepository.findByInvoiceId(invoiceId);
    const customer = this._getCustomer(invoice.customer_id);

    const adjustments = InvoiceAdjustmentRepository.findByInvoiceId(invoiceId);

    return {
      ...invoice,
      lines: lines,
      adjustments: adjustments,
      customer: customer
    };
  },

  /**
   * 請求書一覧を検索
   */
  search: function(query: InvoiceSearchQuery & { includeChangeDetection?: boolean } = {}): InvoiceSearchResult[] {
    const invoices = InvoiceRepository.search(query);

    // 顧客情報を付加
    const customerCache: Record<string, Record<string, unknown> | null> = {};

    // has_assignment_changes カラムがDB側に存在するかチェック（最初の1件で判定）
    const hasColumnInDb = invoices.length > 0 && 'has_assignment_changes' in invoices[0];

    // カラム未存在時のみ旧ロジックにフォールバック
    const includeChangeDetection = !hasColumnInDb && query.includeChangeDetection !== false;
    let assignmentUpdates: Record<string, string> = {};
    if (includeChangeDetection && invoices.length > 0) {
      assignmentUpdates = this._getAssignmentUpdatesForInvoices(invoices);
    }

    return invoices.map((inv: InvoiceRecord) => {
      if (!customerCache[inv.customer_id]) {
        customerCache[inv.customer_id] = this._getCustomer(inv.customer_id);
      }

      // フラグ判定: DBカラム優先、無ければ旧ロジック
      let hasAssignmentChanges = false;
      if (hasColumnInDb) {
        hasAssignmentChanges = inv.has_assignment_changes === true || inv.has_assignment_changes === 'true';
      } else if (includeChangeDetection) {
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
   */
  save: function(invoice: Record<string, unknown>, lines: Record<string, unknown>[] | null, expectedUpdatedAt: string): InvoiceSaveResult {
    try {
      // アーカイブデータの明細変更はブロック
      if (invoice._archived && lines && lines.length > 0) {
        return { success: false, error: 'アーカイブデータの明細編集はできません。ヘッダー情報のみ編集可能です。' };
      }

      // 請求書を更新
      const invoiceResult = InvoiceRepository.update(invoice, expectedUpdatedAt);
      if (!invoiceResult.success) {
        return invoiceResult;
      }

      const invoiceId = String(invoice.invoice_id ?? '');

      // 明細を更新（差分適用）
      if (lines && lines.length > 0) {
        const existingLines = InvoiceLineRepository.findByInvoiceId(invoiceId);
        const existingIds = existingLines.map(l => l.line_id);

        const toAdd: Record<string, unknown>[] = [];
        const toUpdate: Record<string, unknown>[] = [];
        const toDelete: string[] = [];

        for (const line of lines) {
          if (line._deleted) {
            if (line.line_id && existingIds.includes(line.line_id as string)) {
              toDelete.push(line.line_id as string);
            }
          } else if (line.line_id && existingIds.includes(line.line_id as string)) {
            toUpdate.push(line);
          } else {
            toAdd.push({ ...line, invoice_id: invoiceId });
          }
        }

        // 削除されたIDを特定
        const updatedIds = lines.filter(l => !l._deleted && l.line_id).map(l => l.line_id as string);
        for (const existingId of existingIds) {
          if (!updatedIds.includes(existingId) && !toDelete.includes(existingId)) {
            toDelete.push(existingId);
          }
        }

        // 適用（バリデーション付き）
        if (toAdd.length > 0) {
          const addResult = InvoiceLineRepository.bulkInsert(toAdd);
          if (!addResult.success) {
            return {
              success: false,
              error: 'LINE_VALIDATION_ERROR',
              errors: addResult.errors
            };
          }
        }
        if (toUpdate.length > 0) {
          const updateResult = InvoiceLineRepository.bulkUpdate(toUpdate);
          if (!updateResult.success) {
            return {
              success: false,
              error: 'LINE_UPDATE_ERROR',
              errors: updateResult.errors
            };
          }
        }
        for (const lineId of toDelete) {
          InvoiceLineRepository.update({ line_id: lineId, is_deleted: true });
        }
      }

      // 合計を再計算
      const currentInvoice = InvoiceRepository.findById(invoiceId);
      const currentLines = InvoiceLineRepository.findByInvoiceId(invoiceId);
      const customer = this._getCustomer(currentInvoice!.customer_id);
      const taxRate = Number(customer?.tax_rate) || DEFAULT_TAX_RATE;
      const expenseRate = Number(customer?.expense_rate) || 0;
      const taxRoundingMode = this._getTaxRoundingMode(customer);
      const totals = this._calculateTotals(currentLines as unknown as Record<string, unknown>[], taxRate, expenseRate, currentInvoice!.invoice_format as string, taxRoundingMode);

      // 合計を更新
      InvoiceRepository.update({
        invoice_id: invoiceId,
        subtotal: totals.subtotal,
        expense_amount: totals.expenseAmount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount
      }, currentInvoice!.updated_at);

      return {
        success: true,
        invoice: InvoiceRepository.findById(invoiceId),
        lines: InvoiceLineRepository.findByInvoiceId(invoiceId)
      };
    } catch (error: unknown) {
      logErr('InvoiceService.save', error);
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || 'SAVE_ERROR' };
    }
  },

  /**
   * ステータスを更新
   */
  updateStatus: function(invoiceId: string, status: string, expectedUpdatedAt: string): { success: boolean; error?: string; invoice?: InvoiceRecord; before?: Record<string, unknown> } {
    const normalizeStatus = (s: unknown): string => String(s || '').trim().toLowerCase();
    const normalizedStatus = normalizeStatus(status);

    // ステータス遷移の検証
    const validStatuses = ['unsent', 'sent', 'unpaid', 'paid', 'hold'];
    if (!validStatuses.includes(normalizedStatus)) {
      return { success: false, error: 'INVALID_STATUS' };
    }

    const current = InvoiceRepository.findById(invoiceId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // ステータス遷移ルール
    const currentStatusNormalized = normalizeStatus(
      (current.status === 'draft' || current.status === 'issued') ? 'unsent' : current.status
    );
    const allowedTransitions: Record<string, string[]> = {
      unsent: ['sent', 'hold'],
      sent: ['paid', 'unpaid', 'unsent', 'hold'],
      unpaid: ['paid', 'sent', 'hold'],
      paid: ['sent', 'hold'],
      hold: ['unsent', 'sent', 'unpaid', 'paid']
    };
    if (currentStatusNormalized !== normalizedStatus && !allowedTransitions[currentStatusNormalized]?.includes(normalizedStatus)) {
      return { success: false, error: 'INVALID_STATUS_TRANSITION' };
    }

    const updateData: Record<string, unknown> = { invoice_id: invoiceId, status: normalizedStatus };
    if (current._archived) {
      updateData._archived = current._archived;
      updateData._archiveFiscalYear = current._archiveFiscalYear;
    }
    const result = InvoiceRepository.update(updateData, expectedUpdatedAt);

    // 監査ログを記録（更新成功時のみ）
    if (result.success) {
      try {
        logUpdate('T_Invoices', invoiceId,
          { status: current.status },
          { status: normalizedStatus }
        );
      } catch (logError: unknown) {
        const msg = logError instanceof Error ? logError.message : String(logError);
        console.warn('監査ログ記録エラー (updateStatus):', msg);
      }
    }

    return result;
  },

  /**
   * 請求書を削除
   */
  delete: function(invoiceId: string, expectedUpdatedAt: string): { success: boolean; error?: string } {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 送付済み以降は削除不可（未送付/保留/draft/issuedのみ削除可能）
    const deletableStatuses = ['unsent', 'hold', 'draft', 'issued'];
    if (!deletableStatuses.includes(invoice.status as string)) {
      return { success: false, error: 'CANNOT_DELETE_SENT_INVOICE' };
    }

    // 明細を削除
    InvoiceLineRepository.deleteByInvoiceId(invoiceId);

    // 調整項目を削除
    InvoiceAdjustmentRepository.softDeleteByInvoiceId(invoiceId);

    // 請求書を削除
    const result = InvoiceRepository.softDelete(invoiceId, expectedUpdatedAt);

    // 監査ログを記録（削除成功時のみ）
    if (result.success) {
      try {
        logDelete('T_Invoices', invoiceId, {
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          billing_year: invoice.billing_year,
          billing_month: invoice.billing_month,
          total_amount: invoice.total_amount,
          status: invoice.status
        });
      } catch (logError: unknown) {
        const msg = logError instanceof Error ? logError.message : String(logError);
        console.warn('監査ログ記録エラー (delete):', msg);
      }
    }

    return result;
  },

  /**
   * 請求一括集計（bulkGenerate）- 全アクティブ顧客・最適化版
   */
  bulkGenerate: function(year: number, month: number, options: BulkGenerateOptions = {}): BulkGenerateResults {
    const offset = options.offset || 0;
    const limit = options.limit || 10;

    const results: BulkGenerateResults = {
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

      // 交通費マスタを事前読み込み
      const transportAreaMap: Record<string, string> = {};
      try {
        const transportFeesResult = listTransportFees() as { ok: boolean; data?: { items: Record<string, unknown>[] } };
        if (transportFeesResult.ok && transportFeesResult.data?.items) {
          transportFeesResult.data.items.forEach((fee: Record<string, unknown>) => {
            transportAreaMap[fee.area_code as string] = fee.area_name as string;
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('交通費マスタの事前読み込みに失敗:', msg);
      }

      // インデックス構築
      const jobsByCustomer = this._groupBy(allJobs, 'customer_id');
      const assignmentsByJob = this._groupBy(allAssignments, 'job_id');

      // 既存請求書のインデックス
      const existingInvoiceIndex: Record<string, Record<string, unknown>> = {};
      for (const inv of allInvoices) {
        if (!inv.is_deleted) {
          const key = `${inv.customer_id}_${inv.billing_year}_${inv.billing_month}`;
          existingInvoiceIndex[key] = inv;
        }
      }

      // 請求番号は顧客コードベースで生成（連番不要）

      // === 上書きモード: 既存請求書を一括削除 ===
      if (options.overwrite) {
        const toDeleteInvoiceIds: string[] = [];
        for (const customer of customers) {
          const existingKey = `${customer.customer_id}_${year}_${month}`;
          const existing = existingInvoiceIndex[existingKey];
          if (existing) {
            toDeleteInvoiceIds.push(existing.invoice_id as string);
            delete existingInvoiceIndex[existingKey];
          }
        }

        if (toDeleteInvoiceIds.length > 0) {
          InvoiceLineRepository.bulkDeleteByInvoiceIds(toDeleteInvoiceIds);
          InvoiceRepository.bulkSoftDelete(toDeleteInvoiceIds);
          console.log(`BulkGenerate: 既存 ${toDeleteInvoiceIds.length} 件を一括削除`);
        }
      }

      // バッチ用の新規請求書・明細を集約
      const newInvoices: Record<string, unknown>[] = [];
      const newLines: Record<string, unknown>[] = [];
      const pendingSuccess: { customerId: string; companyName: string; invoiceId: string; invoiceNumber: string }[] = [];

      for (const customer of customers) {
        const customerId = customer.customer_id as string;
        const companyName = (customer.company_name || '') as string;

        try {
          // 既存チェック
          const existingKey = `${customerId}_${year}_${month}`;
          const existing = existingInvoiceIndex[existingKey];

          if (existing) {
            results.skippedExisting.push({ customerId, companyName });
            continue;
          }

          // 対象期間の配置データを取得（メモリ上で処理）
          const closingDay = Number(customer.closing_day) || 31;
          const assignments = this._getAssignmentsFromCache(
            customerId, year, month, closingDay,
            jobsByCustomer, assignmentsByJob
          );

          if (assignments.length === 0) {
            results.skippedNoData.push({ customerId, companyName });
            continue;
          }

          // 明細行を生成
          const lines = this._generateLines(assignments, customer, transportAreaMap);

          // 合計金額を計算
          const taxRate = Number(customer.tax_rate) || DEFAULT_TAX_RATE;
          const expenseRate = Number(customer.expense_rate) || 0;
          const taxRoundingMode = this._getTaxRoundingMode(customer);
          const totals = this._calculateTotals(lines, taxRate, expenseRate, customer.invoice_format as string, taxRoundingMode);

          // 請求番号を生成（顧客コードベース）
          const invoiceNumber = InvoiceRepository.generateInvoiceNumber(
            year, month, String(customer.customer_code || '')
          );

          // 発行日・支払期限を計算
          const dates = this._calculateDates(customer, year, month);

          // 請求書データを作成
          const invoiceId = generateId('inv');
          const user = getCurrentUserEmail();
          const now = getCurrentTimestamp();

          const invoiceData: Record<string, unknown> = {
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

          newInvoices.push(invoiceData);

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

          pendingSuccess.push({
            customerId,
            companyName,
            invoiceId: invoiceId,
            invoiceNumber: invoiceNumber
          });

        } catch (e: unknown) {
          logErr(`BulkGenerate error for customer ${customerId}`, e);
          const msg = e instanceof Error ? e.message : String(e);
          results.failed.push({ customerId, companyName, error: msg || 'UNKNOWN_ERROR' });
        }
      }

      // 最後に処理した顧客名を記録（進捗UI用）
      if (customers.length > 0) {
        results.lastCustomerName = (customers[customers.length - 1].company_name || '') as string;
      }

      // === 一括挿入 ===
      try {
        if (newInvoices.length > 0) {
          insertRecords('T_Invoices', newInvoices);
        }
        if (newLines.length > 0) {
          insertRecords('T_InvoiceLines', newLines);
        }
        // DB書込み成功後に成功結果を確定
        results.success.push(...pendingSuccess);
      } catch (insertError: unknown) {
        // DB書込み失敗時は全件を失敗に移す
        const insertMsg = insertError instanceof Error ? insertError.message : String(insertError);
        for (const pending of pendingSuccess) {
          results.failed.push({
            customerId: pending.customerId,
            companyName: pending.companyName,
            error: `DB書込みエラー: ${insertMsg}`
          });
        }
        throw insertError;
      }

    } catch (e: unknown) {
      logErr('BulkGenerate batch error', e);
      const msg = e instanceof Error ? e.message : String(e);
      for (const customer of customers) {
        const cid = customer.customer_id as string;
        if (!results.success.find(s => s.customerId === cid) &&
            !results.skippedExisting.find(s => s.customerId === cid) &&
            !results.skippedNoData.find(s => s.customerId === cid) &&
            !results.failed.find(f => f.customerId === cid)) {
          results.failed.push({
            customerId: cid,
            companyName: (customer.company_name || '') as string,
            error: msg || 'BATCH_ERROR'
          });
        }
      }
    }

    return results;
  },

  /**
   * 配列をキーでグループ化
   */
  _groupBy: function(array: Record<string, unknown>[], key: string): Record<string, Record<string, unknown>[]> {
    const result: Record<string, Record<string, unknown>[]> = {};
    for (const item of array) {
      const keyValue = item[key] as string;
      if (!result[keyValue]) {
        result[keyValue] = [];
      }
      result[keyValue].push(item);
    }
    return result;
  },


  /**
   * キャッシュから配置データを取得（メモリ上で処理）
   */
  _getAssignmentsFromCache: function(
    customerId: string, year: number, month: number, closingDay: number,
    jobsByCustomer: Record<string, Record<string, unknown>[]>,
    assignmentsByJob: Record<string, Record<string, unknown>[]>
  ): Record<string, unknown>[] {
    const period = calculateClosingPeriod_(year, month, closingDay || 31);
    const startDate = period.startDate || '';
    const endDate = period.endDate || '';

    const customerJobs = jobsByCustomer[customerId] || [];
    const result: Record<string, unknown>[] = [];

    for (const job of customerJobs) {
      if (job.is_deleted || job.status === 'cancelled' || job.status === 'hold') {
        continue;
      }

      // 日付を正規化
      let workDateStr: string;
      if (job.work_date instanceof Date) {
        workDateStr = Utilities.formatDate(job.work_date, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (typeof job.work_date === 'string') {
        workDateStr = job.work_date.replace(/\//g, '-');
      } else {
        workDateStr = '';
      }

      // 期間チェック
      if (!workDateStr || workDateStr < startDate || workDateStr > endDate) {
        continue;
      }

      // 案件の配置を取得
      const assignments = assignmentsByJob[job.job_id as string] || [];
      for (const assignment of assignments) {
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
      const jobA = a.job as Record<string, unknown>;
      const jobB = b.job as Record<string, unknown>;
      const dateA = (jobA.work_date || '') as string;
      const dateB = (jobB.work_date || '') as string;
      if (dateA !== dateB) {
        return dateA < dateB ? -1 : 1;
      }
      return ((jobA.site_name || '') as string).localeCompare((jobB.site_name || '') as string);
    });

    return result;
  },

  /**
   * 請求書を再集計（regenerate）- 既存の請求書を削除して新規作成
   */
  regenerate: function(invoiceId: string): RegenerateResult {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 送付済み請求書は再集計不可
    if (!isInvoiceEditable_(invoice.status as string)) {
      return { success: false, error: 'CANNOT_REGENERATE_SENT_INVOICE' };
    }

    // 調整項目を事前に取得
    const existingAdjustments = InvoiceAdjustmentRepository.findByInvoiceId(invoiceId);

    // 既存を削除
    const deleteResult = this.delete(invoiceId, invoice.updated_at);
    if (!deleteResult.success) {
      return { success: false, error: deleteResult.error || 'DELETE_FAILED' };
    }

    // 新規生成
    const result: RegenerateResult = this.generate(
      invoice.customer_id,
      invoice.billing_year,
      invoice.billing_month,
      { allowDuplicate: true }
    );

    // 調整項目を直接挿入
    if (result.success && existingAdjustments.length > 0) {
      try {
        const newInvoiceId = (result.invoice as Record<string, unknown>).invoice_id as string;
        const user = getCurrentUserEmail();
        const now = getCurrentTimestamp();
        const newRecords = existingAdjustments.map(adj => ({
          adjustment_id: generateId('adj'),
          invoice_id: newInvoiceId,
          item_name: adj.item_name,
          amount: adj.amount,
          sort_order: adj.sort_order,
          notes: adj.notes || '',
          created_at: now,
          created_by: user,
          updated_at: now,
          updated_by: user,
          is_deleted: false,
          deleted_at: '',
          deleted_by: ''
        }));
        insertRecords('T_InvoiceAdjustments', newRecords);
        result.adjustmentsPreserved = newRecords.length;

        // 合計を調整項目込みで再計算
        if (newRecords.length > 0) {
          const newAdjustments = InvoiceAdjustmentRepository.findByInvoiceId(newInvoiceId);
          const newLines = InvoiceLineRepository.findByInvoiceId(newInvoiceId);
          const customer = this._getCustomer(invoice.customer_id);
          const taxRate = Number(customer?.tax_rate) || 0.1;
          const expenseRate = Number(customer?.expense_rate) || 0;
          const taxRoundingMode = this._getTaxRoundingMode(customer);
          const totals = this._calculateTotals(newLines as unknown as Record<string, unknown>[], newAdjustments as unknown as Record<string, unknown>[], taxRate, expenseRate, invoice.invoice_format as string, taxRoundingMode);

          const currentInv = InvoiceRepository.findById(newInvoiceId);
          InvoiceRepository.update({
            invoice_id: newInvoiceId,
            subtotal: totals.subtotal,
            expense_amount: totals.expenseAmount,
            adjustment_total: totals.adjustmentTotal,
            tax_amount: totals.taxAmount,
            total_amount: totals.totalAmount
          }, currentInv!.updated_at);

          // 返却データを更新
          result.invoice = InvoiceRepository.findById(newInvoiceId) as unknown as Record<string, unknown>;
        }
      } catch (copyError: unknown) {
        const msg = copyError instanceof Error ? copyError.message : String(copyError);
        console.warn('調整項目コピーエラー:', msg);
        result.adjustmentsCopyFailed = true;
      }
    }

    return result;
  },

  // ============================================
  // Private Methods
  // ============================================

  _getCustomer: function(customerId: string): Record<string, unknown> | null {
    return getRecordById('M_Customers', 'customer_id', customerId);
  },

  _getTaxRoundingMode: function(customer: Record<string, unknown> | null): string {
    return normalizeRoundingMode_(customer?.tax_rounding_mode);
  },

  /**
   * 請求書に関連する配置の最新更新日時を取得
   */
  _getAssignmentUpdatesForInvoices: function(invoices: InvoiceRecord[]): Record<string, string> {
    if (!invoices || invoices.length === 0) {
      return {};
    }

    const invoiceIds = invoices.map(inv => inv.invoice_id);

    const allLines = getAllRecords('T_InvoiceLines');
    const relevantLines = allLines.filter(line =>
      !line.is_deleted && invoiceIds.includes(line.invoice_id as string)
    );

    const assignmentIds = new Set<string>();
    const linesByInvoice: Record<string, string[]> = {};
    for (const line of relevantLines) {
      if (line.assignment_id) {
        assignmentIds.add(line.assignment_id as string);
        if (!linesByInvoice[line.invoice_id as string]) {
          linesByInvoice[line.invoice_id as string] = [];
        }
        linesByInvoice[line.invoice_id as string].push(line.assignment_id as string);
      }
    }

    if (assignmentIds.size === 0) {
      return {};
    }

    const allAssignments = getAllRecords('T_JobAssignments');
    const assignmentMap: Record<string, string> = {};
    for (const asg of allAssignments) {
      if (!asg.is_deleted && assignmentIds.has(asg.assignment_id as string)) {
        assignmentMap[asg.assignment_id as string] = asg.updated_at as string;
      }
    }

    const result: Record<string, string> = {};
    for (const invoiceId of Object.keys(linesByInvoice)) {
      const asgIds = linesByInvoice[invoiceId];
      let latestUpdate: string | null = null;
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
   */
  _getAssignmentsForPeriod: function(customerId: string, year: number, month: number, closingDay: number): Record<string, unknown>[] {
    const period = calculateClosingPeriod_(year, month, closingDay || 31);

    const jobs = JobRepository.search({
      customer_id: customerId,
      work_date_from: period.startDate ?? undefined,
      work_date_to: period.endDate ?? undefined
    });

    if (jobs.length === 0) {
      return [];
    }

    const result: Record<string, unknown>[] = [];
    for (const job of jobs) {
      if (job.status === 'cancelled' || job.status === 'hold') {
        continue;
      }

      const assignments = AssignmentRepository.findByJobId(job.job_id as string);
      for (const assignment of assignments) {
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
      const jobA = a.job as Record<string, unknown>;
      const jobB = b.job as Record<string, unknown>;
      const dateA = (jobA.work_date || '') as string;
      const dateB = (jobB.work_date || '') as string;
      if (dateA !== dateB) {
        return dateA < dateB ? -1 : 1;
      }
      return ((jobA.site_name || '') as string).localeCompare((jobB.site_name || '') as string);
    });

    return result;
  },

  /**
   * 明細行を生成
   */
  _generateLines: function(assignments: Record<string, unknown>[], customer: Record<string, unknown>, preloadedTransportAreaMap?: Record<string, string>): Record<string, unknown>[] {
    const lines: Record<string, unknown>[] = [];

    const hasTransportFee = customer.has_transport_fee === true || customer.has_transport_fee === 'true';

    const transportAreaMap: Record<string, string> = preloadedTransportAreaMap || {};
    if (hasTransportFee && !preloadedTransportAreaMap) {
      try {
        const transportFees = listTransportFees() as Record<string, unknown>[];
        transportFees.forEach((fee: Record<string, unknown>) => {
          transportAreaMap[fee.area_code as string] = fee.area_name as string;
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('交通費マスタの取得に失敗:', msg);
      }
    }

    // Step 1: 配置を job_id + invoice_unit + unit_price でグループ化
    const workGroups: Record<string, { assignments: Record<string, unknown>[]; job: Record<string, unknown>; invoiceUnit: string; unitPrice: number }> = {};
    const expenseGroups: Record<string, { assignments: Record<string, unknown>[]; job: Record<string, unknown>; expenseNote: string; unitPrice: number }> = {};

    for (const asg of assignments) {
      const job = asg.job as Record<string, unknown>;
      const invoiceUnit = resolveEffectiveUnit_(asg.invoice_unit as string, job);

      let unitPrice = asg.invoice_rate as number | undefined;
      if (!unitPrice && unitPrice !== 0) {
        unitPrice = getUnitPriceByJobType_(customer, invoiceUnit);
      }
      unitPrice = unitPrice ?? 0;

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

      const transportAmount = Number(asg.transport_amount) || 0;
      if (hasTransportFee && transportAmount > 0) {
        let expenseNote = '';
        if (asg.transport_station) {
          expenseNote = asg.transport_station as string;
          if (asg.transport_has_bus === true || asg.transport_has_bus === 'true') {
            expenseNote += '（バス）';
          }
        } else if (asg.transport_area && transportAreaMap[asg.transport_area as string]) {
          expenseNote = transportAreaMap[asg.transport_area as string];
        }

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
      const dateA = (a.job.work_date || '') as string;
      const dateB = (b.job.work_date || '') as string;
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      const siteCompare = ((a.job.site_name || '') as string).localeCompare((b.job.site_name || '') as string);
      if (siteCompare !== 0) return siteCompare;
      return (a.invoiceUnit || '').localeCompare(b.invoiceUnit || '');
    });

    let prevDateSite: string | null = null;
    const expenseAddedForJob: Record<string, boolean> = {};

    // 人工割（CR-029）: jobごとの単価グループ数をカウント（複数単価混在判定用）
    const unitGroupCountByJob: Record<string, number> = {};
    for (const key of Object.keys(workGroups)) {
      const jobId = workGroups[key].job.job_id as string;
      unitGroupCountByJob[jobId] = (unitGroupCountByJob[jobId] || 0) + 1;
    }

    for (const group of workGroupsSorted) {
      const job = group.job;
      let quantity = group.assignments.length;

      // 人工割（CR-029）: required_count が設定されている場合、請求数量を調整
      // - 過剰配置(actual > required): required_count でキャップ
      // - 不足配置(actual < required): required_count で請求（必要人数分請求）
      // - 複数単価グループ混在時: 按分してキャップ
      const requiredCount = Number(job.required_count) || 0;
      const jobId = job.job_id as string;
      const unitGroupCount = unitGroupCountByJob[jobId] || 1;
      if (requiredCount > 0 && requiredCount !== quantity) {
        if (unitGroupCount <= 1) {
          // 単一単価グループ: そのまま required_count を使用
          quantity = requiredCount;
        } else {
          // 複数単価グループ: required_count を按分
          // このグループの実人数が全体に占める割合で按分
          const totalActual = Object.values(workGroups)
            .filter(g => (g.job.job_id as string) === jobId)
            .reduce((sum, g) => sum + g.assignments.length, 0);
          if (totalActual > 0) {
            quantity = Math.floor(requiredCount * group.assignments.length / totalActual);
            if (quantity < 1) quantity = 1; // 最低1人
          }
        }
      }

      const unitPrice = group.unitPrice;
      const amount = Math.floor(unitPrice * quantity);
      const itemName = this._getItemName({ invoice_unit: group.invoiceUnit }, job, customer.invoice_format as string);

      const currentDateSite = `${job.work_date}_${job.site_name || ''}`;
      const isFirstLineForDateSite = (currentDateSite !== prevDateSite);
      prevDateSite = currentDateSite;

      const timeNote = this._formatTimeValue(job.start_time);

      lines.push({
        work_date: job.work_date || '',
        job_id: job.job_id,
        assignment_id: (group.assignments[0] as Record<string, unknown>).assignment_id,
        site_name: job.site_name || '',
        item_name: itemName,
        time_note: timeNote,
        quantity: quantity,
        unit: '人',
        unit_price: unitPrice,
        amount: amount,
        order_number: isFirstLineForDateSite ? (job.order_number || '') : '',
        branch_office: isFirstLineForDateSite ? (job.branch_office || '') : '',
        construction_div: job.construction_div || '',
        supervisor_name: job.supervisor_name || '',
        property_code: job.property_code || ''
      });

      if (!expenseAddedForJob[job.job_id as string]) {
        expenseAddedForJob[job.job_id as string] = true;

        const jobExpenseGroups = Object.values(expenseGroups).filter(eg => eg.job.job_id === job.job_id);
        for (const expGroup of jobExpenseGroups) {
          // 人工割（CR-029）: 過剰配置時は交通費もrequired_count人分までキャップ
          // 不足配置時は実人数分（実際に来た人の交通費のみ）
          let expQuantity = expGroup.assignments.length;
          const expRequiredCount = Number(job.required_count) || 0;
          if (expRequiredCount > 0 && expQuantity > expRequiredCount) {
            expQuantity = expRequiredCount;
          }
          const expAmount = Math.floor(expGroup.unitPrice * expQuantity);

          lines.push({
            work_date: '',
            job_id: job.job_id,
            assignment_id: (expGroup.assignments[0] as Record<string, unknown>).assignment_id,
            site_name: '',
            item_name: '諸経費',
            time_note: expGroup.expenseNote,
            quantity: expQuantity,
            unit: '人',
            unit_price: expGroup.unitPrice,
            amount: expAmount,
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
   */
  _getItemName: function(_assignment: Record<string, unknown>, job: Record<string, unknown>, _format: string): string {
    const invoiceUnit = resolveEffectiveUnit_(_assignment.invoice_unit as string, job);

    const itemNameMap: Record<string, string> = {
      'tobi': '作業員（上棟鳶）',
      'age': '作業員（上棟荷揚げ）',
      'tobiage': '作業員（上棟鳶揚げ）',
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
   */
  _formatTimeValue: function(value: unknown): string {
    if (!value) return '';

    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      try {
        const hours = value.getHours();
        const minutes = value.getMinutes();
        if (hours === 0 && minutes === 0) {
          return '';
        }
        return Utilities.formatDate(value, 'Asia/Tokyo', 'HH:mm');
      } catch (_e: unknown) {
        return '';
      }
    }

    if (typeof value === 'number') {
      const totalMinutes = Math.round(value * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    }

    return '';
  },

  /**
   * 合計金額を計算（後方互換のオーバーロード対応）
   */
  _calculateTotals: function(
    lines: Record<string, unknown>[],
    adjustmentsOrTaxRate: Record<string, unknown>[] | number,
    taxRateOrExpenseRate: number,
    expenseRateOrFormat: number | string,
    formatOrRoundingArg?: string,
    roundingModeArg?: string
  ): InvoiceTotals {
    let adjustments: Record<string, unknown>[];
    let taxRate: number;
    let expenseRate: number;
    let format: string;
    let taxRoundingMode: string | undefined;

    if (Array.isArray(adjustmentsOrTaxRate)) {
      adjustments = adjustmentsOrTaxRate;
      taxRate = taxRateOrExpenseRate;
      expenseRate = expenseRateOrFormat as number;
      format = formatOrRoundingArg || '';
      taxRoundingMode = roundingModeArg;
    } else {
      adjustments = [];
      taxRate = adjustmentsOrTaxRate;
      expenseRate = taxRateOrExpenseRate;
      format = expenseRateOrFormat as string;
      taxRoundingMode = formatOrRoundingArg;
    }
    const normalizedRoundingMode = normalizeRoundingMode_(taxRoundingMode);

    let workAmount = 0;
    let expenseAmount = 0;

    lines.forEach((line: Record<string, unknown>) => {
      const amount = Number(line.amount) || 0;
      if (line.item_name === '諸経費') {
        expenseAmount += amount;
      } else {
        workAmount += amount;
      }
    });

    let adjustmentTotal = 0;
    if (adjustments && adjustments.length > 0) {
      adjustments.forEach((adj: Record<string, unknown>) => {
        adjustmentTotal += Number(adj.amount) || 0;
      });
    }

    if (format === 'atamagami' && expenseRate > 0 && expenseAmount === 0) {
      expenseAmount = calculateExpense_(workAmount, expenseRate);
    }

    const taxableAmount = workAmount + expenseAmount + adjustmentTotal;
    const taxAmount = calculateTaxAmount_(taxableAmount, taxRate, normalizedRoundingMode);
    const totalAmount = Math.floor(taxableAmount + taxAmount);

    return {
      subtotal: Math.floor(workAmount),
      expenseAmount: Math.floor(expenseAmount),
      adjustmentTotal: Math.floor(adjustmentTotal),
      taxAmount: Math.floor(taxAmount),
      totalAmount: totalAmount
    };
  },

  /**
   * 発行日・支払期限を計算
   */
  _calculateDates: function(customer: Record<string, unknown>, year: number, month: number): { issueDate: string; dueDate: string } {
    const closingDay = Number(customer.closing_day) || 31;
    const paymentDay = Number(customer.payment_day) || 31;
    const paymentMonthOffset = Number(customer.payment_month_offset) || 1;

    // 発行日（締め日当日）
    // 末日締め: その月の最終日（3月→3/31, 4月→4/30）
    // 20日締め: その月の20日
    let issueDate: string | undefined;
    if (closingDay === 31) {
      const lastDay = new Date(year, month, 0).getDate();
      issueDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      issueDate = `${year}-${String(month).padStart(2, '0')}-${String(closingDay).padStart(2, '0')}`;
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

    return { issueDate: issueDate ?? '', dueDate };
  },

  /**
   * 請求書の詳細を更新（テキスト項目のみ）
   */
  updateDetails: function(
    invoiceId: string,
    headerData: Record<string, unknown> | null,
    linesData: Record<string, unknown>[] | null,
    adjustmentsData: Record<string, unknown>[] | undefined,
    expectedUpdatedAt: string
  ): UpdateDetailsResult {
    try {
      // 1. 請求書を取得
      const invoice = InvoiceRepository.findById(invoiceId);
      if (!invoice) {
        return { success: false, error: 'NOT_FOUND' };
      }

      // 2. 編集可能なステータスかチェック（アーカイブデータはヘッダー編集のみ許可）
      if (invoice._archived) {
        // アーカイブデータは明細変更をブロック、ヘッダーのみ許可
        if (linesData && linesData.length > 0) {
          return { success: false, error: 'アーカイブデータの明細編集はできません。ヘッダー情報のみ編集可能です。' };
        }
      } else if (!isInvoiceEditable_(invoice.status as string)) {
        return { success: false, error: 'CANNOT_EDIT_SENT_INVOICE' };
      }

      // 4. 楽観的ロックチェック
      if (expectedUpdatedAt && invoice.updated_at !== expectedUpdatedAt) {
        return { success: false, error: 'CONFLICT_ERROR' };
      }

      // 5. ヘッダー情報を更新
      const allowedHeaderFields = ['issue_date', 'due_date', 'notes'];
      const headerUpdate: Record<string, unknown> = { invoice_id: invoiceId };
      if (invoice._archived) {
        headerUpdate._archived = invoice._archived;
        headerUpdate._archiveFiscalYear = invoice._archiveFiscalYear;
      }
      for (const field of allowedHeaderFields) {
        if (headerData && headerData[field] !== undefined) {
          headerUpdate[field] = headerData[field];
        }
      }

      const headerResult = InvoiceRepository.update(headerUpdate, expectedUpdatedAt);
      if (!headerResult.success) {
        return headerResult;
      }

      // 5. 明細を更新
      if (linesData && Array.isArray(linesData) && linesData.length > 0) {
        const allowedLineFields = ['item_name', 'time_note', 'site_name'];

        const lineUpdates: Record<string, unknown>[] = [];
        for (const lineData of linesData) {
          if (!lineData.line_id) continue;

          const lineUpdate: Record<string, unknown> = { line_id: lineData.line_id };
          for (const field of allowedLineFields) {
            if (lineData[field] !== undefined) {
              lineUpdate[field] = lineData[field];
            }
          }

          if (Object.keys(lineUpdate).length > 1) {
            lineUpdates.push(lineUpdate);
          }
        }

        if (lineUpdates.length > 0) {
          const lineResult = InvoiceLineRepository.bulkUpdate(lineUpdates);
          if (!lineResult.success) {
            logErr('updateDetails: 明細更新失敗', lineResult.errors);
            return {
              success: false,
              error: 'LINE_UPDATE_ERROR',
              errors: lineResult.errors,
              partialUpdate: true
            };
          }
        }
      }

      // 6. 調整項目を更新
      let updatedAdjustments: InvoiceAdjustmentRecord[] = [];
      if (adjustmentsData !== undefined && Array.isArray(adjustmentsData)) {
        if (adjustmentsData.length > 5) {
          return { success: false, error: 'ADJUSTMENT_LIMIT_EXCEEDED', partialUpdate: true };
        }

        const currentLines = InvoiceLineRepository.findByInvoiceId(invoiceId);
        const customer = this._getCustomer(invoice.customer_id);
        const taxRate = Number(customer?.tax_rate) || 0.1;
        const expenseRate = Number(customer?.expense_rate) || 0;
        const taxRoundingMode = this._getTaxRoundingMode(customer);
        const totals = this._calculateTotals(currentLines as unknown as Record<string, unknown>[], adjustmentsData as Record<string, unknown>[], taxRate, expenseRate, invoice.invoice_format as string, taxRoundingMode);

        if (totals.totalAmount < 0) {
          return { success: false, error: 'NEGATIVE_TOTAL', partialUpdate: true };
        }

        const adjResult = InvoiceAdjustmentRepository.bulkUpsert(invoiceId, adjustmentsData as { item_name: string; amount: number; adjustment_id?: string; sort_order?: number; notes?: string }[]);
        if (!adjResult.success) {
          return { success: false, error: 'ADJUSTMENT_UPDATE_ERROR', partialUpdate: true };
        }
        updatedAdjustments = adjResult.adjustments || [];

        const latestInvoice = InvoiceRepository.findById(invoiceId);
        InvoiceRepository.update({
          invoice_id: invoiceId,
          subtotal: totals.subtotal,
          expense_amount: totals.expenseAmount,
          adjustment_total: totals.adjustmentTotal,
          tax_amount: totals.taxAmount,
          total_amount: totals.totalAmount
        }, latestInvoice!.updated_at);
      } else {
        updatedAdjustments = InvoiceAdjustmentRepository.findByInvoiceId(invoiceId);
      }

      // 7. 監査ログを記録
      try {
        logUpdate('T_Invoices', invoiceId,
          { issue_date: invoice.issue_date, due_date: invoice.due_date, notes: invoice.notes },
          headerUpdate
        );
      } catch (logError: unknown) {
        const msg = logError instanceof Error ? logError.message : String(logError);
        console.warn('監査ログ記録エラー (updateDetails):', msg);
      }

      // 8. 更新後のデータを返す
      const updatedInvoice = InvoiceRepository.findById(invoiceId);
      const updatedLines = InvoiceLineRepository.findByInvoiceId(invoiceId);

      return {
        success: true,
        invoice: updatedInvoice,
        lines: updatedLines,
        adjustments: updatedAdjustments
      };
    } catch (error: unknown) {
      logErr('InvoiceService.updateDetails', error);
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg || 'UPDATE_DETAILS_ERROR' };
    }
  }
};
