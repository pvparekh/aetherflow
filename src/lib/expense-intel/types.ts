export type UploadStatus = 'pending' | 'processing' | 'complete' | 'error';
export type FlagSeverity = 'success' | 'info' | 'warning' | 'critical';

export interface Flag {
  severity: FlagSeverity;
  title: string;
  description: string;
  metric: string;
  category: string;
  related_line_item_ids: string[];
}
export type AnomalySeverity = 'none' | 'low' | 'medium' | 'high';
export type RecurrenceTier = 'one_time' | 'occasional' | 'regular' | 'core';
export type TrendDirection = 'up' | 'down' | 'stable';
export type UserResolution = 'expected' | 'investigate' | null;
export type ParseFormat = 'standard' | 'bank' | 'simple' | 'txt';

export const CATEGORIES = [
  'Food/Dining',
  'Travel/Transport',
  'Accommodation',
  'Software/SaaS',
  'Office/Supplies',
  'Marketing/Ads',
  'Entertainment',
  'Utilities',
  'Misc',
] as const;

export type Category = (typeof CATEGORIES)[number];

// --- Parser ---

export interface ParsedRow {
  raw_text: string;
  vendor: string;
  amount: number;
  transaction_date: string | null;
}

export interface ParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
  format: ParseFormat;
}

// --- Pass 1 ---

export interface Pass1Item {
  vendor: string;
  amount: number;
  date: string | null;
  category: Category;
  subcategory: string;
  confidence: number;
}

// --- DB rows ---

export interface Upload {
  id: string;
  user_id: string;
  filename: string;
  uploaded_at: string;
  total_amount: number | null;
  line_item_count: number | null;
  pass1_status: UploadStatus;
  pass2_status: UploadStatus;
  health_score: number | null;
  ai_analysis: unknown | null;
}

export interface LineItem {
  id: string;
  upload_id: string;
  raw_text: string | null;
  vendor: string | null;
  amount: number | null;
  transaction_date: string | null;
  category: string | null;
  subcategory: string | null;
  confidence: number | null;
  z_score: number | null;
  is_anomaly: boolean;
  anomaly_severity: AnomalySeverity;
  is_first_time_vendor: boolean;
  is_round_number: boolean;
  is_possible_duplicate: boolean;
  user_resolution: UserResolution;
}

export interface CategoryStats {
  id: string;
  category: string;
  upload_id: string;
  computed_at: string;
  total_spend_period: number | null;
  total_spend_alltime: number | null;
  mean_amount: number | null;
  median_amount: number | null;
  std_dev: number | null;
  rolling_avg_5: number | null;
  rolling_avg_alltime: number | null;
  pct_of_total_spend: number | null;
  trend_direction: TrendDirection;
}

export interface Vendor {
  id: string;
  user_id: string;
  vendor_name: string;
  first_seen_upload_id: string | null;
  last_seen_upload_id: string | null;
  total_occurrences: number;
  total_spend: number;
  avg_amount: number | null;
  recurrence_tier: RecurrenceTier;
  primary_category: string | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category: string;
  monthly_target: number | null;
  active: boolean;
}

// --- API response ---

export interface UploadResponse {
  upload_id: string;
  filename: string;
  line_item_count: number;
  total_amount: number;
  batches_processed: number;
  parse_errors: ParseError[];
  pass1_status: UploadStatus;
}
