/**
 * Assignment UI Functions
 *
 * 配置管理画面のUI操作用関数
 */

/**
 * 配置管理モーダルを開く
 * @param {string} jobId - 案件ID
 */
function openAssignmentModal(jobId) {
  const modal = document.getElementById('assignment-modal');
  const backdrop = document.getElementById('modal-backdrop');

  if (!modal || !backdrop) {
    console.error('Assignment modal elements not found');
    return;
  }

  // モーダルを表示
  modal.style.display = 'block';
  backdrop.style.display = 'block';

  // データを読み込み
  loadAssignmentData(jobId);
}

/**
 * 配置管理モーダルを閉じる
 */
function closeAssignmentModal() {
  const modal = document.getElementById('assignment-modal');
  const backdrop = document.getElementById('modal-backdrop');

  if (modal) modal.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';

  // 状態をクリア
  window.currentJobId = null;
  window.currentJobUpdatedAt = null;
  window.pendingChanges = { upserts: [], deletes: [] };
}

/**
 * 配置データを読み込む
 * @param {string} jobId - 案件ID
 */
function loadAssignmentData(jobId) {
  showLoading('assignment-loading');

  google.script.run
    .withSuccessHandler(function(response) {
      hideLoading('assignment-loading');

      if (response.ok) {
        window.currentJobId = jobId;
        window.currentJobUpdatedAt = response.data.job.updated_at;
        window.pendingChanges = { upserts: [], deletes: [] };

        renderAssignmentModal(response.data);
      } else {
        showError(response.error.message);
      }
    })
    .withFailureHandler(function(error) {
      hideLoading('assignment-loading');
      showError('データの読み込みに失敗しました: ' + error.message);
    })
    .getAssignments(jobId);
}

/**
 * 配置モーダルをレンダリング
 * @param {Object} data - { job, assignments }
 */
function renderAssignmentModal(data) {
  const job = data.job;
  const assignments = data.assignments;

  // ヘッダー情報を更新
  document.getElementById('assignment-job-name').textContent = job.site_name;
  document.getElementById('assignment-job-date').textContent = formatDate(job.work_date);
  document.getElementById('assignment-job-time').textContent = formatTimeSlot(job.time_slot);
  document.getElementById('assignment-job-type').textContent = formatJobType(job.job_type);

  // 必要人数と配置済み人数を更新
  const assignedCount = assignments.filter(a => a.status !== 'CANCELLED').length;
  const requiredCount = Number(job.required_count) || 0;
  const shortage = requiredCount - assignedCount;

  document.getElementById('assignment-required').textContent = requiredCount + '名';
  document.getElementById('assignment-assigned').textContent = assignedCount + '名';

  const shortageEl = document.getElementById('assignment-shortage');
  if (shortage > 0) {
    shortageEl.textContent = '不足 ' + shortage + '名';
    shortageEl.className = 'shortage-badge negative';
  } else if (shortage < 0) {
    shortageEl.textContent = '超過 ' + Math.abs(shortage) + '名';
    shortageEl.className = 'shortage-badge positive';
  } else {
    shortageEl.textContent = '充足';
    shortageEl.className = 'shortage-badge ok';
  }

  // 配置リストをレンダリング
  renderAssignmentList(assignments);

  // スタッフ一覧を読み込み
  loadAvailableStaff(job.job_id, job.job_type);
}

/**
 * 配置リストをレンダリング
 * @param {Object[]} assignments - 配置配列
 */
function renderAssignmentList(assignments) {
  const container = document.getElementById('assignment-list');
  container.innerHTML = '';

  if (assignments.length === 0) {
    container.innerHTML = '<div class="empty-state">配置されたスタッフはいません</div>';
    return;
  }

  const validAssignments = assignments.filter(a => a.status !== 'CANCELLED');

  validAssignments.forEach(function(assignment) {
    const item = createAssignmentItem(assignment);
    container.appendChild(item);
  });
}

/**
 * 配置アイテムを作成
 * @param {Object} assignment - 配置データ
 * @returns {HTMLElement} 配置アイテム要素
 */
function createAssignmentItem(assignment) {
  const item = document.createElement('div');
  item.className = 'assignment-item';
  item.dataset.assignmentId = assignment.assignment_id;

  item.innerHTML = `
    <div class="assignment-item-main">
      <div class="assignment-staff-info">
        <span class="staff-name">${escapeHtml(assignment.staff_name)}</span>
        <span class="staff-type ${assignment.worker_type.toLowerCase()}">${formatWorkerType(assignment.worker_type)}</span>
      </div>
      <div class="assignment-details">
        <span class="detail-item">
          <label>給与:</label>
          <span>${formatPayUnit(assignment.pay_unit)}</span>
        </span>
        <span class="detail-item">
          <label>交通費:</label>
          <span>${formatTransportFee(assignment.transport_area, assignment.transport_amount)}</span>
        </span>
      </div>
    </div>
    <div class="assignment-item-actions">
      <button class="btn-icon btn-edit" onclick="editAssignment('${assignment.assignment_id}')" title="編集">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn-icon btn-delete" onclick="removeAssignment('${assignment.assignment_id}')" title="削除">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `;

  return item;
}

