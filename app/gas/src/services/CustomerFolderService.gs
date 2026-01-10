/**
 * Customer Folder Service
 *
 * 顧客専用フォルダの作成・管理
 *
 * フォルダ構造:
 * /gas-dispatch-system/
 *   └── /顧客/                    ← 親フォルダ（CUSTOMER_FOLDERS_PARENT_ID）
 *       ├── /アーキ工業_cus_xxx/  ← 会社フォルダ（folder_id に保存）
 *       │   └── /請求書/          ← 請求書出力先
 *       └── /山田建設_cus_yyy/
 *           └── /請求書/
 */

const CustomerFolderService = {
  /**
   * ScriptProperty キー
   */
  PARENT_FOLDER_KEY: 'CUSTOMER_FOLDERS_PARENT_ID',

  /**
   * サブフォルダ名
   */
  INVOICE_SUBFOLDER_NAME: '請求書',

  /**
   * 親フォルダ（/顧客/）を取得（なければ作成）
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  getParentFolder: function() {
    const props = PropertiesService.getScriptProperties();
    let parentId = props.getProperty(this.PARENT_FOLDER_KEY);

    if (parentId) {
      try {
        return DriveApp.getFolderById(parentId);
      } catch (e) {
        Logger.log(`親フォルダが見つかりません（ID: ${parentId}）。再作成します。`);
      }
    }

    // 親フォルダを作成
    const rootId = props.getProperty('DRIVE_ROOT_FOLDER_ID');
    let parentFolder;

    if (rootId) {
      try {
        const rootFolder = DriveApp.getFolderById(rootId);
        // 既存の「顧客」フォルダを探す
        const existing = rootFolder.getFoldersByName('顧客');
        if (existing.hasNext()) {
          parentFolder = existing.next();
        } else {
          parentFolder = rootFolder.createFolder('顧客');
        }
      } catch (e) {
        Logger.log(`ルートフォルダが見つかりません。ルート直下に作成します。`);
        parentFolder = DriveApp.createFolder('顧客');
      }
    } else {
      // DRIVE_ROOT_FOLDER_ID が未設定の場合はルート直下に作成
      parentFolder = DriveApp.createFolder('顧客');
    }

    props.setProperty(this.PARENT_FOLDER_KEY, parentFolder.getId());
    Logger.log(`顧客フォルダ親を作成/設定: ${parentFolder.getUrl()}`);
    return parentFolder;
  },

  /**
   * 顧客専用フォルダを作成
   * @param {Object} customer - 顧客データ（customer_id, company_name必須）
   * @returns {Object} { folderId, folderUrl, invoiceFolderId, created }
   */
  createCustomerFolder: function(customer) {
    if (!customer.customer_id || !customer.company_name) {
      throw new Error('customer_id と company_name は必須です');
    }

    // 既にフォルダがある場合はそれを返す
    if (customer.folder_id) {
      try {
        const existing = DriveApp.getFolderById(customer.folder_id);
        // 請求書サブフォルダを確認（なければ作成）
        const invoiceFolder = this._getOrCreateSubfolder(existing, this.INVOICE_SUBFOLDER_NAME);
        return {
          folderId: existing.getId(),
          folderUrl: existing.getUrl(),
          invoiceFolderId: invoiceFolder.getId(),
          created: false
        };
      } catch (e) {
        Logger.log(`既存フォルダが見つかりません（ID: ${customer.folder_id}）。新規作成します。`);
      }
    }

    // 親フォルダを取得
    const parentFolder = this.getParentFolder();

    // 会社フォルダを作成
    const folderName = this._generateFolderName(customer);
    const companyFolder = parentFolder.createFolder(folderName);

    // 請求書サブフォルダを作成
    const invoiceFolder = companyFolder.createFolder(this.INVOICE_SUBFOLDER_NAME);

    Logger.log(`顧客フォルダを作成: ${companyFolder.getUrl()}`);

    return {
      folderId: companyFolder.getId(),
      folderUrl: companyFolder.getUrl(),
      invoiceFolderId: invoiceFolder.getId(),
      created: true
    };
  },

  /**
   * 顧客の請求書フォルダを取得
   * folder_id が会社フォルダを指すので、その配下の「請求書」フォルダを返す
   * @param {Object} customer - 顧客データ
   * @returns {GoogleAppsScript.Drive.Folder|null}
   */
  getInvoiceFolder: function(customer) {
    if (!customer || !customer.folder_id) {
      return null;
    }

    try {
      const companyFolder = DriveApp.getFolderById(customer.folder_id);
      return this._getOrCreateSubfolder(companyFolder, this.INVOICE_SUBFOLDER_NAME);
    } catch (e) {
      Logger.log(`顧客フォルダが見つかりません: ${e.message}`);
      return null;
    }
  },

  /**
   * folder_id未設定の全顧客にフォルダを作成（一括処理）
   * @returns {Object} { created: number, skipped: number, errors: [] }
   */
  createFoldersForAll: function() {
    const result = { created: 0, skipped: 0, errors: [] };

    const listResult = listCustomers({ activeOnly: false });
    if (!listResult.ok) {
      throw new Error(listResult.error?.message || '顧客一覧の取得に失敗');
    }

    const customers = listResult.data.items || [];

    for (const customer of customers) {
      // 既にフォルダがある場合はスキップ
      if (customer.folder_id) {
        // フォルダが有効か確認
        try {
          DriveApp.getFolderById(customer.folder_id);
          result.skipped++;
          continue;
        } catch (e) {
          // フォルダが無効な場合は再作成
          Logger.log(`${customer.company_name}: フォルダが無効。再作成します。`);
        }
      }

      try {
        const folderResult = this.createCustomerFolder(customer);

        // folder_idをDBに保存
        this._updateCustomerFolderId(customer.customer_id, folderResult.folderId);

        result.created++;
      } catch (e) {
        result.errors.push({
          customerId: customer.customer_id,
          companyName: customer.company_name,
          error: e.message
        });
        Logger.log(`${customer.company_name}: フォルダ作成エラー - ${e.message}`);
      }
    }

    return result;
  },

  /**
   * 顧客のfolder_idを更新
   * @param {string} customerId - 顧客ID
   * @param {string} folderId - フォルダID
   * @returns {string} 新しいupdated_at
   */
  _updateCustomerFolderId: function(customerId, folderId) {
    const sheet = getSheetDirect('顧客');
    const row = findById(sheet, 'customer_id', customerId);

    if (row) {
      const newUpdatedAt = getCurrentTimestamp();
      updateRow(sheet, row._rowIndex, {
        folder_id: folderId,
        updated_at: newUpdatedAt,
        updated_by: getCurrentUserEmail()
      });
      return newUpdatedAt;
    }
    return null;
  },

  /**
   * フォルダ名を生成
   * @param {Object} customer - 顧客データ
   * @returns {string} フォルダ名（例: "アーキ工業"）
   */
  _generateFolderName: function(customer) {
    // 不正なファイル名文字を除去
    const safeName = customer.company_name.replace(/[\/\\?%*:|"<>]/g, '_');
    return safeName;
  },

  /**
   * サブフォルダを取得または作成
   * @param {GoogleAppsScript.Drive.Folder} parentFolder - 親フォルダ
   * @param {string} name - サブフォルダ名
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  _getOrCreateSubfolder: function(parentFolder, name) {
    const folders = parentFolder.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parentFolder.createFolder(name);
  }
};

// ========================================
// グローバル関数（クライアントから呼び出し用）
// ========================================

/**
 * 顧客のフォルダを作成
 * @param {string} customerId - 顧客ID
 * @returns {Object} レスポンス
 */
function createCustomerFolder(customerId) {
  const requestId = generateRequestId();

  try {
    const customerResult = getCustomer(customerId);
    if (!customerResult.ok) {
      return errorResponse('NOT_FOUND', '顧客が見つかりません', {}, requestId);
    }

    const customer = customerResult.data;
    const result = CustomerFolderService.createCustomerFolder(customer);

    // folder_idをDBに更新（新規作成時のみ）
    if (result.created) {
      const newUpdatedAt = CustomerFolderService._updateCustomerFolderId(customerId, result.folderId);
      result.updated_at = newUpdatedAt;
    }

    return successResponse(result, requestId);

  } catch (e) {
    Logger.log(`createCustomerFolder error: ${e.message}`);
    return errorResponse('FOLDER_CREATE_ERROR', e.message, {}, requestId);
  }
}

/**
 * 全顧客にフォルダを一括作成
 * @returns {Object} レスポンス
 */
function createAllCustomerFolders() {
  const requestId = generateRequestId();

  try {
    const result = CustomerFolderService.createFoldersForAll();
    return successResponse(result, requestId);
  } catch (e) {
    Logger.log(`createAllCustomerFolders error: ${e.message}`);
    return errorResponse('BATCH_FOLDER_CREATE_ERROR', e.message, {}, requestId);
  }
}
