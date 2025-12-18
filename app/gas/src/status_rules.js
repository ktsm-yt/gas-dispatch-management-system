// File: status_rules.gs
// ステータス遷移ルール（KTSM-63）

/**
 * 案件ステータスの遷移ルール
 * key: 現在のステータス, value: 遷移可能なステータスの配列
 */
const JOB_STATUS_TRANSITIONS = {
  // 未配置 → 配置済/保留/キャンセル
  pending: ['assigned', 'hold', 'cancelled'],
  // 配置済 → 完了/保留/キャンセル/未配置（配置解除時）
  assigned: ['completed', 'hold', 'cancelled', 'pending'],
  // 保留 → 未配置/配置済/キャンセル
  hold: ['pending', 'assigned', 'cancelled'],
  // 完了 → 配置済（完了取消）
  completed: ['assigned'],
  // キャンセル → 未配置（キャンセル取消）
  cancelled: ['pending']
};

/**
 * 配置ステータスの遷移ルール
 */
const ASSIGNMENT_STATUS_TRANSITIONS = {
  // 配置済 → 確定/キャンセル
  assigned: ['confirmed', 'cancelled'],
  // 確定 → 配置済（確定取消）/キャンセル
  confirmed: ['assigned', 'cancelled'],
  // キャンセル → 配置済（キャンセル取消）
  cancelled: ['assigned']
};

/**
 * 請求ステータスの遷移ルール
 */
const INVOICE_STATUS_TRANSITIONS = {
  // 下書き → 発行済/（削除）
  draft: ['issued'],
  // 発行済 → 送付済/下書き（発行取消）
  issued: ['sent', 'draft'],
  // 送付済 → 入金済/発行済（送付取消）
  sent: ['paid', 'issued'],
  // 入金済 → 送付済（入金取消）
  paid: ['sent']
};

/**
 * 支払ステータスの遷移ルール
 */
const PAYOUT_STATUS_TRANSITIONS = {
  // 下書き → 確定
  draft: ['confirmed'],
  // 確定 → 支払済/下書き（確定取消）
  confirmed: ['paid', 'draft'],
  // 支払済 → 確定（支払取消）
  paid: ['confirmed']
};

// ============================================
// ステータス遷移チェック
// ============================================

/**
 * ステータス遷移が有効かどうかチェック
 * @param {Object} transitions - 遷移ルール
 * @param {string} fromStatus - 現在のステータス
 * @param {string} toStatus - 遷移先のステータス
 * @returns {boolean} 遷移可能ならtrue
 */
function isValidTransition_(transitions, fromStatus, toStatus) {
  if (fromStatus === toStatus) return true; // 同じステータスへの遷移は許可

  const allowedStatuses = transitions[fromStatus];
  if (!allowedStatuses) return false;

  return allowedStatuses.includes(toStatus);
}

/**
 * 案件ステータスの遷移チェック
 * @param {string} fromStatus - 現在のステータス
 * @param {string} toStatus - 遷移先のステータス
 * @throws {ValidationError} 無効な遷移の場合
 */
function validateJobStatusTransition_(fromStatus, toStatus) {
  if (!isValidTransition_(JOB_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `案件ステータスを「${getJobStatusLabel_(fromStatus)}」から「${getJobStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: JOB_STATUS_TRANSITIONS[fromStatus] }
    );
  }
}

/**
 * 配置ステータスの遷移チェック
 * @param {string} fromStatus - 現在のステータス
 * @param {string} toStatus - 遷移先のステータス
 * @throws {ValidationError} 無効な遷移の場合
 */
function validateAssignmentStatusTransition_(fromStatus, toStatus) {
  if (!isValidTransition_(ASSIGNMENT_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `配置ステータスを「${getAssignmentStatusLabel_(fromStatus)}」から「${getAssignmentStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: ASSIGNMENT_STATUS_TRANSITIONS[fromStatus] }
    );
  }
}

