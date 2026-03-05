/**
 * Slot Service
 *
 * 枠（Slot）管理のビジネスロジック
 * 案件に紐づく人員枠の設定・充足状況計算を担当
 */

const SlotService = {

  /**
   * 案件の枠一覧を取得
   * @param {string} jobId - 案件ID
   * @returns {Object} { slots: Object[], totalCount: number }
   */
  getSlotsByJobId: function(jobId) {
    const slots = SlotRepository.findByJobId(jobId);
    const totalCount = slots.reduce((sum, s) => sum + (Number(s.slot_count) || 0), 0);

    return {
      slots: slots,
      totalCount: totalCount
    };
  },

  /**
   * 案件の枠を一括保存
   * @param {string} jobId - 案件ID
   * @param {Object[]} slots - 枠配列
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 保存結果
   */
  saveSlots: function(jobId, slots, expectedUpdatedAt, options) {
    var skipLock = options && options.skipLock;
    var requestId = generateRequestId();

    var lock = null;
    if (!skipLock) {
      lock = acquireLock(3000);
      if (!lock) {
        return buildErrorResponse(
          ERROR_CODES.BUSY_ERROR,
          '現在混み合っています。しばらく待ってから再度お試しください。',
          {},
          requestId
        );
      }
    }

    try {
      // 案件の存在確認
      var job = JobRepository.findById(jobId);
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

      // 削除予定の枠に配置が紐づいていないかチェック
      var deleteCheck = this._checkSlotsCanBeDeleted(jobId, slots);
      if (!deleteCheck.canDelete) {
        return buildErrorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          deleteCheck.error,
          { conflictingSlots: deleteCheck.conflictingSlots },
          requestId
        );
      }

      // 枠を一括更新
      var result = SlotRepository.bulkUpdateForJob(jobId, slots, expectedUpdatedAt);

      if (!result.success && result.errors.length > 0) {
        return buildErrorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          '一部の枠の保存に失敗しました',
          { errors: result.errors },
          requestId
        );
      }

      // bulkUpdateForJobの結果からtotalCountを計算（DB再読み込み不要）
      // 重複slot_idがあれば最後の値を採用（防御的デデュプ）
      var slotMap = {};
      var merged = result.created.concat(result.updated);
      for (var i = 0; i < merged.length; i++) {
        slotMap[merged[i].slot_id] = merged[i];
      }
      var allSlots = Object.keys(slotMap).map(function(k) { return slotMap[k]; });
      var totalCount = allSlots.reduce(function(sum, s) { return sum + (Number(s.slot_count) || 0); }, 0);

      var jobUpdateResult = JobRepository.update(
        { job_id: jobId, required_count: totalCount },
        job.updated_at
      );
      var updatedJob = (jobUpdateResult && jobUpdateResult.job) || job;

      // 監査ログ
      logToAudit('SLOT_UPDATE', 'T_JobSlots', jobId, null, {
        created: result.created.length,
        updated: result.updated.length,
        deleted: result.deleted.length
      });

      // bulkUpdateForJobの結果をそのまま返却（DB再読み込み不要）
      // sort_order順にソート
      allSlots.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

      return buildSuccessResponse({
        slots: allSlots,
        totalCount: totalCount,
        job: updatedJob,
        changes: {
          created: result.created.length,
          updated: result.updated.length,
          deleted: result.deleted.length
        }
      }, requestId);

    } catch (e) {
      logErr('saveSlots', e);
      return buildErrorResponse(
        ERROR_CODES.SYSTEM_ERROR,
        'システムエラーが発生しました',
        { message: e.message },
        requestId
      );
    } finally {
      if (lock) releaseLock(lock);
    }
  },

  /**
   * 枠ごとの充足状況を取得
   * @param {string} jobId - 案件ID
   * @param {Object} [preloadedData] - プリロード済みデータ（省略時はDB取得）
   * @param {Object[]} [preloadedData.slots] - 枠データ
   * @param {Object[]} [preloadedData.assignments] - 配置データ
   * @returns {Object} { slotStatuses: Object[], total: Object }
   */
  getSlotStatus: function(jobId, preloadedData) {
    const slots = preloadedData?.slots || SlotRepository.findByJobId(jobId);
    const assignments = preloadedData?.assignments || AssignmentRepository.findByJobId(jobId);

    // 枠ごとの配置数をカウント
    const assignmentsBySlot = {};
    const unassignedToSlot = [];

    for (const assignment of assignments) {
      if (assignment.status === 'CANCELLED') continue;

      if (assignment.slot_id) {
        if (!assignmentsBySlot[assignment.slot_id]) {
          assignmentsBySlot[assignment.slot_id] = [];
        }
        assignmentsBySlot[assignment.slot_id].push(assignment);
      } else {
        unassignedToSlot.push(assignment);
      }
    }

    // 枠ごとのステータスを計算
    const slotStatuses = slots.map(slot => {
      const slotAssignments = assignmentsBySlot[slot.slot_id] || [];
      const assignedCount = slotAssignments.length;
      const requiredCount = Number(slot.slot_count) || 0;
      const shortage = requiredCount - assignedCount;

      return {
        slot_id: slot.slot_id,
        slot_time_slot: slot.slot_time_slot,
        slot_pay_unit: slot.slot_pay_unit,
        required: requiredCount,
        assigned: assignedCount,
        shortage: shortage,
        status: shortage > 0 ? 'shortage' : (shortage < 0 ? 'over' : 'filled'),
        assignments: slotAssignments
      };
    });

    // 合計
    const totalRequired = slots.reduce((sum, s) => sum + (Number(s.slot_count) || 0), 0);
    const totalAssigned = assignments.filter(a => a.status !== 'CANCELLED').length;

    return {
      slotStatuses: slotStatuses,
      unassignedToSlot: unassignedToSlot,
      total: {
        required: totalRequired,
        assigned: totalAssigned,
        shortage: totalRequired - totalAssigned
      }
    };
  },

  /**
   * 配置を枠に割り当て
   * 枠の単価区分を配置に自動設定
   * @param {string} assignmentId - 配置ID
   * @param {string} slotId - 枠ID
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果
   */
  assignToSlot: function(assignmentId, slotId, expectedUpdatedAt) {
    const requestId = generateRequestId();

    try {
      const assignment = AssignmentRepository.findById(assignmentId);
      if (!assignment) {
        return buildErrorResponse(
          ERROR_CODES.NOT_FOUND,
          '配置が見つかりません',
          { assignmentId: assignmentId },
          requestId
        );
      }

      const slot = SlotRepository.findById(slotId);
      if (!slot) {
        return buildErrorResponse(
          ERROR_CODES.NOT_FOUND,
          '枠が見つかりません',
          { slotId: slotId },
          requestId
        );
      }

      // 枠と配置のjob_id整合性チェック
      if (slot.job_id !== assignment.job_id) {
        return buildErrorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          '異なる案件の枠に配置することはできません',
          {
            slotJobId: slot.job_id,
            assignmentJobId: assignment.job_id
          },
          requestId
        );
      }

      // 配置を更新（枠ID + 単価区分を自動設定）
      const updateData = {
        assignment_id: assignmentId,
        slot_id: slotId,
        pay_unit: slot.slot_pay_unit,
        invoice_unit: slot.slot_pay_unit  // pay_unit = invoice_unit で同期
      };

      const updateResult = AssignmentRepository.update(updateData, expectedUpdatedAt);

      if (!updateResult.success) {
        return buildErrorResponse(
          updateResult.error === 'CONFLICT_ERROR' ? ERROR_CODES.CONFLICT_ERROR : ERROR_CODES.SYSTEM_ERROR,
          updateResult.error === 'CONFLICT_ERROR'
            ? '他のユーザーが変更を行いました。画面を更新してください。'
            : '更新に失敗しました',
          updateResult,
          requestId
        );
      }

      // 監査ログ
      logToAudit('ASSIGN_TO_SLOT', 'T_JobAssignments', assignmentId, null, {
        slot_id: slotId,
        pay_unit: slot.slot_pay_unit
      });

      // ダッシュボードキャッシュ無効化（配置の単価区分が変わるため）
      const job = JobRepository.findById(assignment.job_id);
      if (job) JobService.invalidateDashboardCache(job.work_date);

      return buildSuccessResponse({
        assignment: updateResult.assignment,
        slot: slot
      }, requestId);

    } catch (e) {
      logErr('assignToSlot', e);
      return buildErrorResponse(
        ERROR_CODES.SYSTEM_ERROR,
        'システムエラーが発生しました',
        { message: e.message },
        requestId
      );
    }
  },

  /**
   * 日付の全案件の枠充足状況サマリーを取得
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object} 案件ごとの枠充足状況
   */
  getSlotStatusByDate: function(date) {
    const jobs = JobRepository.findByDate(date);
    const jobIds = jobs.map(j => j.job_id);

    // 全案件の枠を一括取得
    const slotsByJob = SlotRepository.findByJobIds(jobIds);

    // 全案件の配置を取得
    const assignmentsByJob = {};
    for (const jobId of jobIds) {
      assignmentsByJob[jobId] = AssignmentRepository.findByJobId(jobId);
    }

    // 案件ごとの充足状況を計算
    const jobStatuses = jobs.map(job => {
      const slots = slotsByJob[job.job_id] || [];
      const assignments = assignmentsByJob[job.job_id] || [];

      if (slots.length === 0) {
        // 枠なしの案件は従来通りの計算
        const assigned = assignments.filter(a => a.status !== 'CANCELLED').length;
        const required = Number(job.required_count) || 0;
        return {
          job_id: job.job_id,
          site_name: job.site_name,
          time_slot: job.time_slot,
          hasSlots: false,
          required: required,
          assigned: assigned,
          shortage: required - assigned
        };
      }

      // 枠ありの案件
      const slotStatuses = this._calculateSlotStatuses(slots, assignments);
      const totalRequired = slots.reduce((sum, s) => sum + (Number(s.slot_count) || 0), 0);
      const totalAssigned = assignments.filter(a => a.status !== 'CANCELLED').length;

      return {
        job_id: job.job_id,
        site_name: job.site_name,
        time_slot: job.time_slot,
        hasSlots: true,
        slotStatuses: slotStatuses,
        required: totalRequired,
        assigned: totalAssigned,
        shortage: totalRequired - totalAssigned
      };
    });

    return {
      date: date,
      jobs: jobStatuses
    };
  },

  /**
   * 削除予定の枠に配置が紐づいていないかチェック
   * @private
   */
  _checkSlotsCanBeDeleted: function(jobId, newSlots) {
    const existingSlots = SlotRepository.findByJobId(jobId);
    const newSlotIds = new Set(newSlots.filter(s => s.slot_id).map(s => s.slot_id));

    // 削除予定の枠を特定
    const toDelete = existingSlots.filter(s => !newSlotIds.has(s.slot_id));

    if (toDelete.length === 0) {
      return { canDelete: true };
    }

    // 削除予定の枠に配置があるかチェック
    const assignments = AssignmentRepository.findByJobId(jobId);
    const conflictingSlots = [];

    for (const slot of toDelete) {
      const hasAssignments = assignments.some(
        a => a.slot_id === slot.slot_id && a.status !== 'CANCELLED'
      );
      if (hasAssignments) {
        conflictingSlots.push(slot);
      }
    }

    if (conflictingSlots.length > 0) {
      return {
        canDelete: false,
        error: '配置が紐づいている枠は削除できません。先に配置を別の枠に移動するか、配置を削除してください。',
        conflictingSlots: conflictingSlots
      };
    }

    return { canDelete: true };
  },

  /**
   * 枠ごとの充足状況を計算
   * @private
   */
  _calculateSlotStatuses: function(slots, assignments) {
    const assignmentsBySlot = {};

    for (const assignment of assignments) {
      if (assignment.status === 'CANCELLED') continue;
      if (!assignment.slot_id) continue;

      if (!assignmentsBySlot[assignment.slot_id]) {
        assignmentsBySlot[assignment.slot_id] = 0;
      }
      assignmentsBySlot[assignment.slot_id]++;
    }

    return slots.map(slot => {
      const assigned = assignmentsBySlot[slot.slot_id] || 0;
      const required = Number(slot.slot_count) || 0;
      return {
        slot_id: slot.slot_id,
        slot_time_slot: slot.slot_time_slot,
        slot_pay_unit: slot.slot_pay_unit,
        required: required,
        assigned: assigned,
        shortage: required - assigned
      };
    });
  }
};
