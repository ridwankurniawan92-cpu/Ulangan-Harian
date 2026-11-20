export type RoleName = 'superadmin' | 'student' | 'parent';

export type QuestionType = 'pg_4' | 'pg_3' | 'isian_singkat' | 'uraian';
export type DifficultyLevel = 'mudah' | 'sedang' | 'sulit';
export type MatchMode = 'exact' | 'case_insensitive' | 'contains';
export type ExamStatus = 'draft' | 'terjadwal' | 'aktif' | 'selesai';
export type ParticipantStatus = 'belum_mulai' | 'sedang_mengerjakan' | 'selesai' | 'dihentikan';

export interface UserSession {
  id: number;
  username: string;
  fullName: string;
  role: RoleName;
  roleDisplayName: string;
  isActive: boolean;
  studentProfile?: StudentProfile | null;
  parentProfile?: ParentProfile | null;
}

export interface AppSettings {
  school_name: string;
  class_level: string;
  curriculum: string;
  academic_year: string;
  semester: string;
  classes: string[];
  default_kktp: number;
}

export interface StudentProfile {
  id: number;
  user_id: number;
  nis: string;
  nisn: string | null;
  full_name: string;
  gender: 'L' | 'P';
  class_name: string;
  username: string;
  is_active: number;
  parent_names?: string;
  parent_ids?: number[];
  parents?: Array<{
    id: number;
    full_name: string;
    username: string;
    whatsapp_number: string | null;
    relationship_label: string;
  }>;
}

export interface ParentProfile {
  id: number;
  user_id: number;
  full_name: string;
  username: string;
  whatsapp_number: string | null;
  is_active: number;
  children?: Array<{
    id: number;
    nis: string;
    nisn: string | null;
    full_name: string;
    gender: 'L' | 'P';
    class_name: string;
    relationship_label: string;
  }>;
}

export interface SubjectItem {
  id: number;
  name: string;
  class_name: string;
  semester: string;
  academic_year_label: string;
  kktp_threshold: number;
  question_count?: number;
  exam_count?: number;
}

export interface AnswerOption {
  id?: number;
  question_id?: number;
  option_label: string;
  option_text: string;
  option_image: string | null;
  is_correct: number | boolean;
}

export interface QuestionItem {
  id: number;
  bank_id: number | null;
  subject_id: number;
  subject_name?: string;
  question_type: QuestionType;
  question_text: string;
  question_image: string | null;
  correct_answer_text: string | null;
  match_mode: MatchMode;
  weight: number;
  topic: string;
  learning_objective: string;
  difficulty: DifficultyLevel;
  options: AnswerOption[];
  created_at: string;
}

export interface ExamItem {
  id: number;
  title: string;
  subject_id: number;
  subject_name?: string;
  class_name: string;
  topic: string;
  learning_objective: string;
  duration_minutes: number;
  question_count: number;
  max_score: number;
  kktp: number;
  instructions: string;
  status: ExamStatus;
  is_results_published: number;
  allow_review_keys: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  assigned_question_count?: number;
  submitted_count?: number;
  total_class_students?: number;
  has_essay?: boolean;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  link_target: string | null;
  is_read: number;
  created_at: string;
}

export interface ActivityLogItem {
  id: number;
  user_id: number | null;
  actor_name: string;
  actor_role: string;
  action: string;
  details: string;
  created_at: string;
}
