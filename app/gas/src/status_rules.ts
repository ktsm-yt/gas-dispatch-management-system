// File: status_rules.ts
// ステータス遷移ルール（KTSM-63）

const JOB_STATUS_TRANSITIONS = {
  pending: ['assigned', 'hold', 'cancelled'],
  assigned: ['hold', 'cancelled', 'pending', 'problem'],
  hold: ['pending', 'assigned', 'cancelled'],
  cancelled: ['pending'],
  problem: ['assigned', 'cancelled']
} as const;

const ASSIGNMENT_STATUS_TRANSITIONS = {
  assigned: ['confirmed', 'cancelled'],
  confirmed: ['assigned', 'cancelled'],
  cancelled: []
} as const;

const INVOICE_STATUS_TRANSITIONS = {
  unsent: ['sent', 'hold'],
  sent: ['paid', 'unpaid', 'unsent', 'hold'],
  unpaid: ['paid', 'sent', 'hold'],
  paid: ['sent', 'hold'],
  hold: ['unsent', 'sent', 'unpaid', 'paid']
} as const;

const PAYOUT_STATUS_TRANSITIONS = {
  draft: ['confirmed'],
  confirmed: ['paid', 'draft'],
  paid: ['confirmed']
} as const;

// ============================================
// ステータス遷移チェック
// ============================================

function isValidTransition_(
  transitions: Record<string, readonly string[]>,
  fromStatus: string,
  toStatus: string
): boolean {
  if (fromStatus === toStatus) return true;

  const allowedStatuses = transitions[fromStatus];
  if (!allowedStatuses) return false;

  return allowedStatuses.includes(toStatus);
}

function validateJobStatusTransition_(fromStatus: string, toStatus: string): void {
  if (!isValidTransition_(JOB_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `案件ステータスを「${getJobStatusLabel_(fromStatus)}」から「${getJobStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: JOB_STATUS_TRANSITIONS[fromStatus as JobStatus] }    );
  }
}

function validateAssignmentStatusTransition_(fromStatus: string, toStatus: string): void {
  if (!isValidTransition_(ASSIGNMENT_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `配置ステータスを「${getAssignmentStatusLabel_(fromStatus)}」から「${getAssignmentStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: ASSIGNMENT_STATUS_TRANSITIONS[fromStatus as AssignmentStatus] }    );
  }
}

function validateInvoiceStatusTransition_(fromStatus: string, toStatus: string): void {
  if (!isValidTransition_(INVOICE_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `請求ステータスを「${getInvoiceStatusLabel_(fromStatus)}」から「${getInvoiceStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: INVOICE_STATUS_TRANSITIONS[fromStatus as InvoiceStatus] }    );
  }
}

function validatePayoutStatusTransition_(fromStatus: string, toStatus: string): void {
  if (!isValidTransition_(PAYOUT_STATUS_TRANSITIONS, fromStatus, toStatus)) {
    throw new ValidationError(
      `支払ステータスを「${getPayoutStatusLabel_(fromStatus)}」から「${getPayoutStatusLabel_(toStatus)}」に変更できません`,
      { fromStatus, toStatus, allowedStatuses: PAYOUT_STATUS_TRANSITIONS[fromStatus as PayoutStatus] }    );
  }
}

// ============================================
// ステータスラベル
// ============================================

function getJobStatusLabel_(status: string): string {
  const labels: Record<string, string> = {
    pending: '未配置',
    assigned: '配置済',
    hold: '保留',
    cancelled: 'キャンセル',
    problem: '問題あり'
  };
  return labels[status] || status;
}

function getAssignmentStatusLabel_(status: string): string {
  const labels: Record<string, string> = {
    assigned: '配置済',
    confirmed: '確定',
    cancelled: 'キャンセル'
  };
  return labels[status] || status;
}

function getInvoiceStatusLabel_(status: string): string {
  const labels: Record<string, string> = {
    unsent: '未送付',
    sent: '送付済',
    unpaid: '未回収',
    paid: '入金済',
    hold: '保留',
    draft: '未送付',
    issued: '未送付'
  };
  return labels[status] || status;
}

function getPayoutStatusLabel_(status: string): string {
  const labels: Record<string, string> = {
    draft: '下書き',
    confirmed: '確定',
    paid: '支払済'
  };
  return labels[status] || status;
}

function getTimeSlotLabel_(timeSlot: string): string {
  const labels: Record<string, string> = {
    jotou: '上棟',
    shuujitsu: '終日',
    am: 'AM',
    pm: 'PM',
    yakin: '夜勤',
    mitei: '未定'
  };
  return labels[timeSlot] || timeSlot;
}

// ============================================
// 案件ステータス自動更新
// ============================================

function calculateJobStatus_(
  job: { status: string; required_count?: number },
  assignments: { status: string; is_deleted?: boolean }[]
): string {
  // キャンセル/問題ありは手動変更のみ
  if (job.status === 'cancelled' || job.status === 'problem') {
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

  // 配置なし → 未配置
  if (assignedCount === 0) {
    return 'pending';
  }

  // 配置あり → 配置済
  return 'assigned';
}

function getAssignmentSummary_(assignedCount: number, requiredCount: number): AssignmentSummary {
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

function isJobEditable_(status: string): boolean {
  return status !== 'cancelled';
}

function isInvoiceEditable_(status: string): boolean {
  return status === 'unsent' || status === 'hold' || status === 'draft' || status === 'issued';
}

// ============================================
// 一括操作用
// ============================================

function checkBulkInvoiceIssue_(
  invoices: { status: string; total_amount?: number }[]
): BulkInvoiceCheckResult {
  const canIssue: Record<string, unknown>[] = [];
  const cannotIssue: { invoice: Record<string, unknown>; reason: string }[] = [];

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
