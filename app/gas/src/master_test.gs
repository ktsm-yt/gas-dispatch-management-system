/**
 * Master Table CRUD Test
 *
 * KTSM-24: マスターテーブルCRUD機能テスト
 *
 * GASエディタから各関数を実行してテスト
 */

/**
 * 顧客CRUDテスト
 */
function testCustomerCRUD() {
  Logger.log('=== 顧客 CRUD テスト ===\n');

  // 1. 新規作成
  Logger.log('1. 顧客を新規作成...');
  const createResult = saveCustomer({
    company_name: 'テスト株式会社',
    branch_name: '東京支店',
    contact_name: '山田太郎',
    phone: '03-1234-5678',
    email: 'test@example.com',
    unit_price_tobi: 15000,
    unit_price_age: 13000,
    closing_day: 25,
    payment_day: 10,
    payment_month_offset: 1
  });

  if (!createResult.ok) {
    Logger.log(`✗ 作成失敗: ${createResult.error.message}`);
    return;
  }
  Logger.log(`✓ 作成成功: ${createResult.data.customer_id}`);
  const customerId = createResult.data.customer_id;
  const updatedAt = createResult.data.updated_at;

  // 2. 取得
  Logger.log('\n2. 顧客を取得...');
  const getResult = getCustomer(customerId);
  if (!getResult.ok) {
    Logger.log(`✗ 取得失敗: ${getResult.error.message}`);
    return;
  }
  Logger.log(`✓ 取得成功: ${getResult.data.company_name}`);

  // 3. 更新
  Logger.log('\n3. 顧客を更新...');
  const updateResult = saveCustomer({
    customer_id: customerId,
    company_name: 'テスト株式会社（更新後）',
    notes: '更新テスト'
  }, updatedAt);

  if (!updateResult.ok) {
    Logger.log(`✗ 更新失敗: ${updateResult.error.message}`);
    return;
  }
  Logger.log(`✓ 更新成功: ${updateResult.data.company_name}`);

  // 4. 一覧取得
  Logger.log('\n4. 顧客一覧を取得...');
  const listResult = listCustomers();
  if (!listResult.ok) {
    Logger.log(`✗ 一覧取得失敗: ${listResult.error.message}`);
    return;
  }
  Logger.log(`✓ 一覧取得成功: ${listResult.data.count}件`);

  // 5. 楽観ロックテスト（古いupdatedAtで更新を試みる）
  Logger.log('\n5. 楽観ロックテスト（競合検知）...');
  const conflictResult = saveCustomer({
    customer_id: customerId,
    notes: '競合テスト'
  }, updatedAt); // 古いupdatedAt

  if (conflictResult.ok) {
    Logger.log('✗ 競合検知されるべきでしたが、更新が成功しました');
  } else if (conflictResult.error.code === 'CONFLICT_ERROR') {
    Logger.log('✓ 競合検知成功: ' + conflictResult.error.message);
  } else {
    Logger.log(`✗ 予期しないエラー: ${conflictResult.error.message}`);
  }

  // 6. 削除
  Logger.log('\n6. 顧客を削除...');
  const deleteResult = deleteCustomer(customerId, updateResult.data.updated_at);
  if (!deleteResult.ok) {
    Logger.log(`✗ 削除失敗: ${deleteResult.error.message}`);
    return;
  }
  Logger.log('✓ 削除成功');

  // 7. 削除後の取得（NOT_FOUNDになるはず）
  Logger.log('\n7. 削除後の取得確認...');
  const getDeletedResult = getCustomer(customerId);
  if (!getDeletedResult.ok && getDeletedResult.error.code === 'NOT_FOUND') {
    Logger.log('✓ 削除確認OK（NOT_FOUND）');
  } else {
    Logger.log('✗ 削除後も取得できてしまいました');
  }

  Logger.log('\n=== 顧客 CRUD テスト完了 ===');
}

/**
 * スタッフCRUDテスト
 */
function testStaffCRUD() {
  Logger.log('=== スタッフ CRUD テスト ===\n');

  // 1. 新規作成
  Logger.log('1. スタッフを新規作成...');
  const createResult = saveStaff({
    name: '田中一郎',
    name_kana: 'タナカイチロウ',
    phone: '090-1234-5678',
    has_motorbike: true,
    daily_rate_half: 8000,
    daily_rate_basic: 11000,
    daily_rate_fullday: 14000,
    daily_rate_night: 13000,
    daily_rate_tobi: 17000,
    staff_type: 'regular'
  });

  if (!createResult.ok) {
    Logger.log(`✗ 作成失敗: ${createResult.error.message}`);
    return;
  }
  Logger.log(`✓ 作成成功: ${createResult.data.staff_id}`);
  const staffId = createResult.data.staff_id;

  // 2. 一覧取得
  Logger.log('\n2. スタッフ一覧を取得...');
  const listResult = listStaff();
  if (!listResult.ok) {
    Logger.log(`✗ 一覧取得失敗: ${listResult.error.message}`);
    return;
  }
  Logger.log(`✓ 一覧取得成功: ${listResult.data.count}件`);

  // 3. 削除
  Logger.log('\n3. スタッフを削除...');
  const deleteResult = deleteStaff(staffId, createResult.data.updated_at);
  if (!deleteResult.ok) {
    Logger.log(`✗ 削除失敗: ${deleteResult.error.message}`);
    return;
  }
  Logger.log('✓ 削除成功');

  Logger.log('\n=== スタッフ CRUD テスト完了 ===');
}

/**
 * 外注先CRUDテスト
 */
