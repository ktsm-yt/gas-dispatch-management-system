export {};

declare global {
  // 共通型定義（段階的に追加）
  interface AssignmentSlot {
    id: string;
    job_id: string;
    staff_id: string;
    slot_type: 'am' | 'pm' | 'yakin' | 'jotou' | 'shuujitsu';
    // ... 他のプロパティ
  }

  interface AssignmentChanges {
    upserts: AssignmentSlot[];
    deletes: string[];
  }

  interface ApiResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
    };
  }
}
