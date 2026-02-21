/**
 * Authentication & Authorization Module
 *
 * KTSM-38: 認証・認可実装
 * Phase 2 開発テスト: このコメントはデモ版（v17）には反映されない
 *
 * 機能:
 * - Google Workspace アカウントによる SSO
 * - 許可ドメインによるアクセス制限
 * - 権限管理（admin/manager/staff）
 */

/**
 * 許可ドメイン（ScriptProperties から取得、未設定時はデフォルト値）
 */
function getAllowedDomain() {
  const prop = PropertiesService.getScriptProperties();
  const domain = prop.getProperty('ALLOWED_DOMAIN');
  if (!domain) {
    throw new Error('ALLOWED_DOMAIN が ScriptProperties に設定されていません');
  }
  return domain;
}

/**
 * 権限レベルの定義
 */
const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff'
};

/**
 * 権限の階層（数値が大きいほど高権限）
 */
const ROLE_HIERARCHY = {
  'admin': 3,
  'manager': 2,
  'staff': 1
};

/**
 * 現在のユーザー情報を取得
 * @returns {Object} ユーザー情報 { email, domain, isAuthenticated }
 */
function getCurrentUser() {
  try {
    const user = Session.getActiveUser();
    const email = user.getEmail();

    if (!email) {
      return {
        email: null,
        domain: null,
        isAuthenticated: false
      };
    }

    const domain = email.split('@')[1];

    return {
      email: email,
      domain: domain,
      isAuthenticated: true
    };
  } catch (error) {
    Logger.log(`getCurrentUser error: ${error.message}`);
    return {
      email: null,
      domain: null,
      isAuthenticated: false
    };
  }
}

/**
 * ドメインチェック
 * 許可されたドメインのユーザーかどうかを確認
 * @returns {Object} { allowed: boolean, email: string, message: string }
 */
function checkDomain() {
  // デモモード: 外部ユーザーでもアクセス可能にする
  const prop = PropertiesService.getScriptProperties();
  if (prop.getProperty('DEMO_MODE') === 'true') {
    Logger.log('WARNING: DEMO_MODE is active — domain check bypassed');
    // 監査ログ用に実際のセッションユーザーも記録
    const actualUser = getCurrentUser();
    return {
      allowed: true,
      email: 'demo@example.com',
      demo_actual_user: actualUser.email || 'unknown',
      message: 'OK (Demo Mode)'
    };
  }

  const user = getCurrentUser();

  if (!user.isAuthenticated) {
    return {
      allowed: false,
      email: null,
      message: 'ログインが必要です'
    };
  }

  const allowedDomain = getAllowedDomain();

  if (user.domain !== allowedDomain) {
    return {
      allowed: false,
      email: user.email,
      message: `このアプリは ${allowedDomain} ドメインのユーザーのみ利用可能です`
    };
  }

  return {
    allowed: true,
    email: user.email,
    message: 'OK'
  };
}

/**
 * ユーザーの権限を取得
 * M_Staff テーブルまたは ScriptProperties から権限を解決
 * @param {string} email - ユーザーのメールアドレス
 * @returns {string} 権限（admin/manager/staff）
 */
function getUserRole(email) {
  const prop = PropertiesService.getScriptProperties();

  // 管理者リストをチェック（ScriptProperties に設定）
  const adminEmails = (prop.getProperty('ADMIN_EMAILS') || '').split(',').map(e => e.trim().toLowerCase());
  const managerEmails = (prop.getProperty('MANAGER_EMAILS') || '').split(',').map(e => e.trim().toLowerCase());

  const lowerEmail = email.toLowerCase();

  if (adminEmails.includes(lowerEmail)) {
    return ROLES.ADMIN;
  }

  if (managerEmails.includes(lowerEmail)) {
    return ROLES.MANAGER;
  }

  // デフォルトは staff
  return ROLES.STAFF;
}

