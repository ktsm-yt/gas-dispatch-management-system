/**
 * CustomPrice Repository
 *
 * M_CustomPrices テーブルのCRUD処理
 * エンティティ（顧客/スタッフ/外注先）ごとのカスタム単価を管理する
 */

const CustomPriceRepository = {
  TABLE_NAME: 'M_CustomPrices' as const,
  ID_COLUMN: 'custom_price_id' as const,

  /**
   * エンティティの全カスタム単価を取得
   */
  findByEntity(entityType: string, entityId: string): CustomPriceRecord[] {
    return MasterCache.getCustomPrices().filter(
      cp => cp.entity_type === entityType && cp.entity_id === entityId
    );
  },

  /**
   * エンティティ + コードで1件取得
   */
  findByEntityAndCode(entityType: string, entityId: string, code: string): CustomPriceRecord | null {
    const key = `${entityType}|${entityId}|${code}`;
    const amount = MasterCache.getCustomPriceMap()[key];
    if (amount === undefined) return null;

    return MasterCache.getCustomPrices().find(
      cp => cp.entity_type === entityType && cp.entity_id === entityId && cp.price_type_code === code
    ) || null;
  },

  /**
   * upsert: 存在すれば更新、なければ挿入
   */
  upsert(
    entityType: string,
    entityId: string,
    code: string,
    amount: number
  ): { success: boolean; id?: string; skipped?: boolean; error?: string } {
    const now = new Date().toISOString();

    const allRecords = getAllRecords(this.TABLE_NAME);
    const existing = allRecords.find(
      (r: Record<string, any>) =>
        r.entity_type === entityType &&
        r.entity_id === entityId &&
        r.price_type_code === code
    );

    if (existing) {
      if (Number(existing.amount) === amount) {
        return { success: true, id: String(existing.custom_price_id), skipped: true };
      }
      updateRecord(this.TABLE_NAME, this.ID_COLUMN, String(existing.custom_price_id), {
        amount: amount,
        updated_at: now
      });
      MasterCache.invalidateCustomPrices();
      return { success: true, id: String(existing.custom_price_id) };
    }

    const id = Utilities.getUuid();
    insertRecord(this.TABLE_NAME, {
      custom_price_id: id,
      entity_type: entityType,
      entity_id: entityId,
      price_type_code: code,
      amount: amount,
      created_at: now,
      updated_at: now
    });
    MasterCache.invalidateCustomPrices();
    return { success: true, id };
  },

  /**
   * 1件削除（物理行削除）
   */
  deleteByEntity(entityType: string, entityId: string, code: string): { success: boolean; error?: string } {
    const sheet = getSheet(this.TABLE_NAME);
    if (!sheet) return { success: true };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const entityTypeCol = headers.indexOf('entity_type');
    const entityIdCol = headers.indexOf('entity_id');
    const codeCol = headers.indexOf('price_type_code');

    if (entityTypeCol < 0 || entityIdCol < 0 || codeCol < 0) {
      return { success: false, error: 'ヘッダーが見つかりません' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true };

    const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][entityTypeCol]) === entityType &&
          String(data[i][entityIdCol]) === entityId &&
          String(data[i][codeCol]) === code) {
        sheet.deleteRow(i + 2); // +2: ヘッダー行 + 0-indexed
        break;
      }
    }

    MasterCache.invalidateCustomPrices();
    return { success: true };
  }
};