/**
 * 請求ステータスの遷移チェック
 * @param {string} fromStatus - 現在のステータス
 * @param {string} toStatus - 遷移先のステータス
 * @throws {ValidationError} 無効な遷移の場合
 */
function validateInvoiceStatusTransition_(fromStatus, toStatus) {
  if (!isValidTransition_(INVOICE_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `請求ステータスを「${getInvoiceStatusLabel_(fromStatus)}」から「${getInvoiceStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: INVOICE_STATUS_TRANSITIONS[fromStatus] }
    );
  }
}

/**
 * 支払ステータスの遷移チェック
 * @param {string} fromStatus - 現在のステータス
 * @param {string} toStatus - 遷移先のステータス
 * @throws {ValidationError} 無効な遷移の場合
 */
function validatePayoutStatusTransition_(fromStatus, toStatus) {
  if (!isValidTransition_(PAYOUT_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `支払ステータスを「${getPayoutStatusLabel_(fromStatus)}」から「${getPayoutStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: PAYOUT_STATUS_TRANSITIONS[fromStatus] }
    );
  }
}

// ============================================
// ステータスラベル
// ============================================

/**
 * 案件ステータスのラベルを取得
 * @param {string} status - ステータス値
 * @returns {string} 日本語ラベル
 */
function getJobStatusLabel_(status) {
  const labels = {
    pending: '未配置',
    assigned: '配置済',
    hold: '保留',
    completed: '完了',
    cancelled: 'キャンセル'
  };
  return labels[status] || status;
}

/**
 * 配置ステータスのラベルを取得
 * @param {string} status - ステータス値
 * @returns {string} 日本語ラベル
 */
function getAssignmentStatusLabel_(status) {
  const labels = {
    assigned: '配置済',
    confirmed: '確定',
    cancelled: 'キャンセル'
  };
  return labels[status] || status;
}

/**
 * 請求ステータスのラベルを取得
 * @param {string} status - ステータス値
 * @returns {string} 日本語ラベル
 */
function getInvoiceStatusLabel_(status) {
  const labels = {
    draft: '下書き',
    issued: '発行済',
    sent: '送付済',
    paid: '入金済'
  };
  return labels[status] || status;
}

/**
 * 支払ステータスのラベルを取得
 * @param {string} status - ステータス値
 * @returns {string} 日本語ラベル
 */
function getPayoutStatusLabel_(status) {
  const labels = {
    draft: '下書き',
    confirmed: '確定',
    paid: '支払済'
  };
  return labels[status] || status;
}

/**
 * 時間区分のラベルを取得
 * @param {string} timeSlot - 時間区分値
 * @returns {string} 日本語ラベル
 */
function getTimeSlotLabel_(timeSlot) {
  const labels = {
    jotou: '上棟',
    shuujitsu: '終日',
    am: 'AM',
    pm: 'PM',
    yakin: '夜勤',
    mitei: '未定'
  };
  return labels[timeSlot] || timeSlot;
}

/**
 * 作業種別のラベルを取得
 * @param {string} jobType - 作業種別値
 * @returns {string} 日本語ラベル
 */
function getJobTypeLabel_(jobType) {
  const labels = {
    tobi: '鳶',
    age: '揚げ',
    tobiage: '鳶揚げ'
  };
  return labels[jobType] || jobType;
}

// ============================================
// 案件ステータス自動更新
// ============================================

/**
 * 配置状況に基づいて案件ステータスを更新
 * @param {Object} job - 案件データ
 * @param {Object[]} assignments - 配置データの配列
 * @returns {string} 更新後のステータス
 */
function calculateJobStatus_(job, assignments) {
  // キャンセル/完了は手動変更のみ
  if (job.status === 'cancelled' || job.status === 'completed') {
    return job.status;
  }

  // 保留中は手動変更のみ
  if (job.status === 'hold') {
    return job.status;
  }

  // 有効な配置（キャンセル以外）をカウント
  const activeAssignments = assignments.filter(a =>
    a.status !== 'cancelled' && !a.is_deleted
  );

  const assignedCount = activeAssignments.length;
  const requiredCount = job.required_count || 0;

  // 配置なし → 未配置
  if (assignedCount === 0) {
    return 'pending';
  }

  // 配置あり → 配置済
  return 'assigned';
}

