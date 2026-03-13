/**
 * PriceType Repository
 *
 * M_PriceTypes テーブルのCRUD処理
 * 単価種別マスター（システム8種 + カスタム種別）を管理する
 */

const PriceTypeRepository = {
  TABLE_NAME: 'M_PriceTypes' as const,
  ID_COLUMN: 'price_type_id' as const,

  /**
   * 全件取得（MasterCache経由）
   */
  findAll(): PriceTypeRecord[] {
    return MasterCache.getPriceTypes();
  },

  /**
   * アクティブな種別のみ取得
   */
  findActive(): PriceTypeRecord[] {
    return this.findAll().filter(pt => pt.is_active);
  },

  /**
   * codeで検索
   */
  findByCode(code: string): PriceTypeRecord | null {
    const map = MasterCache.getPriceTypeMap();
    return map[code] || null;
  },

  /**
   * 新規作成または更新（is_system=true は更新拒否）
   */
  save(record: Partial<PriceTypeRecord>): { success: boolean; id?: string; error?: string } {
    const now = new Date().toISOString();

    // is_system チェック
    if (record.price_type_id) {
      const existing = this._findByIdDirect(record.price_type_id);
      if (existing && existing.is_system) {
        return { success: false, error: 'システム定義の単価種別は編集できません' };
      }
    }

    // code 重複チェック
    if (record.code) {
      const byCode = this.findByCode(record.code);
      if (byCode && byCode.price_type_id !== record.price_type_id) {
        return { success: false, error: `コード「${record.code}」は既に使用されています` };
      }
    }

    // code フォーマットチェック（英数小文字 + アンダースコア）
    if (record.code && !/^[a-z][a-z0-9_]*$/.test(record.code)) {
      return { success: false, error: 'コードは英小文字で始まり、英小文字・数字・アンダースコアのみ使用できます' };
    }

    if (record.price_type_id) {
      // 更新
      const updateData = {
        ...record,
        updated_at: now
      };
      updateRecord(this.TABLE_NAME, this.ID_COLUMN, record.price_type_id, updateData);
      MasterCache.invalidatePriceTypes();
      return { success: true, id: record.price_type_id };
    } else {
      // 新規
      const id = Utilities.getUuid();
      const maxSort = this.findAll().reduce((max, pt) => Math.max(max, pt.sort_order || 0), 0);
      const newRecord = {
        price_type_id: id,
        code: record.code,
        label: record.label,
        sort_order: record.sort_order ?? (maxSort + 1),
        is_system: false,
        is_active: true,
        created_at: now,
        updated_at: now
      };
      insertRecord(this.TABLE_NAME, newRecord);
      MasterCache.invalidatePriceTypes();
      return { success: true, id };
    }
  },

  /**
   * 削除（非アクティブ化のみ。使用中チェックあり）
   */
  delete(id: string): { success: boolean; error?: string } {
    const existing = this._findByIdDirect(id);
    if (!existing) {
      return { success: false, error: '単価種別が見つかりません' };
    }
    if (existing.is_system) {
      return { success: false, error: 'システム定義の単価種別は削除できません' };
    }

    // 使用中チェック（T_Jobs, T_JobAssignments）
    const code = existing.code;
    const jobs = getAllRecords('T_Jobs').filter(
      (j: Record<string, any>) => !j.is_deleted && j.pay_unit === code
    );
    if (jobs.length > 0) {
      return { success: false, error: `この単価種別は ${jobs.length} 件の案件で使用中のため削除できません` };
    }

    const assignments = getAllRecords('T_JobAssignments').filter(
      (a: Record<string, any>) => !a.is_deleted && (a.pay_unit === code || a.invoice_unit === code)
    );
    if (assignments.length > 0) {
      return { success: false, error: `この単価種別は ${assignments.length} 件の配置で使用中のため削除できません` };
    }

    // 非アクティブ化
    updateRecord(this.TABLE_NAME, this.ID_COLUMN, id, {
      is_active: false,
      updated_at: new Date().toISOString()
    });
    MasterCache.invalidatePriceTypes();
    return { success: true };
  },

  /**
   * シートから直接1件取得（キャッシュ経由しない内部用）
   */
  _findByIdDirect(id: string): PriceTypeRecord | null {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, id);
    return record as PriceTypeRecord | null;
  }
};