/**
 * 利用可能なスタッフ一覧を読み込み
 * @param {string} jobId - 案件ID
 * @param {string} jobType - 作業種別
 */
function loadAvailableStaff(jobId, jobType) {
  google.script.run
    .withSuccessHandler(function(response) {
      if (response.ok) {
        renderStaffSelector(response.data.staff, jobType);
      }
    })
    .withFailureHandler(function(error) {
      console.error('Failed to load staff:', error);
    })
    .getAvailableStaff({
      jobId: jobId,
      excludeAssigned: true
    });
}

/**
 * スタッフ選択リストをレンダリング
 * @param {Object[]} staff - スタッフ配列
 * @param {string} jobType - 作業種別
 */
function renderStaffSelector(staff, jobType) {
  const container = document.getElementById('staff-selector-list');
  container.innerHTML = '';

  if (staff.length === 0) {
    container.innerHTML = '<div class="empty-state">配置可能なスタッフがいません</div>';
    return;
  }

  staff.forEach(function(s) {
    const item = createStaffSelectorItem(s, jobType);
    container.appendChild(item);
  });
}

/**
 * スタッフ選択アイテムを作成
 * @param {Object} staff - スタッフデータ
 * @param {string} jobType - 作業種別
 * @returns {HTMLElement} スタッフ選択アイテム要素
 */