/**
 * 配置数と必要人数から表示用情報を生成
 * @param {number} assignedCount - 配置済み人数
 * @param {number} requiredCount - 必要人数
 * @returns {Object} { statusText, isComplete, shortage }
 */
function getAssignmentSummary_(assignedCount, requiredCount) {
  const shortage = Math.max(0, requiredCount - assignedCount);

  return {
    statusText: `${assignedCount}/${requiredCount}`,
    isComplete: assignedCount >= requiredCount,
    shortage: shortage
  };
}

// ============================================
// 編集可否判定
// ============================================

/**
 * 案件が編集可能かどうか判定
 * @param {string} status - 案件ステータス
 * @returns {boolean} 編集可能ならtrue
 */
function isJobEditable_(status) {
  // 完了・キャンセル以外は編集可能
  return status !== 'completed' && status !== 'cancelled';
}

/**
 * 請求書が編集可能かどうか判定
 * @param {string} status - 請求ステータス
 * @returns {boolean} 編集可能ならtrue
 */
function isInvoiceEditable_(status) {
  // 下書きのみ編集可能
  return status === 'draft';
}

/**
 * 請求書が削除可能かどうか判定
 * @param {string} status - 請求ステータス
 * @returns {boolean} 削除可能ならtrue
 */
function isInvoiceDeletable_(status) {
  // 下書きのみ削除可能
  return status === 'draft';
}

/**
 * 配置が編集可能かどうか判定
 * @param {string} assignmentStatus - 配置ステータス
 * @param {string} jobStatus - 案件ステータス
 * @returns {boolean} 編集可能ならtrue
 */
function isAssignmentEditable_(assignmentStatus, jobStatus) {
  // 案件が完了・キャンセルの場合は編集不可
  if (jobStatus === 'completed' || jobStatus === 'cancelled') {
    return false;
  }
  // 配置がキャンセルの場合は編集不可
  if (assignmentStatus === 'cancelled') {
    return false;
  }
  return true;
}

// ============================================
// 一括操作用
// ============================================

/**
 * 案件一括完了処理のチェック
 * @param {Object[]} jobs - 案件の配列
 * @returns {Object} { canComplete: Job[], cannotComplete: { job, reason }[] }
 */
function checkBulkJobComplete_(jobs) {
  const canComplete = [];
  const cannotComplete = [];

  jobs.forEach(job => {
    if (job.status === 'completed') {
      cannotComplete.push({ job, reason: '既に完了しています' });
    } else if (job.status === 'cancelled') {
      cannotComplete.push({ job, reason: 'キャンセル済みの案件は完了できません' });
    } else if (job.status === 'pending') {
      cannotComplete.push({ job, reason: '配置されていない案件は完了できません' });
    } else {
      canComplete.push(job);
    }
  });

  return { canComplete, cannotComplete };
}

/**
 * 請求書一括発行処理のチェック
 * @param {Object[]} invoices - 請求書の配列
 * @returns {Object} { canIssue: Invoice[], cannotIssue: { invoice, reason }[] }
 */
function checkBulkInvoiceIssue_(invoices) {
  const canIssue = [];
  const cannotIssue = [];

  invoices.forEach(invoice => {
    if (invoice.status !== 'draft') {
      cannotIssue.push({ invoice, reason: `既に${getInvoiceStatusLabel_(invoice.status)}です` });
    } else if (!invoice.total_amount || invoice.total_amount <= 0) {
      cannotIssue.push({ invoice, reason: '金額が設定されていません' });
    } else {
      canIssue.push(invoice);
    }
  });

  return { canIssue, cannotIssue };
}