function testSubcontractorCRUD() {
  Logger.log('=== 外注先 CRUD テスト ===\n');

  // 1. 新規作成
  Logger.log('1. 外注先を新規作成...');
  const createResult = saveSubcontractor({
    company_name: 'テスト外注株式会社',
    contact_name: '佐藤次郎',
    phone: '03-9876-5432'
  });

  if (!createResult.ok) {
    Logger.log(`✗ 作成失敗: ${createResult.error.message}`);
    return;
  }
  Logger.log(`✓ 作成成功: ${createResult.data.subcontractor_id}`);
  const subcontractorId = createResult.data.subcontractor_id;

  // 2. 削除
  Logger.log('\n2. 外注先を削除...');
  const deleteResult = deleteSubcontractor(subcontractorId, createResult.data.updated_at);
  if (!deleteResult.ok) {
    Logger.log(`✗ 削除失敗: ${deleteResult.error.message}`);
    return;
  }
  Logger.log('✓ 削除成功');

  Logger.log('\n=== 外注先 CRUD テスト完了 ===');
}

/**
 * 交通費マスターCRUDテスト
 */
function testTransportFeeCRUD() {
  Logger.log('=== 交通費マスター CRUD テスト ===\n');

  // 1. 新規作成
  Logger.log('1. 交通費を新規作成...');
  const createResult = saveTransportFee({
    area_code: 'TEST01',
    area_name: 'テストエリア',
    default_fee: 500
  });

  if (!createResult.ok) {
    Logger.log(`✗ 作成失敗: ${createResult.error.message}`);
    return;
  }
  Logger.log(`✓ 作成成功: ${createResult.data.area_code}`);

  // 2. 更新
  Logger.log('\n2. 交通費を更新...');
  const updateResult = saveTransportFee({
    area_code: 'TEST01',
    area_name: 'テストエリア（更新）',
    default_fee: 600
  });

  if (!updateResult.ok) {
    Logger.log(`✗ 更新失敗: ${updateResult.error.message}`);
    return;
  }
  Logger.log(`✓ 更新成功: ${updateResult.data.default_fee}円`);

  // 3. 一覧取得
  Logger.log('\n3. 交通費一覧を取得...');
  const listResult = listTransportFees();
  if (!listResult.ok) {
    Logger.log(`✗ 一覧取得失敗: ${listResult.error.message}`);
    return;
  }
  Logger.log(`✓ 一覧取得成功: ${listResult.data.count}件`);

  // 4. 削除（物理削除）
  Logger.log('\n4. 交通費を削除...');
  const deleteResult = deleteTransportFee('TEST01');
  if (!deleteResult.ok) {
    Logger.log(`✗ 削除失敗: ${deleteResult.error.message}`);
    return;
  }
  Logger.log('✓ 削除成功');

  Logger.log('\n=== 交通費マスター CRUD テスト完了 ===');
}

/**
 * 自社情報CRUDテスト
 */
function testCompanyCRUD() {
  Logger.log('=== 自社情報 CRUD テスト ===\n');

  // 1. 保存（新規または更新）
  Logger.log('1. 自社情報を保存...');
  const saveResult = saveCompany({
    company_name: 'テスト運営会社',
    postal_code: '100-0001',
    address: '東京都千代田区千代田1-1',
    phone: '03-1111-2222',
    invoice_registration_number: 'T1234567890123'
  });

  if (!saveResult.ok) {
    Logger.log(`✗ 保存失敗: ${saveResult.error.message}`);
    return;
  }
  Logger.log(`✓ 保存成功: ${saveResult.data.company_id}`);

  // 2. 取得
  Logger.log('\n2. 自社情報を取得...');
  const getResult = getCompany();
  if (!getResult.ok) {
    Logger.log(`✗ 取得失敗: ${getResult.error.message}`);
    return;
  }
  if (getResult.data) {
    Logger.log(`✓ 取得成功: ${getResult.data.company_name}`);
  } else {
    Logger.log('✓ 取得成功（データなし）');
  }

  Logger.log('\n=== 自社情報 CRUD テスト完了 ===');
}

/**
 * 既存スタッフにボードスキルを追加（サンプルデータ用）
 */
function addBoardSkillToSomeStaff() {
  Logger.log('=== スタッフにボードスキル追加 ===\n');

  const result = listStaff();
  if (!result.ok) {
    Logger.log('スタッフ一覧取得失敗');
    return;
  }

  const staffList = result.data.items;
  Logger.log(`スタッフ数: ${staffList.length}`);

  // 最初の2人にボードスキルを追加
  let updated = 0;
  for (let i = 0; i < Math.min(2, staffList.length); i++) {
    const staff = staffList[i];
    let skills = staff.skills ? staff.skills.split(',').map(s => s.trim()) : [];

    if (!skills.includes('ボード')) {
      skills.push('ボード');
      const updateResult = saveStaff({
        staff_id: staff.staff_id,
        skills: skills.join(',')
      }, staff.updated_at);

      if (updateResult.ok) {
        Logger.log(`✓ ${staff.name}: ${updateResult.data.skills}`);
        updated++;
      } else {
        Logger.log(`✗ ${staff.name}: ${updateResult.error.message}`);
      }
    }
  }

  Logger.log(`\n${updated}名にボードスキルを追加しました`);
}

/**
 * 全マスターテーブルのCRUDテストを実行
 */
function testAllMasterCRUD() {
  Logger.log('========================================');
  Logger.log('  マスターテーブル CRUD 総合テスト');
  Logger.log('========================================\n');

  testCustomerCRUD();
  Logger.log('\n');
  testStaffCRUD();
  Logger.log('\n');
  testSubcontractorCRUD();
  Logger.log('\n');
  testTransportFeeCRUD();
  Logger.log('\n');
  testCompanyCRUD();

  Logger.log('\n========================================');
  Logger.log('  全テスト完了');
  Logger.log('========================================');
}