/**
 * 権限チェック
 * 現在のユーザーが指定された権限以上を持っているかを確認
 * @param {string} requiredRole - 必要な権限（admin/manager/staff）
 * @returns {Object} { allowed: boolean, userRole: string, message: string }
 */
function checkPermission(requiredRole) {
  // PropertiesService は1回のみ取得（checkDomain/getUserRole 内でも使用されるが、GASが内部キャッシュ）
  const prop = PropertiesService.getScriptProperties();
  const allProps = prop.getProperties();

  // DEMO_MODE: 全権限を許可
  if (allProps['DEMO_MODE'] === 'true') {
    Logger.log('WARNING: DEMO_MODE is active — permission check bypassed (requiredRole: ' + requiredRole + ')');
    return {
      allowed: true,
      userRole: ROLES.ADMIN,
      message: 'OK (Demo Mode)'
    };
  }

  const domainCheck = checkDomain();

  if (!domainCheck.allowed) {
    return {
      allowed: false,
      userRole: null,
      message: domainCheck.message
    };
  }

  const userRole = getUserRole(domainCheck.email);
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

  if (userLevel < requiredLevel) {
    return {
      allowed: false,
      userRole: userRole,
      message: `この操作には ${requiredRole} 以上の権限が必要です`
    };
  }

  return {
    allowed: true,
    userRole: userRole,
    message: 'OK'
  };
}

/**
 * 権限チェック（例外スロー版）
 * 権限がない場合は例外をスローする
 * @param {string} requiredRole - 必要な権限
 * @throws {Error} 権限がない場合
 */
function requirePermission(requiredRole) {
  const result = checkPermission(requiredRole);

  if (!result.allowed) {
    throw new Error(`PERMISSION_DENIED: ${result.message}`);
  }

  return result;
}

/**
 * 管理者権限チェック
 */
function requireAdmin() {
  return requirePermission(ROLES.ADMIN);
}

/**
 * マネージャー以上の権限チェック
 */
function requireManager() {
  return requirePermission(ROLES.MANAGER);
}

/**
 * スタッフ以上の権限チェック（ログイン必須）
 */
function requireStaff() {
  return requirePermission(ROLES.STAFF);
}

/**
 * 認証・認可の初期設定を行う
 * ScriptProperties に管理者・マネージャーのメールアドレスを設定
 */
function setupAuth() {
  const prop = PropertiesService.getScriptProperties();

  // 現在の設定を表示
  Logger.log('=== 認証・認可設定 ===');
  Logger.log(`ALLOWED_DOMAIN: ${prop.getProperty('ALLOWED_DOMAIN') || '(未設定)'}`);
  Logger.log(`ADMIN_EMAILS: ${prop.getProperty('ADMIN_EMAILS') || '(未設定)'}`);
  Logger.log(`MANAGER_EMAILS: ${prop.getProperty('MANAGER_EMAILS') || '(未設定)'}`);
  Logger.log('');
  Logger.log('設定例:');
  Logger.log('  prop.setProperty("ALLOWED_DOMAIN", "example.com");');
  Logger.log('  prop.setProperty("ADMIN_EMAILS", "ceo@example.com");');
  Logger.log('  prop.setProperty("MANAGER_EMAILS", "manager1@example.com,manager2@example.com");');
}

/**
 * 認証設定を行う（初期セットアップ用）
 * @param {string} domain - 許可ドメイン
 * @param {string} adminEmails - 管理者メールアドレス（カンマ区切り）
 * @param {string} managerEmails - マネージャーメールアドレス（カンマ区切り）
 */
function configureAuth(domain, adminEmails, managerEmails) {
  const prop = PropertiesService.getScriptProperties();

  if (domain) {
    prop.setProperty('ALLOWED_DOMAIN', domain);
    Logger.log(`✓ ALLOWED_DOMAIN: ${domain}`);
  }

  if (adminEmails) {
    prop.setProperty('ADMIN_EMAILS', adminEmails);
    Logger.log(`✓ ADMIN_EMAILS: ${adminEmails}`);
  }

  if (managerEmails) {
    prop.setProperty('MANAGER_EMAILS', managerEmails);
    Logger.log(`✓ MANAGER_EMAILS: ${managerEmails}`);
  }

  Logger.log('\n認証設定が完了しました');
}

