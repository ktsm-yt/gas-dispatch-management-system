/**
 * Utility Functions
 *
 * 共通ユーティリティ関数
 */

/**
 * プレフィックス付きUUIDを生成
 * @param {string} prefix - プレフィックス（job, asg, cus, stf等）
 * @returns {string} プレフィックス付きUUID（例: job_abc123...）
 */
function generateId(prefix) {
  const uuid = Utilities.getUuid();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * ISO8601形式の現在時刻を取得
 * @returns {string} ISO8601形式の日時文字列
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * サーバーの現在日付を取得（Asia/Tokyo）
 * @returns {string} YYYY-MM-DD形式の日付文字列
 */
function getServerDate() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * リクエストIDを生成
 * @returns {string} リクエストID（req_xxx形式）
 */
function generateRequestId() {
  return generateId('req');
}

/**
 * 現在のユーザーメールを取得
 * @returns {string} メールアドレス
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || 'system';
  } catch (e) {
    return 'system';
  }
}

/**
 * 必須項目のバリデーション
 * @param {Object} obj - 検証対象オブジェクト
 * @param {string[]} fields - 必須フィールド名の配列
 * @returns {Object} { valid: boolean, missing: string[] }
 */
function validateRequired(obj, fields) {
  const missing = [];

  for (const field of fields) {
    const value = obj[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing
  };
}

/**
 * 日付文字列のバリデーション（YYYY-MM-DD形式）
 * @param {string} dateStr - 日付文字列
 * @returns {boolean} 有効な日付形式かどうか
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }

  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * オブジェクト内のDateを再帰的にISO文字列に変換
 * @param {*} obj - 変換対象
 * @returns {*} 変換後のオブジェクト
 */
function serializeForWeb(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (obj instanceof Date) {
    // 1899-1900年のDateはスプレッドシートの空セルなので空文字列に
    if (obj.getFullYear() < 1901) {
      return '';
    }
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(item => serializeForWeb(item));
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeForWeb(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * 成功レスポンスを構築
 *
 * Controller層: 直接呼び出し（try-catchで手動ラップ）
 * Service層: apiHandler_()ラッパー経由で自動ラップ（errors.ts参照）
 *
 * @param {Object} data - レスポンスデータ
 * @param {string} requestId - リクエストID
 * @returns {Object} 成功レスポンス
 * @see errors.ts apiHandler_() - Service層での自動エラーハンドリング
 */
function buildSuccessResponse(data, requestId) {
  const response = {
    ok: true,
    data: serializeForWeb(data),
    serverTime: getCurrentTimestamp(),
    requestId: requestId || generateRequestId()
  };
  // Web App経由でのシリアライズ問題を回避
  return JSON.parse(JSON.stringify(response));
}

/**
 * エラーレスポンスを構築
 *
 * Controller層: 直接呼び出し（try-catchで手動ラップ）
 * Service層: apiHandler_()ラッパー経由で自動ラップ（errors.ts参照）
 *
 * @param {string} code - エラーコード
 * @param {string} message - エラーメッセージ
 * @param {Object} details - 詳細情報（省略可）
 * @param {string} requestId - リクエストID
 * @returns {Object} エラーレスポンス
 * @see errors.ts apiHandler_() - Service層での自動エラーハンドリング
 */
function buildErrorResponse(code, message, details, requestId) {
  // SYSTEM_ERROR 時は内部エラーメッセージをクライアントに漏洩させない
  var safeMessage = message;
  if (code === ERROR_CODES.SYSTEM_ERROR) {
    Logger.log('SYSTEM_ERROR detail: ' + message);
    safeMessage = 'システムエラーが発生しました';
  }

  const response = {
    ok: false,
    error: {
      code: code,
      message: safeMessage,
      details: serializeForWeb(details) || {}
    },
    serverTime: getCurrentTimestamp(),
    requestId: requestId || generateRequestId()
  };
  // Web App経由でのシリアライズ問題を回避
  return JSON.parse(JSON.stringify(response));
}

// エラーコードは errors.js に統一
// @see errors.js ErrorCodes
// 後方互換性のため ERROR_CODES は errors.js で ErrorCodes のエイリアスとして定義

// buildSuccessResponse / buildErrorResponse のエイリアス
// 使用箇所: master_service.gs, CustomerFolderService.gs のみ
// 新規コードでは buildXxxResponse を直接使用すること
const successResponse = buildSuccessResponse;
const errorResponse = buildErrorResponse;

/**
 * オブジェクトの差分を取得（監査ログ用）
 * @param {Object} before - 変更前オブジェクト
 * @param {Object} after - 変更後オブジェクト
 * @returns {Object} { before: {差分フィールド}, after: {差分フィールド} }
 */
function getDiff(before, after) {
  const beforeDiff = {};
  const afterDiff = {};

  // afterの全キーをチェック
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      beforeDiff[key] = before[key];
      afterDiff[key] = after[key];
    }
  }

  // beforeにあってafterにないキーをチェック
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      beforeDiff[key] = before[key];
      afterDiff[key] = undefined;
    }
  }

  return {
    before: beforeDiff,
    after: afterDiff
  };
}

/**
 * マスターデータキャッシュ
 *
 * 2層キャッシュ構造:
 * 1. リクエストスコープ内メモリキャッシュ（同一リクエスト内での重複読み込み防止）
 * 2. CacheService（リクエスト間でのキャッシュ、TTL: 6時間）
 *
 * 使い方:
 *   const staff = MasterCache.getStaff();      // CacheService → シート → メモリ
 *   const customers = MasterCache.getCustomers();
 *   MasterCache.invalidateStaff();              // 更新後にキャッシュをクリア
 *
 * ウォームアップ:
 *   MasterCache.warmup();  // 全マスターデータをCacheServiceに事前読み込み
 */
const MasterCache = {
  CACHE_TTL: 21600,  // 6時間（秒）- 朝6時のウォームアップから夕方まで持続
  CACHE_KEY_STAFF: 'MasterCache_M_Staff',
  CACHE_KEY_CUSTOMERS: 'MasterCache_M_Customers',
  CACHE_KEY_SUBCONTRACTORS: 'MasterCache_M_Subcontractors',
  CACHE_KEY_TRANSPORT_FEES: 'MasterCache_M_TransportFees',
  CACHE_KEY_COMPANY: 'MasterCache_M_Company',
  CACHE_KEY_WORK_DETAILS: 'MasterCache_M_WorkDetails',
  CACHE_KEY_PRICE_TYPES: 'MasterCache_M_PriceTypes',
  CACHE_KEY_CUSTOM_PRICES: 'MasterCache_M_CustomPrices',

  _staffCache: null,
  _staffMap: null,
  _customerCache: null,
  _customerMap: null,
  _subcontractorCache: null,
  _transportFeeCache: null,
  _transportFeeMap: null,
  _companyCache: null,
  _workDetailCache: null,
  _workDetailMap: null,
  _priceTypeCache: null,
  _priceTypeMap: null,
  _customPriceCache: null,
  _customPriceMap: null,

  /**
   * M_Staffの全レコードを取得（2層キャッシュ付き）
   * @returns {Object[]} スタッフ配列
   */
  getStaff: function() {
    if (this._staffCache !== null) {
      return this._staffCache;
    }

    // CacheServiceから取得を試行
    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(this.CACHE_KEY_STAFF);
      if (cached) {
        this._staffCache = JSON.parse(cached);
        return this._staffCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for staff:', e);
    }

    // シートから読み込み
    this._staffCache = getAllRecords('M_Staff').filter(s => !s.is_deleted);

    // CacheServiceに保存（軽量化: 必要フィールドのみ保存してサイズ制限対策）
    try {
      const cache = CacheService.getScriptCache();
      const lightStaff = this._staffCache.map(s => ({
        staff_id: s.staff_id,
        name: s.name,
        name_kana: s.name_kana,
        nickname: s.nickname,
        phone: s.phone,
        staff_type: s.staff_type,
        skills: s.skills,
        ng_customers: s.ng_customers,
        daily_rate_basic: s.daily_rate_basic,
        daily_rate_tobi: s.daily_rate_tobi,
        daily_rate_age: s.daily_rate_age,
        daily_rate_tobiage: s.daily_rate_tobiage,
        daily_rate_half: s.daily_rate_half,
        daily_rate_fullday: s.daily_rate_fullday,
        daily_rate_night: s.daily_rate_night,
        withholding_tax_applicable: s.withholding_tax_applicable,
        is_active: s.is_active
      }));
      cache.put(this.CACHE_KEY_STAFF, JSON.stringify(lightStaff), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for staff:', e);
    }

    return this._staffCache;
  },

  /**
   * M_Staffをマップ形式で取得（staff_id → staff）
   * @returns {Object} スタッフマップ
   */
  getStaffMap: function() {
    if (this._staffMap === null) {
      const staff = this.getStaff();
      this._staffMap = {};
      for (const s of staff) {
        if (s.staff_id) {
          this._staffMap[s.staff_id] = s;
        }
      }
    }
    return this._staffMap;
  },

  /**
   * M_Customersの全レコードを取得（2層キャッシュ付き）
   * @returns {Object[]} 顧客配列
   */
  getCustomers: function() {
    if (this._customerCache !== null) {
      return this._customerCache;
    }

    // CacheServiceから取得を試行
    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(this.CACHE_KEY_CUSTOMERS);
      if (cached) {
        this._customerCache = JSON.parse(cached);
        return this._customerCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for customers:', e);
    }

    // シートから読み込み
    this._customerCache = getAllRecords('M_Customers').filter(c => !c.is_deleted);

    // CacheServiceに保存
    try {
      const cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_CUSTOMERS, JSON.stringify(this._customerCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for customers:', e);
    }

    return this._customerCache;
  },

  /**
   * M_Customersをマップ形式で取得（customer_id → customer）
   * @returns {Object} 顧客マップ
   */
  getCustomerMap: function() {
    if (this._customerMap === null) {
      const customers = this.getCustomers();
      this._customerMap = {};
      for (const c of customers) {
        if (c.customer_id) {
          this._customerMap[c.customer_id] = c;
        }
      }
    }
    return this._customerMap;
  },

  /**
   * 全キャッシュをクリア
   * マスターデータ更新後に呼び出す
   */
  invalidate: function() {
    this._staffCache = null;
    this._staffMap = null;
    this._customerCache = null;
    this._customerMap = null;
    this._subcontractorCache = null;
    this._transportFeeCache = null;
    this._companyCache = null;
    this._workDetailCache = null;
    this._workDetailMap = null;
    this._priceTypeCache = null;
    this._priceTypeMap = null;
    this._customPriceCache = null;
    this._customPriceMap = null;
    try {
      const cache = CacheService.getScriptCache();
      cache.removeAll([
        this.CACHE_KEY_STAFF,
        this.CACHE_KEY_CUSTOMERS,
        this.CACHE_KEY_SUBCONTRACTORS,
        this.CACHE_KEY_TRANSPORT_FEES,
        this.CACHE_KEY_COMPANY,
        this.CACHE_KEY_WORK_DETAILS,
        this.CACHE_KEY_PRICE_TYPES,
        this.CACHE_KEY_CUSTOM_PRICES
      ]);
    } catch (e) {
      console.warn('CacheService.removeAll failed:', e);
    }
  },

  /**
   * スタッフキャッシュのみクリア
   */
  invalidateStaff: function() {
    this._staffCache = null;
    this._staffMap = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_STAFF);
    } catch (e) {
      console.warn('CacheService.remove failed for staff:', e);
    }
  },

  /**
   * 顧客キャッシュのみクリア
   */
  invalidateCustomers: function() {
    this._customerCache = null;
    this._customerMap = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_CUSTOMERS);
    } catch (e) {
      console.warn('CacheService.remove failed for customers:', e);
    }
  },

  /**
   * M_Subcontractorsの全レコードを取得（2層キャッシュ付き）
   * @returns {Object[]} 外注先配列
   */
  getSubcontractors: function() {
    if (this._subcontractorCache !== null) {
      return this._subcontractorCache;
    }

    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(this.CACHE_KEY_SUBCONTRACTORS);
      if (cached) {
        this._subcontractorCache = JSON.parse(cached);
        return this._subcontractorCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for subcontractors:', e);
    }

    this._subcontractorCache = getAllRecords('M_Subcontractors').filter(s => !s.is_deleted);

    try {
      const cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_SUBCONTRACTORS, JSON.stringify(this._subcontractorCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for subcontractors:', e);
    }

    return this._subcontractorCache;
  },

  /**
   * 交通費の全レコードを取得（2層キャッシュ付き）
   * @returns {Object[]} 交通費配列
   */
  getTransportFees: function() {
    if (this._transportFeeCache !== null) {
      return this._transportFeeCache;
    }

    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(this.CACHE_KEY_TRANSPORT_FEES);
      if (cached) {
        this._transportFeeCache = JSON.parse(cached);
        return this._transportFeeCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for transportFees:', e);
    }

    this._transportFeeCache = getAllRecords('M_TransportFee');

    try {
      const cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_TRANSPORT_FEES, JSON.stringify(this._transportFeeCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for transportFees:', e);
    }

    return this._transportFeeCache;
  },

  /**
   * M_TransportFeeをマップ形式で取得（area_code → fee）
   * @returns {Object} 交通費マップ
   */
  getTransportFeeMap: function() {
    if (this._transportFeeMap === null) {
      const fees = this.getTransportFees();
      this._transportFeeMap = {};
      for (const f of fees) {
        if (f.area_code) {
          this._transportFeeMap[f.area_code] = f;
        }
      }
    }
    return this._transportFeeMap;
  },

  /**
   * 自社情報の全レコードを取得（2層キャッシュ付き）
   * @returns {Object} 会社情報
   */
  getCompany: function() {
    if (this._companyCache !== null) {
      return this._companyCache;
    }

    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(this.CACHE_KEY_COMPANY);
      if (cached) {
        this._companyCache = JSON.parse(cached);
        return this._companyCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for company:', e);
    }

    const records = getAllRecords('M_Company');
    this._companyCache = records.length > 0 ? records[0] : {};

    try {
      const cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_COMPANY, JSON.stringify(this._companyCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for company:', e);
    }

    return this._companyCache;
  },

  /**
   * 外注先キャッシュをクリア
   */
  invalidateSubcontractors: function() {
    this._subcontractorCache = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_SUBCONTRACTORS);
    } catch (e) {
      console.warn('CacheService.remove failed for subcontractors:', e);
    }
  },

  /**
   * 交通費キャッシュをクリア
   */
  invalidateTransportFees: function() {
    this._transportFeeCache = null;
    this._transportFeeMap = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_TRANSPORT_FEES);
    } catch (e) {
      console.warn('CacheService.remove failed for transportFees:', e);
    }
  },

  /**
   * 会社情報キャッシュをクリア
   */
  invalidateCompany: function() {
    this._companyCache = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_COMPANY);
    } catch (e) {
      console.warn('CacheService.remove failed for company:', e);
    }
  },

  /**
   * M_WorkDetailsの全レコードを取得（2層キャッシュ付き、sort_order昇順）
   * @returns {Object[]} 作業詳細配列
   */
  getWorkDetails: function() {
    if (this._workDetailCache !== null) {
      return this._workDetailCache;
    }

    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get(this.CACHE_KEY_WORK_DETAILS);
      if (cached) {
        this._workDetailCache = JSON.parse(cached);
        return this._workDetailCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for workDetails:', e);
    }

    this._workDetailCache = getAllRecords('M_WorkDetails')
      .filter(function(d) { return !d.is_deleted; })
      .sort(function(a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); });

    try {
      var cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_WORK_DETAILS, JSON.stringify(this._workDetailCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for workDetails:', e);
    }

    return this._workDetailCache;
  },

  /**
   * M_WorkDetailsをマップ形式で取得（value → workDetail）
   * @returns {Object} 作業詳細マップ
   */
  getWorkDetailMap: function() {
    if (this._workDetailMap === null) {
      var details = this.getWorkDetails();
      this._workDetailMap = {};
      for (var i = 0; i < details.length; i++) {
        if (details[i].value) {
          this._workDetailMap[details[i].value] = details[i];
        }
      }
    }
    return this._workDetailMap;
  },

  /**
   * 作業詳細キャッシュをクリア
   */
  invalidateWorkDetails: function() {
    this._workDetailCache = null;
    this._workDetailMap = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_WORK_DETAILS);
    } catch (e) {
      console.warn('CacheService.remove failed for workDetails:', e);
    }
  },

  /**
   * M_PriceTypesの全レコードを取得（2層キャッシュ付き、sort_order昇順）
   * @returns {Object[]} 単価種別配列
   */
  getPriceTypes: function() {
    if (this._priceTypeCache !== null) {
      return this._priceTypeCache;
    }

    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get(this.CACHE_KEY_PRICE_TYPES);
      if (cached) {
        this._priceTypeCache = JSON.parse(cached);
        return this._priceTypeCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for priceTypes:', e);
    }

    this._priceTypeCache = getAllRecords('M_PriceTypes')
      .sort(function(a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); });

    try {
      var cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_PRICE_TYPES, JSON.stringify(this._priceTypeCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for priceTypes:', e);
    }

    return this._priceTypeCache;
  },

  /**
   * M_PriceTypesをマップ形式で取得（code → PriceTypeRecord）
   * @returns {Object} 単価種別マップ
   */
  getPriceTypeMap: function() {
    if (this._priceTypeMap === null) {
      var types = this.getPriceTypes();
      this._priceTypeMap = {};
      for (var i = 0; i < types.length; i++) {
        if (types[i].code) {
          this._priceTypeMap[types[i].code] = types[i];
        }
      }
    }
    return this._priceTypeMap;
  },

  /**
   * M_CustomPricesの全レコードを取得（2層キャッシュ付き）
   * @returns {Object[]} カスタム単価配列
   */
  getCustomPrices: function() {
    if (this._customPriceCache !== null) {
      return this._customPriceCache;
    }

    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get(this.CACHE_KEY_CUSTOM_PRICES);
      if (cached) {
        this._customPriceCache = JSON.parse(cached);
        return this._customPriceCache;
      }
    } catch (e) {
      console.warn('CacheService.get failed for customPrices:', e);
    }

    this._customPriceCache = getAllRecords('M_CustomPrices');

    try {
      var cache = CacheService.getScriptCache();
      cache.put(this.CACHE_KEY_CUSTOM_PRICES, JSON.stringify(this._customPriceCache), this.CACHE_TTL);
    } catch (e) {
      console.warn('CacheService.put failed for customPrices:', e);
    }

    return this._customPriceCache;
  },

  /**
   * M_CustomPricesをマップ形式で取得（'entity_type|entity_id|code' → amount）
   * @returns {Object} カスタム単価マップ
   */
  getCustomPriceMap: function() {
    if (this._customPriceMap === null) {
      var prices = this.getCustomPrices();
      this._customPriceMap = {};
      for (var i = 0; i < prices.length; i++) {
        var p = prices[i];
        if (p.entity_type && p.entity_id && p.price_type_code) {
          var key = p.entity_type + '|' + p.entity_id + '|' + p.price_type_code;
          this._customPriceMap[key] = Number(p.amount) || 0;
        }
      }
    }
    return this._customPriceMap;
  },

  /**
   * 単価種別キャッシュをクリア
   */
  invalidatePriceTypes: function() {
    this._priceTypeCache = null;
    this._priceTypeMap = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_PRICE_TYPES);
    } catch (e) {
      console.warn('CacheService.remove failed for priceTypes:', e);
    }
  },

  /**
   * カスタム単価キャッシュをクリア
   */
  invalidateCustomPrices: function() {
    this._customPriceCache = null;
    this._customPriceMap = null;
    try {
      CacheService.getScriptCache().remove(this.CACHE_KEY_CUSTOM_PRICES);
    } catch (e) {
      console.warn('CacheService.remove failed for customPrices:', e);
    }
  },

  /**
   * 全マスターデータをCacheServiceに事前読み込み（ウォームアップ）
   * 毎朝6時のトリガーから呼び出す
   * @returns {Object} ウォームアップ結果
   */
  warmup: function() {
    const startTime = Date.now();
    const results = {};

    try {
      // メモリキャッシュをクリア（強制的にシートから読み込む）
      this._staffCache = null;
      this._staffMap = null;
      this._customerCache = null;
      this._customerMap = null;
      this._subcontractorCache = null;
      this._transportFeeCache = null;
      this._transportFeeMap = null;
      this._companyCache = null;
      this._workDetailCache = null;
      this._workDetailMap = null;
      this._priceTypeCache = null;
      this._priceTypeMap = null;
      this._customPriceCache = null;
      this._customPriceMap = null;

      // CacheServiceもクリア
      const cache = CacheService.getScriptCache();
      cache.removeAll([
        this.CACHE_KEY_STAFF,
        this.CACHE_KEY_CUSTOMERS,
        this.CACHE_KEY_SUBCONTRACTORS,
        this.CACHE_KEY_TRANSPORT_FEES,
        this.CACHE_KEY_COMPANY,
        this.CACHE_KEY_WORK_DETAILS,
        this.CACHE_KEY_PRICE_TYPES,
        this.CACHE_KEY_CUSTOM_PRICES
      ]);

      // 各マスターをロード（CacheServiceに自動保存される）
      const staff = this.getStaff();
      results.staff = staff.length;

      const customers = this.getCustomers();
      results.customers = customers.length;

      const subcontractors = this.getSubcontractors();
      results.subcontractors = subcontractors.length;

      const transportFees = this.getTransportFees();
      results.transportFees = transportFees.length;

      const company = this.getCompany();
      results.company = company.company_id ? 1 : 0;

      const workDetails = this.getWorkDetails();
      results.workDetails = workDetails.length;

      const priceTypes = this.getPriceTypes();
      results.priceTypes = priceTypes.length;

      const customPrices = this.getCustomPrices();
      results.customPrices = customPrices.length;

      results.duration = Date.now() - startTime;
      results.success = true;

      console.log('MasterCache warmup completed:', results);
    } catch (e) {
      results.success = false;
      results.error = e.message;
      logErr('MasterCache.warmup', e);
    }

    return results;
  }
};
