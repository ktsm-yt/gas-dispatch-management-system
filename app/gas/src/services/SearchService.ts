/**
 * SearchService - ダッシュボード横断検索 (CR-082)
 *
 * 現場名・スタッフ名でアーカイブ含む案件を横断検索する。
 * 結果はモーダルで閲覧のみ（ジャンプなし）。
 */

const SearchService = {
  /**
   * キーワードで案件を横断検索
   */
  searchByKeyword: function(params: DashboardSearchParams): {
    results: DashboardSearchResult[];
    total: number;
    truncated: boolean;
  } {
    const keyword = (params.keyword || '').trim();
    if (!keyword) {
      return { results: [], total: 0, truncated: false };
    }

    const searchType = params.search_type || 'all';
    const includeArchive = params.include_archive !== false;
    const limit = params.limit || 50;

    let siteResults: DashboardSearchResult[] = [];
    let staffResults: DashboardSearchResult[] = [];

    if (searchType === 'all' || searchType === 'site') {
      siteResults = this._searchBySiteName(keyword, includeArchive, limit);
    }

    if (searchType === 'all' || searchType === 'staff') {
      staffResults = this._searchByStaffName(keyword, includeArchive, limit);
    }

    const merged = this._dedupeAndMerge(siteResults, staffResults);

    const truncated = merged.length > limit;
    const results = merged.slice(0, limit);

    return { results, total: merged.length, truncated };
  },

  /**
   * 現場名で検索（既存 JobRepository.search を利用）
   */
  _searchBySiteName: function(keyword: string, includeArchive: boolean, limit: number): DashboardSearchResult[] {
    const jobs = JobRepository.search({
      site_name: keyword,
      includeArchive,
      sort_order: 'desc',
      limit
    });

    return this._enrichWithStaffNames(jobs);
  },

  /**
   * スタッフ名で検索（逆引き: M_Staff → T_JobAssignments → T_Jobs）
   */
  _searchByStaffName: function(keyword: string, includeArchive: boolean, limit: number): DashboardSearchResult[] {
    // 1. M_Staff 全取得 → 名前で部分一致フィルタ
    const allStaff = StaffRepository.search({});
    const lowerKeyword = keyword.toLowerCase();
    const matchedStaffIds: string[] = [];

    for (const staff of allStaff) {
      const name = String(staff.name || '').toLowerCase();
      const nameKana = String(staff.name_kana || '').toLowerCase();
      const nickname = String(staff.nickname || '').toLowerCase();

      if (name.includes(lowerKeyword) || nameKana.includes(lowerKeyword) || nickname.includes(lowerKeyword)) {
        matchedStaffIds.push(staff.staff_id as string);
      }
    }

    if (matchedStaffIds.length === 0) {
      return [];
    }

    const staffIdSet = new Set(matchedStaffIds);

    // 2. 現行DB: T_JobAssignments から job_id 収集
    const jobIdSet = new Set<string>();
    const allAssignments = getAllRecords('T_JobAssignments');
    for (const a of allAssignments) {
      if (a.is_deleted) continue;
      if (staffIdSet.has(a.staff_id as string)) {
        jobIdSet.add(a.job_id as string);
      }
    }

    // 3. アーカイブDB: T_JobAssignments から job_id 収集
    const fetchCap = limit * 3; // ソート前に十分な候補を確保
    if (includeArchive) {
      this._getAssignmentJobIdsFromArchive(staffIdSet, jobIdSet, fetchCap);
    }

    // 4. job_id群 → JobRepository.findById で案件取得（fetchCap まで）
    const jobs: JobRecord[] = [];
    for (const jobId of jobIdSet) {
      if (jobs.length >= fetchCap) break;
      const job = JobRepository.findById(jobId);
      if (job && !job.is_deleted) {
        jobs.push(job);
      }
    }

    // 5. work_date desc でソートしてから limit で切り詰め
    jobs.sort((a, b) => {
      if (a.work_date !== b.work_date) {
        return a.work_date > b.work_date ? -1 : 1;
      }
      return a.job_id > b.job_id ? 1 : -1;
    });
    const trimmed = jobs.slice(0, limit);

    return this._enrichWithStaffNames(trimmed);
  },

  /**
   * アーカイブDB の T_JobAssignments からスタッフに紐づく job_id を収集
   */
  _getAssignmentJobIdsFromArchive: function(
    staffIdSet: Set<string>,
    jobIdSet: Set<string>,
    limit: number
  ): void {
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    for (let y = currentFiscalYear - 1; y >= currentFiscalYear - 3 && y >= 2020; y--) {
      if (jobIdSet.size >= limit) break;

      const archiveDbId = ArchiveService.getArchiveDbId(y);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, 'T_JobAssignments');
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0] as string[];
        const staffIdCol = headers.indexOf('staff_id');
        const jobIdCol = headers.indexOf('job_id');
        const isDeletedCol = headers.indexOf('is_deleted');

        if (staffIdCol === -1 || jobIdCol === -1) continue;

        for (let i = 1; i < data.length; i++) {
          if (jobIdSet.size >= limit) break;

          const isDeleted = isDeletedCol !== -1 && (data[i][isDeletedCol] === true || data[i][isDeletedCol] === 'true');
          if (isDeleted) continue;

          if (staffIdSet.has(String(data[i][staffIdCol]))) {
            jobIdSet.add(String(data[i][jobIdCol]));
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`アーカイブAssignments読み込みエラー (${y}): ${msg}`);
      }
    }
  },

  /**
   * 検索結果にスタッフ名を付与
   */
  _enrichWithStaffNames: function(jobs: JobRecord[]): DashboardSearchResult[] {
    if (jobs.length === 0) return [];

    const jobIdSet = new Set(jobs.map(j => j.job_id));
    const customerMap = this._getCustomerMap();
    const staffMap = MasterCache.getStaffMap();

    // 現行DB Assignments からスタッフ名マッピング
    const staffNamesByJob: Record<string, Set<string>> = {};
    const allAssignments = getAllRecords('T_JobAssignments');
    for (const a of allAssignments) {
      if (a.is_deleted) continue;
      if (!jobIdSet.has(a.job_id as string)) continue;

      const jobId = a.job_id as string;
      if (!staffNamesByJob[jobId]) staffNamesByJob[jobId] = new Set();

      const staff = staffMap[a.staff_id as string];
      const staffName = staff ? String(staff.name || '') : '';
      if (staffName) staffNamesByJob[jobId].add(staffName);
    }

    // アーカイブ案件用: アーカイブAssignmentsからもスタッフ名を取得
    const archivedJobs = jobs.filter(j => j._archived);
    if (archivedJobs.length > 0) {
      this._enrichArchiveStaffNames(archivedJobs, staffMap, staffNamesByJob);
    }

    return jobs.map(job => ({
      job_id: job.job_id,
      work_date: job.work_date,
      time_slot: job.time_slot,
      site_name: job.site_name,
      customer_name: customerMap[job.customer_id] || '',
      staff_names: staffNamesByJob[job.job_id] ? Array.from(staffNamesByJob[job.job_id]) : [],
      assigned_count: staffNamesByJob[job.job_id] ? staffNamesByJob[job.job_id].size : 0,
      status: job.status,
      _archived: job._archived,
      _archiveFiscalYear: job._archiveFiscalYear
    }));
  },

  /**
   * アーカイブ案件のスタッフ名を取得
   */
  _enrichArchiveStaffNames: function(
    archivedJobs: JobRecord[],
    staffMap: Record<string, Record<string, unknown>>,
    staffNamesByJob: Record<string, Set<string>>
  ): void {
    // 年度ごとにグルーピング
    const jobsByYear: Record<number, Set<string>> = {};
    for (const job of archivedJobs) {
      const fy = job._archiveFiscalYear!;
      if (!jobsByYear[fy]) jobsByYear[fy] = new Set();
      jobsByYear[fy].add(job.job_id);
    }

    for (const [fyStr, jobIds] of Object.entries(jobsByYear)) {
      const fy = Number(fyStr);
      const archiveDbId = ArchiveService.getArchiveDbId(fy);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, 'T_JobAssignments');
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0] as string[];
        const staffIdCol = headers.indexOf('staff_id');
        const jobIdCol = headers.indexOf('job_id');
        const isDeletedCol = headers.indexOf('is_deleted');

        if (staffIdCol === -1 || jobIdCol === -1) continue;

        for (let i = 1; i < data.length; i++) {
          const isDeleted = isDeletedCol !== -1 && (data[i][isDeletedCol] === true || data[i][isDeletedCol] === 'true');
          if (isDeleted) continue;

          const jobId = String(data[i][jobIdCol]);
          if (!jobIds.has(jobId)) continue;

          if (!staffNamesByJob[jobId]) staffNamesByJob[jobId] = new Set();

          const staff = staffMap[String(data[i][staffIdCol])];
          const staffName = staff ? String(staff.name || '') : '';
          if (staffName) staffNamesByJob[jobId].add(staffName);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`アーカイブAssignmentsスタッフ名取得エラー (${fy}): ${msg}`);
      }
    }
  },

  /**
   * 重複排除 + マージ + ソート
   */
  _dedupeAndMerge: function(
    siteResults: DashboardSearchResult[],
    staffResults: DashboardSearchResult[]
  ): DashboardSearchResult[] {
    const merged = new Map<string, DashboardSearchResult>();

    // site検索結果を先に登録
    for (const r of siteResults) {
      merged.set(r.job_id, r);
    }

    // staff検索結果をマージ（staff_namesは和集合）
    for (const r of staffResults) {
      const existing = merged.get(r.job_id);
      if (existing) {
        const nameSet = new Set([...existing.staff_names, ...r.staff_names]);
        existing.staff_names = Array.from(nameSet);
        existing.assigned_count = Math.max(existing.assigned_count, r.assigned_count);
      } else {
        merged.set(r.job_id, r);
      }
    }

    // work_date desc → job_id asc でソート
    const results = Array.from(merged.values());
    results.sort((a, b) => {
      if (a.work_date !== b.work_date) {
        return a.work_date > b.work_date ? -1 : 1;
      }
      return a.job_id > b.job_id ? 1 : -1;
    });

    return results;
  },

  _getCustomerMap: function(): Record<string, string> {
    const customers = MasterCache.getCustomerMap();
    const map: Record<string, string> = {};
    for (const customerId in customers) {
      const c = customers[customerId];
      if (c.customer_id && !c.is_deleted) {
        map[customerId] = (c.company_name as string || '') + (c.branch_name ? ' ' + c.branch_name : '');
      }
    }
    return map;
  }
};
