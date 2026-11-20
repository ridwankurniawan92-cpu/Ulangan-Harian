import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { hashPassword } from './auth.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'ulangan.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const UPLOAD_DIRECTORY = UPLOAD_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_label TEXT NOT NULL,
      semester TEXT NOT NULL DEFAULT 'Ganjil',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      nis TEXT NOT NULL UNIQUE,
      nisn TEXT,
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('L', 'P')),
      class_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      whatsapp_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS parent_student_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      relationship_label TEXT NOT NULL DEFAULT 'Orang Tua / Wali',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (parent_id, student_id),
      FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL DEFAULT 'Kelas III',
      semester TEXT NOT NULL DEFAULT 'Ganjil',
      academic_year_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER,
      subject_id INTEGER NOT NULL,
      question_type TEXT NOT NULL CHECK (question_type IN ('pg_4', 'pg_3', 'isian_singkat', 'uraian')),
      question_text TEXT NOT NULL,
      question_image TEXT,
      correct_answer_text TEXT,
      match_mode TEXT NOT NULL DEFAULT 'case_insensitive' CHECK (match_mode IN ('exact', 'case_insensitive', 'contains')),
      weight REAL NOT NULL DEFAULT 1,
      topic TEXT NOT NULL DEFAULT '',
      learning_objective TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT 'sedang' CHECK (difficulty IN ('mudah', 'sedang', 'sulit')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bank_id) REFERENCES question_banks(id) ON DELETE SET NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answer_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      option_label TEXT NOT NULL,
      option_text TEXT NOT NULL DEFAULT '',
      option_image TEXT,
      is_correct INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      class_name TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      learning_objective TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      question_count INTEGER NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 100,
      kktp REAL NOT NULL DEFAULT 75,
      instructions TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'terjadwal', 'aktif', 'selesai')),
      is_results_published INTEGER NOT NULL DEFAULT 0,
      allow_review_keys INTEGER NOT NULL DEFAULT 0,
      academic_year_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS exam_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL UNIQUE,
      exam_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      custom_weight REAL,
      UNIQUE (exam_id, question_id),
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'belum_mulai' CHECK (status IN ('belum_mulai', 'sedang_mengerjakan', 'selesai', 'dihentikan')),
      started_at TEXT,
      finished_at TEXT,
      device_lock_token TEXT,
      last_heartbeat_at TEXT,
      reset_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (exam_id, student_id),
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_option TEXT,
      answer_text TEXT,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER,
      score_awarded REAL NOT NULL DEFAULT 0,
      teacher_feedback TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (participant_id, question_id),
      FOREIGN KEY (participant_id) REFERENCES exam_participants(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL UNIQUE,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      total_score REAL NOT NULL DEFAULT 0,
      max_possible_score REAL NOT NULL DEFAULT 100,
      percentage REAL NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      unanswered_count INTEGER NOT NULL DEFAULT 0,
      kktp_threshold REAL NOT NULL DEFAULT 75,
      is_passed INTEGER NOT NULL DEFAULT 0,
      teacher_note TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 0,
      graded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (participant_id) REFERENCES exam_participants(id) ON DELETE CASCADE,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS score_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      max_weight REAL NOT NULL,
      earned_score REAL NOT NULL DEFAULT 0,
      is_correct INTEGER,
      FOREIGN KEY (result_id) REFERENCES exam_results(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kktp_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      exam_id INTEGER,
      threshold REAL NOT NULL DEFAULT 75,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'alert')),
      link_target TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Seed ONLY system roles, active academic year 2026/2027, app settings, and Superadmin account.
  // Strictly ZERO dummy students, parents, subjects, questions, exams, or grades.
  const insertRole = db.prepare(`INSERT OR IGNORE INTO roles (name, display_name) VALUES (?, ?)`);
  insertRole.run('superadmin', 'Guru / Superadmin');
  insertRole.run('student', 'Peserta Didik');
  insertRole.run('parent', 'Orang Tua / Wali');

  const activeYear = db.prepare(`SELECT id FROM academic_years WHERE is_active = 1 LIMIT 1`).get() as { id: number } | undefined;
  if (!activeYear) {
    db.prepare(`INSERT INTO academic_years (year_label, semester, is_active) VALUES (?, ?, 1)`).run('2026/2027', 'Ganjil');
  }

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`);
  insertSetting.run('school_name', 'SD Negeri Kurikulum Merdeka');
  insertSetting.run('class_level', 'Kelas III');
  insertSetting.run('curriculum', 'Kurikulum Merdeka');
  insertSetting.run('classes_json', JSON.stringify(['3A', '3B', '3C']));
  insertSetting.run('default_kktp', '75');

  const superadminRole = db.prepare(`SELECT id FROM roles WHERE name = 'superadmin'`).get() as { id: number };
  const existingAdmin = db.prepare(`SELECT id FROM users WHERE username = 'Admin_123456'`).get() as { id: number } | undefined;
  if (!existingAdmin) {
    const anyAdmin = db.prepare(`SELECT id FROM users WHERE role_id = ?`).get(superadminRole.id);
    if (!anyAdmin) {
      db.prepare(`
        INSERT INTO users (username, password_hash, role_id, full_name, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run('Admin_123456', hashPassword('123456'), superadminRole.id, 'Guru Kelas III (Superadmin)');
    }
  }
}

export function logActivity(
  userId: number | null,
  actorName: string,
  actorRole: string,
  action: string,
  details = ''
): void {
  db.prepare(`
    INSERT INTO activity_logs (user_id, actor_name, actor_role, action, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, actorName, actorRole, action, details);
}

export function createNotification(
  userId: number,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'alert' = 'info',
  linkTarget: string | null = null
): void {
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, type, link_target)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, title, message, type, linkTarget);
}

export function getActiveAcademicYear(): { id: number; year_label: string; semester: string } {
  const row = db.prepare(`SELECT id, year_label, semester FROM academic_years WHERE is_active = 1 LIMIT 1`).get() as
    | { id: number; year_label: string; semester: string }
    | undefined;
  if (row) return row;
  const info = db.prepare(`INSERT INTO academic_years (year_label, semester, is_active) VALUES ('2026/2027', 'Ganjil', 1)`).run();
  return { id: Number(info.lastInsertRowid), year_label: '2026/2027', semester: 'Ganjil' };
}

export function getAppSettingsMap(): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}