/**
 * 現在のユーザー情報と権限を取得（フロントエンド用）
 * @returns {Object} ユーザー情報
 */
function getAuthInfo() {
  const user = getCurrentUser();

  if (!user.isAuthenticated) {
    return {
      isAuthenticated: false,
      email: null,
      role: null,
      permissions: {
        canViewDashboard: false,
        canEditMaster: false,
        canManageBilling: false
      }
    };
  }

  const domainCheck = checkDomain();

  if (!domainCheck.allowed) {
    return {
      isAuthenticated: true,
      email: user.email,
      role: null,
      domainAllowed: false,
      message: domainCheck.message,
      permissions: {
        canViewDashboard: false,
        canEditMaster: false,
        canManageBilling: false
      }
    };
  }

  const role = getUserRole(user.email);
  const roleLevel = ROLE_HIERARCHY[role];

  return {
    isAuthenticated: true,
    email: user.email,
    role: role,
    domainAllowed: true,
    permissions: {
      canViewDashboard: roleLevel >= ROLE_HIERARCHY[ROLES.STAFF],
      canEditMaster: roleLevel >= ROLE_HIERARCHY[ROLES.MANAGER],
      canManageBilling: roleLevel >= ROLE_HIERARCHY[ROLES.MANAGER]
    }
  };
}

/**
 * 認証テスト
 */
function testAuth() {
  Logger.log('=== 認証テスト ===');

  const user = getCurrentUser();
  Logger.log(`現在のユーザー: ${JSON.stringify(user)}`);

  const domainCheck = checkDomain();
  Logger.log(`ドメインチェック: ${JSON.stringify(domainCheck)}`);

  if (domainCheck.allowed) {
    const role = getUserRole(domainCheck.email);
    Logger.log(`権限: ${role}`);

    const authInfo = getAuthInfo();
    Logger.log(`認証情報: ${JSON.stringify(authInfo, null, 2)}`);
  }
}

/**
 * 開発環境用の認証設定
 * gmail.com ドメインを許可し、現在のユーザーを管理者に設定
 */
function setupDevAuth() {
  // 本番環境では開発用認証設定を拒否
  if (isProductionDeployment()) {
    throw new Error('本番環境では setupDevAuth を実行できません');
  }

  const prop = PropertiesService.getScriptProperties();
  const user = Session.getActiveUser().getEmail();
  const domain = user.split('@')[1];

  prop.setProperty('ALLOWED_DOMAIN', domain);
  prop.setProperty('ADMIN_EMAILS', user);

  Logger.log('=== 開発用認証設定完了 ===');
  Logger.log(`ALLOWED_DOMAIN: ${domain}`);
  Logger.log(`ADMIN_EMAILS: ${user}`);
  Logger.log('\n再度 testAuth() を実行して確認してください');
}

/**
 * デモモードを有効化
 * 外部ユーザー（ドメイン外）でもアプリにアクセス可能にする
 */
function enableDemoMode() {
  // 本番環境ではDEMO_MODEの有効化を拒否
  if (isProductionDeployment()) {
    throw new Error('本番環境ではDEMO_MODEを有効化できません');
  }

  const prop = PropertiesService.getScriptProperties();
  prop.setProperty('DEMO_MODE', 'true');
  Logger.log('✓ デモモード有効化完了');
  Logger.log('外部ユーザーがアクセス可能になりました');
  Logger.log('※ 新しいバージョンでデプロイが必要です');
}

/**
 * デモモードを無効化
 * 通常の認証チェックに戻す
 */
function disableDemoMode() {
  const prop = PropertiesService.getScriptProperties();
  prop.deleteProperty('DEMO_MODE');
  Logger.log('✓ デモモード無効化完了');
  Logger.log('通常の認証チェックに戻りました');
}
