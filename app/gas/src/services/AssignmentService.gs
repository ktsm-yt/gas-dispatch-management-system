/**
 * Assignment Service
 *
 * 配置管理のビジネスロジック
 */

const AssignmentService = {

  /**
   * 案件の配置一覧を取得
   * @param {string} jobId - 案件ID
   * @returns {Object} { assignments: Object[], job: Object }
   */
  getAssignmentsByJobId: function(jobId) {
    const job = JobRepository.findById(jobId);
    if (!job) {
      throw new Error('案件が見つかりません');
    }

    const assignments = AssignmentRepository.findByJobId(jobId);

    // スタッフ情報を一括取得してキャッシュ
    const staffCache = this._buildStaffCache();

    // スタッフ情報を付加
    const enrichedAssignments = assignments.map(a => {
      const staff = staffCache[a.staff_id];
      return {
        ...a,
        staff_name: staff ? staff.name : '（削除済み）',
        staff_phone: staff ? staff.phone : ''
      };
    });

    return {
      job: job,
      assignments: enrichedAssignments
    };
  },

  /**
   * 配置を保存（差分更新）
   * @param {string} jobId - 案件ID
   * @param {Object} changes - 変更内容
   * @param {Object[]} changes.upserts - 追加/更新する配置
   * @param {string[]} changes.deletes - 削除する配置ID
   * @param {string} expectedUpdatedAt - 期待する案件のupdated_at
   * @returns {Object} 保存結果
   */
  saveAssignments: function(jobId, changes, expectedUpdatedAt) {
    const requestId = generateRequestId();

    // ロック取得
    const lock = acquireLock(3000);
    if (!lock) {
      return buildErrorResponse(
        ERROR_CODES.BUSY_ERROR,
        '現在混み合っています。しばらく待ってから再度お試しください。',
        {},
        requestId
      );
    }

    try {
      // 案件の存在確認と楽観ロックチェック
      const job = JobRepository.findById(jobId);
      if (!job) {
        return buildErrorResponse(
          ERROR_CODES.NOT_FOUND,
          '案件が見つかりません',
          { jobId: jobId },
          requestId
        );
      }

      // 楽観ロックチェック（案件のupdated_atで判定）
      if (expectedUpdatedAt && job.updated_at !== expectedUpdatedAt) {
        return buildErrorResponse(
          ERROR_CODES.CONFLICT_ERROR,
          '他のユーザーが変更を行いました。画面を更新してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt,
            currentUpdatedAt: job.updated_at
          },
          requestId
        );
      }

      // 既存配置を1回だけ読み込み、重複チェック用Mapを構築（N回のDB読み込みを1回に削減）
      const existingAssignments = AssignmentRepository.findByJobId(jobId);
      const existingStaffMap = new Map();
      existingAssignments
        .filter(a => a.status !== 'CANCELLED')
        .forEach(a => existingStaffMap.set(a.staff_id, a.assignment_id));

      const results = {
        inserted: [],
        updated: [],
        deleted: []
      };

      const auditLogs = [];
      const toInsert = [];
      const toUpdate = [];
      const pendingStaffIds = new Set();

      // 削除処理（一括）
      if (changes.deletes && changes.deletes.length > 0) {
        const deleteResult = AssignmentRepository.bulkSoftDelete(changes.deletes);
        if (deleteResult.deleted > 0) {
          for (const result of deleteResult.results) {
            results.deleted.push(result.assignmentId);
            auditLogs.push({
              action: 'DELETE',
              table_name: 'T_JobAssignments',
              record_id: result.assignmentId,
              before: result.before,
              after: result.after
            });
            // 削除されたスタッフをMapから除去（同一リクエスト内で再追加を許可）
            if (result.before?.staff_id) {
              existingStaffMap.delete(result.before.staff_id);
            }
          }
        }
      }

      // 追加/更新処理
      if (changes.upserts && changes.upserts.length > 0) {
        for (const assignment of changes.upserts) {
          // slot_id検証とpay_unit同期
          if (assignment.slot_id) {
            // スロットが指定されている場合、検証を行う
            const slot = SlotRepository.findById(assignment.slot_id);

            if (!slot) {
              // スロットが存在しない
              Logger.log(`Warning: slot_id ${assignment.slot_id} not found for assignment`);
              continue; // この配置をスキップ
            }

            if (slot.job_id !== jobId) {
              // スロットが別の案件に属している - セキュリティリスク
              Logger.log(`Error: slot_id ${assignment.slot_id} belongs to job ${slot.job_id}, not ${jobId}`);
              continue; // この配置をスキップ
            }

            // スロットのpay_unitで上書き（データ整合性）
            assignment.invoice_unit = slot.slot_pay_unit;
            assignment.pay_unit = slot.slot_pay_unit;
          } else {
            // スロット指定なし - 従来通りinvoice_unitを使用
            // invoice_unit を小文字に正規化（UI互換性のため）
            if (assignment.invoice_unit) {
              assignment.invoice_unit = String(assignment.invoice_unit).toLowerCase().trim();
            }

            // pay_unit = invoice_unit で強制同期（搾取防止）
            // 請求区分と給与区分は常に一致させる
            assignment.pay_unit = assignment.invoice_unit;
          }

          // 単価オーバーライドは無効化（常にマスタ参照）
          // 調整が必要な場合は支払画面/請求画面の調整額を使用
          assignment.wage_rate = null;
          assignment.invoice_rate = null;

          // バリデーション
          const validation = this._validateAssignment(assignment);
          if (!validation.valid) {
            continue; // スキップまたはエラーを蓄積
          }

          // 交通費の自動計算
          const processedAssignment = this._processTransportFee(assignment);

          if (processedAssignment.assignment_id) {
            // 更新対象を収集（後で一括処理）
            const existing = AssignmentRepository.findById(processedAssignment.assignment_id);
            if (existing) {
              toUpdate.push(processedAssignment);
            }
          } else {
            // 新規作成
            // 重複チェック
            const effectiveStatus = processedAssignment.status || 'ASSIGNED';
            if (effectiveStatus !== 'CANCELLED' && pendingStaffIds.has(processedAssignment.staff_id)) {
              continue; // 同一リクエスト内の重複はスキップ
            }

            if (existingStaffMap.has(processedAssignment.staff_id)) {
              continue; // 重複はスキップ（Mapルックアップ、DBアクセス不要）
            }

            processedAssignment.job_id = jobId;
            toInsert.push(processedAssignment);
            if (effectiveStatus !== 'CANCELLED') {
              pendingStaffIds.add(processedAssignment.staff_id);
            }
          }
        }
      }

      // 追加処理（一括挿入）
      if (toInsert.length > 0) {
        const insertedAssignments = AssignmentRepository.bulkInsert(toInsert);
        results.inserted.push(...insertedAssignments);
        for (const newAssignment of insertedAssignments) {
          auditLogs.push({
            action: 'CREATE',
            table_name: 'T_JobAssignments',
            record_id: newAssignment.assignment_id,
            before: null,
            after: newAssignment
          });
        }
      }

      // 更新処理（一括更新）
      if (toUpdate.length > 0) {
        const updateResult = AssignmentRepository.bulkUpdate(toUpdate);
        if (updateResult.updated > 0) {
          for (const result of updateResult.results) {
            results.updated.push(result.after);
            auditLogs.push({
              action: 'UPDATE',
              table_name: 'T_JobAssignments',
              record_id: result.assignmentId,
              before: result.before,
              after: result.after
            });
          }
        }
      }

      // 案件のupdated_atを更新（配置変更検知用）
      const jobUpdateResult = JobRepository.update(
        { job_id: jobId },
        expectedUpdatedAt
      );

      // 更新後の配置一覧を取得（1回だけ。ステータス計算・スロット・レスポンスで共用）
      const updatedAssignments = AssignmentRepository.findByJobId(jobId);
      const activeCount = updatedAssignments.filter(a => a.status !== 'CANCELLED').length;

      // 更新後の案件を取得（updated_atが更新済み）
      // ステータス変更判定 + 楽観ロック + レスポンス用に共用
      const updatedJob = JobRepository.findById(jobId);

      // 案件のステータス更新（プリロードデータで再取得を省略）
      this._updateJobStatus(jobId, { job: updatedJob, assignedCount: activeCount });

      // 監査ログの記録
      if (auditLogs.length > 0) {
        logBatch(auditLogs);
      }

      // スタッフ情報を付加
      const staffCache = this._buildStaffCache();
      const enrichedAssignments = updatedAssignments.map(a => {
        const staff = staffCache[a.staff_id];
        return {
          ...a,
          staff_name: staff ? staff.name : '（削除済み）',
          staff_phone: staff ? staff.phone : ''
        };
      });

      // スロット情報を取得（1回だけ）
      const slotsData = SlotService.getSlotsByJobId(jobId);
      const slots = slotsData.slots || [];

      // スロット充足状況を取得（プリロードデータで再取得を省略）
      let slotStatus = null;
      if (slots.length > 0) {
        slotStatus = SlotService.getSlotStatus(jobId, {
          slots: slots,
          assignments: updatedAssignments
        });
      }

      return buildSuccessResponse({
        assignments: enrichedAssignments,
        inserted: results.inserted.length,
        updated: results.updated.length,
        deleted: results.deleted.length,
        job: updatedJob,
        slots: slots,
        slotStatus: slotStatus
      }, requestId);

    } catch (e) {
      logErr('saveAssignments', e);
      return buildErrorResponse(
        ERROR_CODES.SYSTEM_ERROR,
        'システムエラーが発生しました',
        { message: e.message },
        requestId
      );
    } finally {
      releaseLock(lock);
    }
  },

  /**
   * 配置情報を取得（単体）
   * @param {string} assignmentId - 配置ID
   * @returns {Object} 配置情報
   */
  getAssignment: function(assignmentId) {
    const assignment = AssignmentRepository.findById(assignmentId);
    if (!assignment) {
      return null;
    }

    // スタッフ情報を付加
    const staff = this._getStaffInfo(assignment.staff_id);
    return {
      ...assignment,
      staff_name: staff ? staff.name : '（削除済み）',
      staff_phone: staff ? staff.phone : ''
    };
  },

  /**
   * 案件の過不足を計算
   * @param {string} jobId - 案件ID
   * @returns {Object} { required: number, assigned: number, shortage: number }
   */
  getShortage: function(jobId) {
    const job = JobRepository.findById(jobId);
    if (!job) {
      return { required: 0, assigned: 0, shortage: 0 };
    }

    const assignedCount = AssignmentRepository.countByJobId(jobId);
    const requiredCount = Number(job.required_count) || 0;

    return {
      required: requiredCount,
      assigned: assignedCount,
      shortage: requiredCount - assignedCount
    };
  },

  /**
   * 日付ごとの過不足サマリーを取得
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object} 時間区分ごとの過不足
   */
  getShortageByDate: function(date) {
    const jobs = JobRepository.findByDate(date);

    const summary = {
      jotou: { required: 0, assigned: 0, shortage: 0 },
      shuujitsu: { required: 0, assigned: 0, shortage: 0 },
      am: { required: 0, assigned: 0, shortage: 0 },
      pm: { required: 0, assigned: 0, shortage: 0 },
      yakin: { required: 0, assigned: 0, shortage: 0 },
      mitei: { required: 0, assigned: 0, shortage: 0 },
      total: { required: 0, assigned: 0, shortage: 0 }
    };

    for (const job of jobs) {
      if (job.status === 'cancelled') {
        continue;
      }

      const slot = job.time_slot;
      const shortage = this.getShortage(job.job_id);

      if (summary[slot]) {
        summary[slot].required += shortage.required;
        summary[slot].assigned += shortage.assigned;
        summary[slot].shortage += shortage.shortage;
      }

      summary.total.required += shortage.required;
      summary.total.assigned += shortage.assigned;
      summary.total.shortage += shortage.shortage;
    }

    return summary;
  },

  /**
   * スタッフの配置可能性をチェック
   * @param {string} staffId - スタッフID
   * @param {string} jobId - 案件ID
   * @returns {Object} { available: boolean, reason?: string }
   */
  checkStaffAvailability: function(staffId, jobId) {
    const job = JobRepository.findById(jobId);
    if (!job) {
      return { available: false, reason: '案件が見つかりません' };
    }

    // 同一案件への重複配置チェック
    if (AssignmentRepository.checkDuplicateAssignment(staffId, jobId)) {
      return { available: false, reason: 'このスタッフは既に配置済みです' };
    }

    // スタッフのNG顧客チェック
    const staff = this._getStaffInfo(staffId);
    if (staff && staff.ng_customers) {
      const ngCustomers = staff.ng_customers.split(',').map(c => c.trim());
      if (ngCustomers.includes(job.customer_id)) {
        return { available: false, reason: 'NG顧客のため配置できません' };
      }
    }

    // 同一日の他案件への配置状況をチェック（時間帯の重複）
    const sameTimeAssignments = this._getConflictingAssignments(staffId, job);
    if (sameTimeAssignments.length > 0) {
      return {
        available: false,
        reason: `同じ時間帯に別の案件「${sameTimeAssignments[0].site_name}」に配置されています`
      };
    }

    return { available: true };
  },

  /**
   * 配置のバリデーション
   * @private
   * Note: pay_unit は invoice_unit から自動設定されるため、
   *       invoice_unit のみ必須チェック
   * Note: display_time_slot はダッシュボード表示用（ADR-003参照）
   */
  _validateAssignment: function(assignment) {
    const required = ['staff_id', 'invoice_unit', 'display_time_slot'];
    const validation = validateRequired(assignment, required);

    if (!validation.valid) {
      return {
        valid: false,
        errors: validation.missing.map(f => `${f}は必須です`)
      };
    }

    return { valid: true };
  },

  /**
   * 交通費の自動計算
   * @private
   */
  _processTransportFee: function(assignment) {
    const processed = { ...assignment };

    // 手入力フラグがtrueの場合は何もしない
    if (processed.transport_is_manual === true) {
      return processed;
    }

    // エリアが指定されていて、金額が未設定の場合は自動計算
    if (processed.transport_area && !processed.transport_amount) {
      const fee = this._getTransportFeeByArea(processed.transport_area);
      if (fee) {
        processed.transport_amount = fee.default_fee;
        processed.transport_is_manual = false;
      }
    }

    // エリアが未設定の場合の処理
    // ただし、駅名または金額が手入力されている場合はクリアしない
    if (!processed.transport_area) {
      const hasStation = processed.transport_station && String(processed.transport_station).trim() !== '';
      const hasManualAmount = processed.transport_amount && Number(processed.transport_amount) > 0;

      if (!hasStation && !hasManualAmount) {
        // 駅名も金額もない場合のみクリア
        processed.transport_amount = '';
        processed.transport_is_manual = false;
      }
    }

    return processed;
  },

  /**
   * 交通費マスターからエリア情報を取得
   * MasterCache経由でO(1)アクセス
   * @private
   */
  _getTransportFeeByArea: function(areaCode) {
    try {
      const feeMap = MasterCache.getTransportFeeMap();
      return feeMap[areaCode] || null;
    } catch (e) {
      logErr('getTransportFeeByArea', e);
      return null;
    }
  },

  /**
   * スタッフ情報を取得
   * @private
   */
  _getStaffInfo: function(staffId) {
    try {
      return getRecordById('M_Staff', 'staff_id', staffId);
    } catch (e) {
      logErr('getStaffInfo', e);
      return null;
    }
  },

  /**
   * スタッフ情報のキャッシュを構築（パフォーマンス最適化）
   * @private
   * @returns {Object} staff_id をキーとしたスタッフ情報のマップ
   */
  _buildStaffCache: function() {
    try {
      const allStaff = getAllRecords('M_Staff');
      const cache = {};
      for (const staff of allStaff) {
        cache[staff.staff_id] = staff;
      }
      return cache;
    } catch (e) {
      logErr('buildStaffCache', e);
      return {};
    }
  },

  /**
   * 案件ステータスを更新（配置数に応じて）
   * @private
   * @param {string} jobId - 案件ID
   * @param {Object} [preloadedData] - プリロード済みデータ（省略時はDB取得）
   * @param {Object} [preloadedData.job] - 案件データ
   * @param {number} [preloadedData.assignedCount] - 配置済み数
   */
  _updateJobStatus: function(jobId, preloadedData) {
    const job = preloadedData?.job || JobRepository.findById(jobId);
    if (!job || job.status === 'cancelled') {
      return;
    }

    const requiredCount = Number(job.required_count) || 0;
    let assignedCount;
    if (preloadedData?.assignedCount != null) {
      assignedCount = preloadedData.assignedCount;
    } else {
      assignedCount = AssignmentRepository.countByJobId(jobId);
    }

    let newStatus = job.status;

    if (assignedCount === 0) {
      newStatus = 'pending';
    } else if (assignedCount >= requiredCount) {
      newStatus = 'assigned';
    } else {
      newStatus = 'pending';
    }

    if (newStatus !== job.status) {
      JobRepository.update({ job_id: jobId, status: newStatus }, job.updated_at);
      // プリロードオブジェクトにも反映（レスポンス用）
      job.status = newStatus;
    }
  },

  /**
   * 時間帯が重複する配置を取得（最適化版）
   * @private
   */
  _getConflictingAssignments: function(staffId, targetJob) {
    // 同日の案件と配置を一括取得
    const sameDayJobs = JobRepository.findByDate(targetJob.work_date);
    const sameDayAssignments = AssignmentRepository.findByDate(targetJob.work_date);

    // 配置をjob_idでグループ化（メモリ上で1回だけ）
    const assignmentsByJob = {};
    for (const a of sameDayAssignments) {
      if (!assignmentsByJob[a.job_id]) {
        assignmentsByJob[a.job_id] = [];
      }
      assignmentsByJob[a.job_id].push(a);
    }

    const conflicting = [];

    for (const job of sameDayJobs) {
      if (job.job_id === targetJob.job_id) {
        continue;
      }

      // 時間帯の重複をチェック
      if (this._isTimeSlotConflict(targetJob.time_slot, job.time_slot)) {
        // このスタッフがこの案件に配置されているか（キャッシュから検索）
        const jobAssignments = assignmentsByJob[job.job_id] || [];
        const assigned = jobAssignments.find(a =>
          a.staff_id === staffId && a.status !== 'CANCELLED'
        );

        if (assigned) {
          conflicting.push({
            ...assigned,
            site_name: job.site_name
          });
        }
      }
    }

    return conflicting;
  },

  /**
   * 時間帯の重複チェック（旧版 - 後方互換用）
   * @private
   * @deprecated _isTimeSlotConflictWithStartTime を使用してください
   */
  _isTimeSlotConflict: function(slot1, slot2) {
    // 終日・上棟は他の全てと重複
    const fullDaySlots = ['shuujitsu', 'jotou'];
    if (fullDaySlots.includes(slot1) || fullDaySlots.includes(slot2)) {
      return true;
    }

    // AM同士、PM同士は重複
    if (slot1 === slot2) {
      return true;
    }

    // 夜勤は日勤と重複しない
    if ((slot1 === 'yakin' && slot2 !== 'yakin') ||
        (slot2 === 'yakin' && slot1 !== 'yakin')) {
      return false;
    }

    return false;
  },

  /**
   * 時間帯の重複チェック（start_time考慮版）
   * @param {Object} job1 - 案件1 {time_slot, start_time}
   * @param {Object} job2 - 案件2 {time_slot, start_time}
   * @returns {boolean} 競合する場合true
   *
   * ルール:
   * - jotou/shuujitsu vs 任意 → 競合
   * - yakin vs yakin → 競合
   * - yakin vs 日勤(am/pm/mitei) → 競合なし
   * - 同じtime_slot + 同じstart_time → 競合
   * - 同じtime_slot + 異なるstart_time → 競合なし
   * - 同じtime_slot + start_time片方/両方空 → 競合（保守的判定）
   */
  _isTimeSlotConflictWithStartTime: function(job1, job2) {
    const slot1 = job1.time_slot;
    const slot2 = job2.time_slot;
    const start1 = job1.start_time || '';
    const start2 = job2.start_time || '';

    // 終日・上棟は他の全てと重複
    const fullDaySlots = ['shuujitsu', 'jotou'];
    if (fullDaySlots.includes(slot1) || fullDaySlots.includes(slot2)) {
      return true;
    }

    // 夜勤 vs 日勤 → 競合なし
    const daySlots = ['am', 'pm', 'mitei'];
    if ((slot1 === 'yakin' && daySlots.includes(slot2)) ||
        (slot2 === 'yakin' && daySlots.includes(slot1))) {
      return false;
    }

    // 夜勤 vs 夜勤 → 競合
    if (slot1 === 'yakin' && slot2 === 'yakin') {
      // start_time が両方あれば比較
      if (start1 && start2) {
        return start1 === start2;
      }
      // 片方でも空なら保守的に競合
      return true;
    }

    // 同じ時間帯（am同士、pm同士、mitei同士）
    if (slot1 === slot2) {
      // start_time が両方設定されている場合のみ比較
      if (start1 && start2) {
        return start1 === start2;
      }
      // 片方でも空なら保守的に競合とみなす
      return true;
    }

    // 異なる日勤時間帯（am vs pm など）→ 競合なし
    return false;
  },

  /**
   * 日付ごとの全配置を取得（競合チェック用）
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object[]} 配置リスト（Job情報付き）
   */
  getDayAssignmentsForConflictCheck: function(date) {
    // バルク処理：その日の全案件と全配置を一括取得
    const jobs = JobRepository.findByDate(date);
    const jobIds = jobs.map(job => job.job_id);
    const assignments = AssignmentRepository.findByDate(date, jobIds);

    // 案件IDをキーにした高速ルックアップ
    const jobMap = {};
    for (const job of jobs) {
      jobMap[job.job_id] = job;
    }

    // 配置にJob情報を付加
    const result = [];
    for (const a of assignments) {
      if (a.status === 'CANCELLED') continue;

      const job = jobMap[a.job_id];
      if (!job || job.status === 'cancelled') continue;

      result.push({
        assignment_id: a.assignment_id,
        job_id: a.job_id,
        staff_id: a.staff_id,
        status: a.status,
        work_date: job.work_date,
        time_slot: job.time_slot,
        start_time: job.start_time || '',
        site_name: job.site_name || ''
      });
    }

    return result;
  }
};
