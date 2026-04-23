import type { Database } from '@/lib/supabase/types';

export type KanbanColumn = Database['public']['Enums']['kanban_column'];

export interface KanbanJob {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  frameSku: string;
  customerName: string;
  priority: number;
  column: KanbanColumn;
  assigneeName: string | null;
  qcPhotoCount: number;
  startedAt: string | null;
}

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  inbox: 'Inbox',
  ready_to_cut: 'Ready to cut',
  on_edger: 'On edger',
  on_bench: 'On bench',
  qc: 'QC',
  ship: 'Ship',
};

export const COLUMNS_ORDER: KanbanColumn[] = ['inbox', 'ready_to_cut', 'on_edger', 'on_bench', 'qc', 'ship'];