function createStaffSelectorItem(staff, jobType) {
  const item = document.createElement('div');
  item.className = 'staff-selector-item';
  item.dataset.staffId = staff.staff_id;

  // スキルに応じたハイライト
  const hasMatchingSkill = staff.skills && staff.skills.includes(jobType);

  item.innerHTML = `
    <div class="staff-selector-info">
      <span class="staff-name">${escapeHtml(staff.name)}</span>
      <span class="staff-type ${staff.staff_type}">${staff.staff_type === 'subcontract' ? '外注' : '自社'}</span>
      ${hasMatchingSkill ? '<span class="skill-match">適合</span>' : ''}
    </div>
    <div class="staff-selector-meta">
      <span class="staff-skills">${escapeHtml(staff.skills || '-')}</span>
      ${staff.has_motorbike ? '<span class="badge-bike">バイク有</span>' : ''}
    </div>
    <button class="btn-add-staff" onclick="addStaffToJob('${staff.staff_id}', '${escapeHtml(staff.name)}')" title="配置追加">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;

  return item;
}

/**
 * スタッフを案件に追加
 * @param {string} staffId - スタッフID
 * @param {string} staffName - スタッフ名
 */
function addStaffToJob(staffId, staffName) {
  // 配置追加フォームを表示
  showAddAssignmentForm(staffId, staffName);
}

/**
 * 配置追加フォームを表示
 * @param {string} staffId - スタッフID
 * @param {string} staffName - スタッフ名
 */
function showAddAssignmentForm(staffId, staffName) {
  const form = document.getElementById('assignment-form');
  const formTitle = document.getElementById('assignment-form-title');

  formTitle.textContent = staffName + ' を配置';

  // フォームをリセット
  form.reset();
  document.getElementById('form-staff-id').value = staffId;
  document.getElementById('form-assignment-id').value = '';

  // 交通費エリア選択肢を読み込み
  loadTransportAreas();

  // フォームを表示
  document.getElementById('assignment-form-container').style.display = 'block';
}

/**
 * 配置編集フォームを表示
 * @param {string} assignmentId - 配置ID
 */
function editAssignment(assignmentId) {
  // 配置データを取得して編集フォームに表示
  google.script.run
    .withSuccessHandler(function(response) {
      if (response.ok) {
        showEditAssignmentForm(response.data);
      }
    })
    .withFailureHandler(function(error) {
      showError('データの取得に失敗しました');
    })
    .getAssignments(window.currentJobId);
}

/**
 * 配置編集フォームを表示
 * @param {Object} data - { job, assignments }
 */
function showEditAssignmentForm(data) {
  // 該当の配置を探す
  const assignment = data.assignments.find(a => a.assignment_id === window.editingAssignmentId);
  if (!assignment) {
    showError('配置データが見つかりません');
    return;
  }

  const form = document.getElementById('assignment-form');
  const formTitle = document.getElementById('assignment-form-title');

  formTitle.textContent = assignment.staff_name + ' の配置を編集';

  // フォームに値をセット
  document.getElementById('form-staff-id').value = assignment.staff_id;
  document.getElementById('form-assignment-id').value = assignment.assignment_id;
  document.getElementById('form-pay-unit').value = assignment.pay_unit;
  document.getElementById('form-invoice-unit').value = assignment.invoice_unit;
  document.getElementById('form-transport-area').value = assignment.transport_area || '';
  document.getElementById('form-transport-amount').value = assignment.transport_amount || '';
  document.getElementById('form-transport-manual').checked = assignment.transport_is_manual || false;

  // 交通費エリア選択肢を読み込み
  loadTransportAreas();

  // フォームを表示
  document.getElementById('assignment-form-container').style.display = 'block';
}

/**
 * 交通費エリア選択肢を読み込み
 */
function loadTransportAreas() {
  google.script.run
    .withSuccessHandler(function(response) {
      if (response.ok) {
        const select = document.getElementById('form-transport-area');
        select.innerHTML = '<option value="">選択してください</option>';

        response.data.areas.forEach(function(area) {
          const option = document.createElement('option');
          option.value = area.area_code;
          option.textContent = area.area_name + ' (' + area.default_fee + '円)';
          select.appendChild(option);
        });
      }
    })
    .getTransportFeeAreas();
}

/**
 * 配置フォームを送信
 */
function submitAssignmentForm() {
  const staffId = document.getElementById('form-staff-id').value;
  const assignmentId = document.getElementById('form-assignment-id').value;
  const payUnit = document.getElementById('form-pay-unit').value;
  const invoiceUnit = document.getElementById('form-invoice-unit').value;
  const transportArea = document.getElementById('form-transport-area').value;
  const transportAmount = document.getElementById('form-transport-amount').value;
  const transportManual = document.getElementById('form-transport-manual').checked;

  if (!payUnit || !invoiceUnit) {
    showError('給与区分と請求区分は必須です');
    return;
  }

  const assignmentData = {
    staff_id: staffId,
    pay_unit: payUnit,
    invoice_unit: invoiceUnit,
    transport_area: transportArea,
    transport_amount: transportAmount ? Number(transportAmount) : '',
    transport_is_manual: transportManual
  };

  if (assignmentId) {
    assignmentData.assignment_id = assignmentId;
  }

  // 変更を適用
  window.pendingChanges.upserts.push(assignmentData);

  // フォームを閉じる
  hideAssignmentForm();

  // 保存を実行
  saveAssignmentChanges();
}

/**
 * 配置フォームを閉じる
 */
function hideAssignmentForm() {
  document.getElementById('assignment-form-container').style.display = 'none';
}

/**
 * 配置を削除
 * @param {string} assignmentId - 配置ID
 */
function removeAssignment(assignmentId) {
  if (!confirm('この配置を削除しますか？')) {
    return;
  }

  window.pendingChanges.deletes.push(assignmentId);
  saveAssignmentChanges();
}

/**
 * 配置変更を保存
 */
function saveAssignmentChanges() {
  if (window.pendingChanges.upserts.length === 0 && window.pendingChanges.deletes.length === 0) {
    return;
  }

  showLoading('assignment-loading');

  google.script.run
    .withSuccessHandler(function(response) {
      hideLoading('assignment-loading');

      if (response.ok) {
        showSuccess('保存しました');

        // 状態を更新
        window.currentJobUpdatedAt = response.data.job.updated_at;
        window.pendingChanges = { upserts: [], deletes: [] };

        // リストを更新
        renderAssignmentList(response.data.assignments);

        // スタッフ一覧を再読み込み
        loadAvailableStaff(window.currentJobId, null);

        // ダッシュボードも更新（親画面）
        if (typeof refreshDashboard === 'function') {
          refreshDashboard();
        }
      } else {
        if (response.error.code === 'CONFLICT_ERROR') {
          showError('他のユーザーが変更を行いました。画面を更新してください。');
          loadAssignmentData(window.currentJobId);
        } else {
          showError(response.error.message);
        }
      }
    })
    .withFailureHandler(function(error) {
      hideLoading('assignment-loading');
      showError('保存に失敗しました: ' + error.message);
    })
    .saveAssignments(window.currentJobId, window.pendingChanges, window.currentJobUpdatedAt);
}

// ========================================
// ヘルパー関数
// ========================================

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatTimeSlot(slot) {
  const slots = {
    'jotou': '上棟',
    'shuujitsu': '終日',
    'am': 'AM',
    'pm': 'PM',
    'yakin': '夜勤',
    'mitei': '未定'
  };
  return slots[slot] || slot;
}

function formatJobType(type) {
  const types = {
    '鳶': '鳶',
    '揚げ': '揚げ',
    '鳶揚げ': '鳶揚げ'
  };
  return types[type] || type;
}

function formatWorkerType(type) {
  return type === 'SUBCONTRACT' ? '外注' : '自社';
}

function formatPayUnit(unit) {
  const units = {
    'FULLDAY': '終日',
    'HALFDAY': '半日',
    'HOURLY': '時給'
  };
  return units[unit] || unit;
}

function formatTransportFee(area, amount) {
  if (!area && !amount) return '-';
  if (amount) return amount.toLocaleString() + '円';
  return area || '-';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showLoading(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.style.display = 'flex';
}

function hideLoading(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.style.display = 'none';
}

function showError(message) {
  // トースト表示（実装は親HTMLに依存）
  if (typeof showToast === 'function') {
    showToast(message, 'error');
  } else {
    alert(message);
  }
}

function showSuccess(message) {
  if (typeof showToast === 'function') {
    showToast(message, 'success');
  }
}
