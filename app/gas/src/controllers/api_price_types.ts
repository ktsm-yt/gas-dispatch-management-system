/**
 * PriceType API Controller
 *
 * 単価種別マスター管理のAPI（google.script.run対象）
 */

/**
 * 単価種別一覧を取得
 */
function listPriceTypes() {
  const requestId = Utilities.getUuid();
  try {
    const priceTypes = PriceTypeRepository.findAll();
    return buildSuccessResponse(priceTypes, requestId);
  } catch (e) {
    logErr('listPriceTypes', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 単価種別を保存（新規/更新）
 */
function savePriceType(
  data: { price_type_id?: string; code: string; label: string; sort_order?: number },
  expectedUpdatedAt?: string
) {
  const requestId = Utilities.getUuid();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // code/label 必須チェック
    if (!data.code || !data.label) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'コードと表示名は必須です', {}, requestId);
    }

    // 楽観ロック（更新時）
    if (data.price_type_id && expectedUpdatedAt) {
      const existing = PriceTypeRepository._findByIdDirect(data.price_type_id);
      if (existing && existing.updated_at && String(existing.updated_at) !== String(expectedUpdatedAt)) {
        return buildErrorResponse(ERROR_CODES.CONFLICT_ERROR, '他のユーザーによる変更が検出されました。画面を再読み込みしてください。', {}, requestId);
      }
    }

    const result = PriceTypeRepository.save(data);
    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error || '', {}, requestId);
    }

    return buildSuccessResponse({ id: result.id }, requestId);
  } catch (e) {
    logErr('savePriceType', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 単価種別を削除（非アクティブ化）
 */
function deletePriceType(id: string) {
  const requestId = Utilities.getUuid();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!id) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'IDは必須です', {}, requestId);
    }

    const result = PriceTypeRepository.delete(id);
    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error || '', {}, requestId);
    }

    return buildSuccessResponse({ deleted: true }, requestId);
  } catch (e) {
    logErr('deletePriceType', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * カスタム単価一覧を取得
 */
function listCustomPrices(entityType: string, entityId: string) {
  const requestId = Utilities.getUuid();
  try {
    const prices = CustomPriceRepository.findByEntity(entityType, entityId);
    return buildSuccessResponse(prices, requestId);
  } catch (e) {
    logErr('listCustomPrices', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * カスタム単価をupsert
 */
function upsertCustomPrice(entityType: string, entityId: string, code: string, amount: number) {
  const requestId = Utilities.getUuid();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const ALLOWED_ENTITY_TYPES = ['customer', 'staff', 'subcontractor'];
    const normalizedAmount = Number(amount);

    if (!entityType || !entityId || !code) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'パラメータが不足しています', {}, requestId);
    }
    if (ALLOWED_ENTITY_TYPES.indexOf(entityType) === -1) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'entityTypeが不正です', {}, requestId);
    }
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'amountは0以上の数値で指定してください', {}, requestId);
    }

    const result = CustomPriceRepository.upsert(entityType, entityId, code, normalizedAmount);
    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error || '', {}, requestId);
    }

    return buildSuccessResponse({ id: result.id, skipped: result.skipped }, requestId);
  } catch (e) {
    logErr('upsertCustomPrice', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * カスタム単価を削除
 */
function deleteCustomPrice(entityType: string, entityId: string, code: string) {
  const requestId = Utilities.getUuid();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const result = CustomPriceRepository.deleteByEntity(entityType, entityId, code);
    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error || '', {}, requestId);
    }

    return buildSuccessResponse({ deleted: true }, requestId);
  } catch (e) {
    logErr('deleteCustomPrice', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 単価種別ラベルマップを取得（全UI共通で使用）
 * @returns { code: { label, sort_order, is_system, is_active } }
 */
function getPriceTypeLabelMap() {
  const requestId = Utilities.getUuid();
  try {
    const priceTypes = MasterCache.getPriceTypes();
    const labelMap: Record<string, { label: string; sort_order: number; is_system: boolean; is_active: boolean }> = {};
    for (const pt of priceTypes) {
      if (pt.is_active) {
        labelMap[pt.code] = {
          label: pt.label,
          sort_order: pt.sort_order,
          is_system: !!pt.is_system,
          is_active: !!pt.is_active
        };
      }
    }
    return buildSuccessResponse(labelMap, requestId);
  } catch (e) {
    logErr('getPriceTypeLabelMap', e as Error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}
