import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AuthenticatedRequest,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  requireRole,
  setSessionCookie,
  verifyPassword,
} from '../auth.ts';
import {
  createNotification,
  db,
  getActiveAcademicYear,
  getAppSettingsMap,
  logActivity,
  UPLOAD_DIRECTORY,
} from '../db.ts';
import { gradeAndComputeParticipantResult } from '../grading.ts';

export const portalRouter = Router();

// ==================== AUTH ROUTES ====================

portalRouter.post('/auth/login', (req, res) => {
  const { username, password, expectedRole } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
  }

  const user = db
    .prepare(`
      SELECT u.id, u.username, u.password_hash, u.full_name, u.is_active,
             r.name AS role_name, r.display_name AS role_display_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.username = ?
    `)
    .get(String(username).trim()) as
    | {
        id: number;
        username: string;
        password_hash: string;
        full_name: string;
        is_active: number;
        role_name: 'superadmin' | 'student' | 'parent';
        role_display_name: string;
      }
    | undefined;

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Username atau kata sandi salah.' });
  }

  if (expectedRole && user.role_name !== expectedRole) {
    const roleLabel =
      expectedRole === 'superadmin'
        ? 'Guru / Superadmin'
        : expectedRole === 'student'
          ? 'Peserta Didik'
          : 'Orang Tua';
    return res.status(403).json({
      error: `Akun ini bukan akun ${roleLabel}. Silakan pilih jenis akses yang sesuai.`,
    });
  }

  if (user.is_active !== 1) {
    return res.status(403).json({
      error: 'Akun Anda sedang dinonaktifkan oleh Guru (Superadmin). Silakan hubungi wali kelas.',
    });
  }

  const token = createSessionToken(user.id, user.role_name);
  setSessionCookie(req, res, token);

  logActivity(user.id, user.full_name, user.role_name, 'LOGIN', `Login berhasil sebagai ${user.role_display_name}`);

  return res.json({
    ok: true,
    role: user.role_name,
    token,
  });
});

portalRouter.post('/auth/logout', (req: AuthenticatedRequest, res) => {
  if (req.auth) {
    logActivity(req.auth.userId, req.auth.fullName, req.auth.role, 'LOGOUT', 'Pengguna keluar dari aplikasi');
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

portalRouter.get('/auth/me', (req: AuthenticatedRequest, res) => {
  const settingsMap = getAppSettingsMap();
  const activeYear = getActiveAcademicYear();
  let classes: string[] = ['3A', '3B', '3C'];
  try {
    classes = JSON.parse(settingsMap.classes_json || '["3A","3B","3C"]');
  } catch {
    classes = ['3A', '3B', '3C'];
  }

  const appSettings = {
    school_name: settingsMap.school_name || 'SD Negeri Kurikulum Merdeka',
    class_level: settingsMap.class_level || 'Kelas III',
    curriculum: settingsMap.curriculum || 'Kurikulum Merdeka',
    academic_year: activeYear.year_label,
    semester: activeYear.semester,
    classes,
    default_kktp: Number(settingsMap.default_kktp || 75),
  };

  if (!req.auth) {
    return res.json({ user: null, appSettings, unreadNotifications: 0 });
  }

  const user = db
    .prepare(`
      SELECT u.id, u.username, u.full_name, u.is_active,
             r.name AS role, r.display_name AS roleDisplayName
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `)
    .get(req.auth.userId) as
    | {
        id: number;
        username: string;
        full_name: string;
        is_active: number;
        role: 'superadmin' | 'student' | 'parent';
        roleDisplayName: string;
      }
    | undefined;

  if (!user || user.is_active !== 1) {
    clearSessionCookie(req, res);
    return res.json({ user: null, appSettings, unreadNotifications: 0 });
  }

  let studentProfile = null;
  let parentProfile = null;

  if (user.role === 'student') {
    const st = db
      .prepare(`SELECT * FROM students WHERE user_id = ?`)
      .get(user.id) as
      | {
          id: number;
          user_id: number;
          nis: string;
          nisn: string | null;
          full_name: string;
          gender: 'L' | 'P';
          class_name: string;
        }
      | undefined;

    if (st) {
      const parents = db
        .prepare(`
          SELECT p.id, p.full_name, u.username, p.whatsapp_number, psr.relationship_label
          FROM parent_student_relationships psr
          JOIN parents p ON p.id = psr.parent_id
          JOIN users u ON u.id = p.user_id
          WHERE psr.student_id = ?
        `)
        .all(st.id);
      studentProfile = {
        ...st,
        username: user.username,
        is_active: user.is_active,
        parents,
      };
    }
  } else if (user.role === 'parent') {
    const pr = db
      .prepare(`SELECT * FROM parents WHERE user_id = ?`)
      .get(user.id) as { id: number; user_id: number; full_name: string; whatsapp_number: string | null } | undefined;
    if (pr) {
      const children = db
        .prepare(`
          SELECT s.id, s.nis, s.nisn, s.full_name, s.gender, s.class_name, psr.relationship_label
          FROM parent_student_relationships psr
          JOIN students s ON s.id = psr.student_id
          WHERE psr.parent_id = ?
          ORDER BY s.full_name ASC
        `)
        .all(pr.id);
      parentProfile = {
        ...pr,
        username: user.username,
        is_active: user.is_active,
        children,
      };
    }
  }

  const unread = db
    .prepare(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`)
    .get(user.id) as { cnt: number };

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      roleDisplayName: user.roleDisplayName,
      isActive: user.is_active === 1,
      studentProfile,
      parentProfile,
    },
    appSettings,
    unreadNotifications: unread.cnt,
  });
});

portalRouter.post('/auth/change-password', (req: AuthenticatedRequest, res) => {
  if (!req.auth) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Kata sandi baru minimal 4 karakter.' });
  }
  const user = db.prepare(`SELECT id, password_hash FROM users WHERE id = ?`).get(req.auth.userId) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(String(currentPassword), user.password_hash)) {
    return res.status(400).json({ error: 'Kata sandi saat ini tidak sesuai.' });
  }
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(String(newPassword)),
    user.id
  );
  logActivity(req.auth.userId, req.auth.fullName, req.auth.role, 'UBAH_PASSWORD', 'Mengubah kata sandi akun');
  res.json({ ok: true });
});

// ==================== NOTIFICATIONS ====================

portalRouter.get('/notifications', (req: AuthenticatedRequest, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });

  // Dynamic check for Superadmin: alert if active exams have unstarted students (avoid spam by checking recent)
  if (req.auth.role === 'superadmin') {
    const activeExams = db
      .prepare(`SELECT id, title, class_name FROM exams WHERE status = 'aktif'`)
      .all() as Array<{ id: number; title: string; class_name: string }>;
    for (const ex of activeExams) {
      const pending = db
        .prepare(`
          SELECT COUNT(*) AS cnt
          FROM students s
          LEFT JOIN exam_participants ep ON ep.exam_id = ? AND ep.student_id = s.id
          WHERE s.class_name = ? AND (ep.id IS NULL OR ep.status = 'belum_mulai')
        `)
        .get(ex.id, ex.class_name) as { cnt: number };

      if (pending.cnt > 0) {
        const existing = db
          .prepare(`
            SELECT id FROM notifications
            WHERE user_id = ? AND link_target = ? AND created_at >= datetime('now', '-6 hours')
            LIMIT 1
          `)
          .get(req.auth.userId, `monitor:${ex.id}`);
        if (!existing) {
          createNotification(
            req.auth.userId,
            'Siswa Belum Mengerjakan Ulangan',
            `${pending.cnt} peserta didik kelas ${ex.class_name} belum mengerjakan "${ex.title}".`,
            'warning',
            `monitor:${ex.id}`
          );
        }
      }
    }
  }

  const list = db
    .prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 40
    `)
    .all(req.auth.userId);
  res.json({ notifications: list });
});

portalRouter.patch('/notifications/:id/read', (req: AuthenticatedRequest, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
    Number(req.params.id),
    req.auth.userId
  );
  res.json({ ok: true });
});

portalRouter.patch('/notifications/read-all', (req: AuthenticatedRequest, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.auth.userId);
  res.json({ ok: true });
});

// ==================== IMAGE UPLOAD (SUPERADMIN) ====================

portalRouter.post('/upload', requireRole(['superadmin']), (req: AuthenticatedRequest, res) => {
  const { dataUrl, fileName } = req.body ?? {};
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Format gambar tidak valid.' });
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Hanya mendukung gambar PNG, JPG, WEBP, atau GIF.' });
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran gambar maksimal 5 MB.' });
  }
  const safeBase = String(fileName || 'soal')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 32);
  const outName = `${safeBase}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIRECTORY, outName), buffer);
  return res.json({ url: `/api/uploads/${outName}` });
});

// ==================== STUDENT PORTAL & EXAM RUNNER ====================

function computeRemainingSeconds(
  startedAtIso: string,
  durationMinutes: number,
  examDate: string | null,
  endTime: string | null
): number {
  const startedMs = new Date(startedAtIso.endsWith('Z') ? startedAtIso : startedAtIso + 'Z').getTime();
  const durationEndMs = startedMs + durationMinutes * 60 * 1000;
  let effectiveEndMs = durationEndMs;

  if (examDate && endTime) {
    const scheduleEnd = new Date(`${examDate}T${endTime}:00`);
    if (!Number.isNaN(scheduleEnd.getTime())) {
      // Only cap by schedule if examDate is today and scheduleEnd is sensible
      const now = Date.now();
      if (scheduleEnd.getTime() > startedMs && scheduleEnd.getTime() < durationEndMs) {
        effectiveEndMs = Math.max(startedMs + 60 * 1000, scheduleEnd.getTime());
      }
      void now;
    }
  }
  const diffSec = Math.floor((effectiveEndMs - Date.now()) / 1000);
  return Math.max(0, diffSec);
}

portalRouter.get('/student/dashboard', requireRole(['student']), (req: AuthenticatedRequest, res) => {
  const studentId = req.auth!.studentId!;
  const className = req.auth!.studentClass!;

  const exams = db
    .prepare(`
      SELECT e.*, sub.name AS subject_name, es.exam_date, es.start_time, es.end_time,
             ep.id AS participant_id, ep.status AS participant_status, ep.started_at, ep.finished_at,
             er.id AS result_id, er.total_score, er.max_possible_score, er.percentage,
             er.is_passed, er.is_published, er.teacher_note, er.correct_count, er.wrong_count, er.unanswered_count
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      LEFT JOIN exam_participants ep ON ep.exam_id = e.id AND ep.student_id = ?
      LEFT JOIN exam_results er ON er.participant_id = ep.id
      WHERE e.class_name = ? AND e.status != 'draft'
      ORDER BY COALESCE(es.exam_date, e.created_at) DESC, e.id DESC
    `)
    .all(studentId, className) as Array<Record<string, unknown>>;

  const sanitizedExams = exams.map((row) => {
    const isPublished = row.is_published === 1;
    return {
      id: row.id,
      title: row.title,
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      class_name: row.class_name,
      topic: row.topic,
      learning_objective: row.learning_objective,
      duration_minutes: row.duration_minutes,
      question_count: row.question_count,
      max_score: row.max_score,
      kktp: row.kktp,
      instructions: row.instructions,
      status: row.status,
      exam_date: row.exam_date,
      start_time: row.start_time,
      end_time: row.end_time,
      participant_status: row.participant_status || 'belum_mulai',
      started_at: row.started_at,
      finished_at: row.finished_at,
      is_published: isPublished,
      result: isPublished
        ? {
            total_score: row.total_score,
            max_possible_score: row.max_possible_score,
            percentage: row.percentage,
            is_passed: row.is_passed === 1,
            teacher_note: row.teacher_note,
            correct_count: row.correct_count,
            wrong_count: row.wrong_count,
            unanswered_count: row.unanswered_count,
          }
        : null,
    };
  });

  const publishedResults = sanitizedExams.filter((e) => e.result !== null);
  const avgScore =
    publishedResults.length > 0
      ? Math.round(
          (publishedResults.reduce((acc, cur) => acc + Number(cur.result!.total_score), 0) / publishedResults.length) *
            10
        ) / 10
      : 0;

  res.json({
    exams: sanitizedExams,
    stats: {
      availableCount: sanitizedExams.filter((e) => e.status === 'aktif' || e.status === 'terjadwal').length,
      ongoingCount: sanitizedExams.filter((e) => e.participant_status === 'sedang_mengerjakan').length,
      completedCount: sanitizedExams.filter(
        (e) => e.participant_status === 'selesai' || e.participant_status === 'dihentikan'
      ).length,
      unattemptedActiveCount: sanitizedExams.filter(
        (e) => e.status === 'aktif' && (!e.participant_status || e.participant_status === 'belum_mulai')
      ).length,
      publishedCount: publishedResults.length,
      averageScore: avgScore,
    },
  });
});

portalRouter.post('/student/exams/:examId/start', requireRole(['student']), (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.examId);
  const studentId = req.auth!.studentId!;
  const className = req.auth!.studentClass!;
  const clientDeviceToken = typeof req.body?.deviceToken === 'string' ? req.body.deviceToken : '';

  const exam = db
    .prepare(`
      SELECT e.*, sub.name AS subject_name, es.exam_date, es.start_time, es.end_time
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      WHERE e.id = ? AND e.class_name = ?
    `)
    .get(examId, className) as
    | {
        id: number;
        title: string;
        subject_name: string;
        topic: string;
        duration_minutes: number;
        instructions: string;
        status: string;
        kktp: number;
        max_score: number;
        exam_date: string | null;
        start_time: string | null;
        end_time: string | null;
      }
    | undefined;

  if (!exam) {
    return res.status(404).json({ error: 'Ulangan tidak ditemukan untuk kelas Anda.' });
  }
  if (exam.status !== 'aktif') {
    return res.status(400).json({ error: 'Ulangan ini belum aktif atau sudah ditutup oleh guru.' });
  }

  let participant = db
    .prepare(`SELECT * FROM exam_participants WHERE exam_id = ? AND student_id = ?`)
    .get(examId, studentId) as
    | {
        id: number;
        status: string;
        started_at: string | null;
        finished_at: string | null;
        device_lock_token: string | null;
      }
    | undefined;

  if (participant && (participant.status === 'selesai' || participant.status === 'dihentikan')) {
    return res.status(400).json({ error: 'Anda sudah menyelesaikan ulangan ini.' });
  }

  let deviceTokenToUse = clientDeviceToken;

  if (!participant) {
    deviceTokenToUse = deviceTokenToUse || crypto.randomBytes(16).toString('hex');
    const info = db
      .prepare(`
        INSERT INTO exam_participants (exam_id, student_id, status, started_at, device_lock_token, last_heartbeat_at)
        VALUES (?, ?, 'sedang_mengerjakan', datetime('now'), ?, datetime('now'))
      `)
      .run(examId, studentId, deviceTokenToUse);
    participant = db.prepare(`SELECT * FROM exam_participants WHERE id = ?`).get(Number(info.lastInsertRowid)) as typeof participant;
    logActivity(req.auth!.userId, req.auth!.fullName, 'student', 'MULAI_UJIAN', `Memulai ulangan "${exam.title}"`);
  } else if (participant.status === 'belum_mulai') {
    deviceTokenToUse = deviceTokenToUse || crypto.randomBytes(16).toString('hex');
    db.prepare(`
      UPDATE exam_participants
      SET status = 'sedang_mengerjakan',
          started_at = datetime('now'),
          device_lock_token = ?,
          last_heartbeat_at = datetime('now')
      WHERE id = ?
    `).run(deviceTokenToUse, participant.id);
    participant = db.prepare(`SELECT * FROM exam_participants WHERE id = ?`).get(participant.id) as typeof participant;
  } else if (participant.status === 'sedang_mengerjakan') {
    if (participant.device_lock_token && participant.device_lock_token !== clientDeviceToken) {
      return res.status(409).json({
        error:
          'Ujian ini sedang berlangsung pada perangkat lain. Demi keamanan, satu akun hanya dapat mengerjakan dari satu perangkat. Hubungi Guru (Superadmin) untuk reset sesi jika mengalami kendala teknis.',
        code: 'DEVICE_LOCKED',
      });
    }
    deviceTokenToUse = participant.device_lock_token || clientDeviceToken || crypto.randomBytes(16).toString('hex');
    if (!participant.device_lock_token) {
      db.prepare(`UPDATE exam_participants SET device_lock_token = ?, last_heartbeat_at = datetime('now') WHERE id = ?`).run(
        deviceTokenToUse,
        participant.id
      );
    } else {
      db.prepare(`UPDATE exam_participants SET last_heartbeat_at = datetime('now') WHERE id = ?`).run(participant.id);
    }
  }

  const remainingSeconds = computeRemainingSeconds(
    participant!.started_at!,
    exam.duration_minutes,
    exam.exam_date,
    exam.end_time
  );

  // Auto-submit if time already ran out
  if (remainingSeconds <= 0) {
    db.prepare(`
      UPDATE exam_participants SET status = 'selesai', finished_at = datetime('now') WHERE id = ?
    `).run(participant!.id);
    gradeAndComputeParticipantResult(participant!.id, { autoPublishIfNoEssay: true });
    return res.status(400).json({ error: 'Waktu pengerjaan telah habis dan ujian otomatis dikumpulkan.', code: 'TIME_EXPIRED' });
  }

  // Load questions WITHOUT revealing answers or is_correct
  const rawQuestions = db
    .prepare(`
      SELECT q.id, q.question_type, q.question_text, q.question_image, eq.sort_order
      FROM exam_questions eq
      JOIN questions q ON q.id = eq.question_id
      WHERE eq.exam_id = ?
      ORDER BY eq.sort_order ASC, eq.id ASC
    `)
    .all(examId) as Array<{
    id: number;
    question_type: string;
    question_text: string;
    question_image: string | null;
    sort_order: number;
  }>;

  const optStmt = db.prepare(`
    SELECT option_label, option_text, option_image
    FROM answer_options
    WHERE question_id = ?
    ORDER BY option_label ASC
  `);

  const questions = rawQuestions.map((q) => ({
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    question_image: q.question_image,
    sort_order: q.sort_order,
    options: q.question_type === 'pg_4' || q.question_type === 'pg_3' ? optStmt.all(q.id) : [],
  }));

  const savedAnswers = db
    .prepare(`SELECT question_id, selected_option, answer_text, is_flagged FROM student_answers WHERE participant_id = ?`)
    .all(participant!.id);

  res.json({
    exam: {
      id: exam.id,
      title: exam.title,
      subject_name: exam.subject_name,
      topic: exam.topic,
      duration_minutes: exam.duration_minutes,
      instructions: exam.instructions,
      kktp: exam.kktp,
      max_score: exam.max_score,
      exam_date: exam.exam_date,
      start_time: exam.start_time,
      end_time: exam.end_time,
    },
    participantId: participant!.id,
    deviceToken: deviceTokenToUse,
    remainingSeconds,
    questions,
    savedAnswers,
  });
});

portalRouter.post('/student/exams/:examId/autosave', requireRole(['student']), (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.examId);
  const studentId = req.auth!.studentId!;
  const { deviceToken, answers } = req.body ?? {};

  const participant = db
    .prepare(`SELECT id, status, device_lock_token, started_at FROM exam_participants WHERE exam_id = ? AND student_id = ?`)
    .get(examId, studentId) as
    | { id: number; status: string; device_lock_token: string | null; started_at: string | null }
    | undefined;

  if (!participant || participant.status !== 'sedang_mengerjakan') {
    return res.status(400).json({ error: 'Sesi ujian tidak aktif.' });
  }
  if (participant.device_lock_token && participant.device_lock_token !== deviceToken) {
    return res.status(409).json({ error: 'Sesi perangkat tidak cocok. Hubungi guru untuk reset ujian.', code: 'DEVICE_LOCKED' });
  }

  const upsert = db.prepare(`
    INSERT INTO student_answers (participant_id, question_id, selected_option, answer_text, is_flagged, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (participant_id, question_id) DO UPDATE SET
      selected_option = excluded.selected_option,
      answer_text = excluded.answer_text,
      is_flagged = excluded.is_flagged,
      updated_at = datetime('now')
  `);

  if (Array.isArray(answers)) {
    const tx = db.transaction((items: Array<{ questionId: number; selectedOption?: string | null; answerText?: string | null; isFlagged?: boolean }>) => {
      for (const item of items) {
        upsert.run(
          participant.id,
          item.questionId,
          item.selectedOption ?? null,
          item.answerText ?? null,
          item.isFlagged ? 1 : 0
        );
      }
      db.prepare(`UPDATE exam_participants SET last_heartbeat_at = datetime('now') WHERE id = ?`).run(participant.id);
    });
    tx(answers);
  }

  const exam = db
    .prepare(`SELECT e.duration_minutes, es.exam_date, es.end_time FROM exams e LEFT JOIN exam_schedules es ON es.exam_id = e.id WHERE e.id = ?`)
    .get(examId) as { duration_minutes: number; exam_date: string | null; end_time: string | null };

  const remainingSeconds = participant.started_at
    ? computeRemainingSeconds(participant.started_at, exam.duration_minutes, exam.exam_date, exam.end_time)
    : 0;

  res.json({ ok: true, savedAt: new Date().toISOString(), remainingSeconds });
});

portalRouter.post('/student/exams/:examId/submit', requireRole(['student']), (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.examId);
  const studentId = req.auth!.studentId!;
  const { deviceToken, answers, autoSubmitted } = req.body ?? {};

  const participant = db
    .prepare(`SELECT id, status, device_lock_token FROM exam_participants WHERE exam_id = ? AND student_id = ?`)
    .get(examId, studentId) as { id: number; status: string; device_lock_token: string | null } | undefined;

  if (!participant) {
    return res.status(404).json({ error: 'Data pengerjaan tidak ditemukan.' });
  }
  if (participant.status === 'selesai' || participant.status === 'dihentikan') {
    return res.json({ ok: true, alreadySubmitted: true });
  }
  if (participant.device_lock_token && participant.device_lock_token !== deviceToken) {
    return res.status(409).json({ error: 'Sesi perangkat tidak cocok.' });
  }

  const upsert = db.prepare(`
    INSERT INTO student_answers (participant_id, question_id, selected_option, answer_text, is_flagged, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (participant_id, question_id) DO UPDATE SET
      selected_option = excluded.selected_option,
      answer_text = excluded.answer_text,
      is_flagged = excluded.is_flagged,
      updated_at = datetime('now')
  `);

  const tx = db.transaction(() => {
    if (Array.isArray(answers)) {
      for (const item of answers) {
        upsert.run(
          participant.id,
          item.questionId,
          item.selectedOption ?? null,
          item.answerText ?? null,
          item.isFlagged ? 1 : 0
        );
      }
    }
    db.prepare(`
      UPDATE exam_participants
      SET status = 'selesai', finished_at = datetime('now'), last_heartbeat_at = datetime('now')
      WHERE id = ?
    `).run(participant.id);
  });
  tx();

  const graded = gradeAndComputeParticipantResult(participant.id, { autoPublishIfNoEssay: true });

  const exam = db.prepare(`SELECT title FROM exams WHERE id = ?`).get(examId) as { title: string };
  createNotification(
    req.auth!.userId,
    'Ulangan Berhasil Dikumpulkan',
    `Jawaban Anda untuk "${exam.title}" telah berhasil disimpan${autoSubmitted ? ' secara otomatis karena waktu berakhir' : ''}.`,
    'success',
    'results'
  );

  // Notify Superadmin
  const admins = db
    .prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'superadmin'`)
    .all() as Array<{ id: number }>;
  for (const admin of admins) {
    createNotification(
      admin.id,
      'Peserta Didik Mengumpulkan Ulangan',
      `${req.auth!.fullName} telah mengumpulkan "${exam.title}".`,
      'info',
      `exam-results:${examId}`
    );
  }

  logActivity(
    req.auth!.userId,
    req.auth!.fullName,
    'student',
    'SELESAI_UJIAN',
    `Mengumpulkan ulangan "${exam.title}" (${autoSubmitted ? 'otomatis habis waktu' : 'manual'})`
  );

  res.json({
    ok: true,
    hasEssay: graded.hasEssay,
  });
});

// ==================== PARENT PORTAL (STRICT READ-ONLY) ====================

portalRouter.get('/parent/dashboard', requireRole(['parent']), (req: AuthenticatedRequest, res) => {
  const parentId = req.auth!.parentId!;
  const children = db
    .prepare(`
      SELECT s.id, s.nis, s.nisn, s.full_name, s.gender, s.class_name, psr.relationship_label
      FROM parent_student_relationships psr
      JOIN students s ON s.id = psr.student_id
      WHERE psr.parent_id = ?
      ORDER BY s.full_name ASC
    `)
    .all(parentId) as Array<{
    id: number;
    nis: string;
    nisn: string | null;
    full_name: string;
    gender: 'L' | 'P';
    class_name: string;
    relationship_label: string;
  }>;

  if (children.length === 0) {
    return res.json({ children: [], selectedChild: null, results: [], upcomingExams: [] });
  }

  const requestedChildId = Number(req.query.studentId);
  const selectedChild = children.find((c) => c.id === requestedChildId) || children[0];

  // Strict authorization: selectedChild is guaranteed to belong to parentId
  const results = db
    .prepare(`
      SELECT er.id, er.exam_id, er.total_score, er.max_possible_score, er.percentage,
             er.correct_count, er.wrong_count, er.unanswered_count, er.kktp_threshold,
             er.is_passed, er.teacher_note, er.graded_at,
             e.title AS exam_title, e.topic, sub.name AS subject_name,
             es.exam_date, ep.started_at, ep.finished_at
      FROM exam_results er
      JOIN exams e ON e.id = er.exam_id
      JOIN subjects sub ON sub.id = e.subject_id
      JOIN exam_participants ep ON ep.id = er.participant_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      WHERE er.student_id = ? AND er.is_published = 1
      ORDER BY COALESCE(es.exam_date, er.graded_at) ASC, er.id ASC
    `)
    .all(selectedChild.id);

  const upcomingExams = db
    .prepare(`
      SELECT e.id, e.title, e.status, e.kktp, e.duration_minutes, sub.name AS subject_name,
             es.exam_date, es.start_time, es.end_time,
             COALESCE(ep.status, 'belum_mulai') AS participant_status
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      LEFT JOIN exam_participants ep ON ep.exam_id = e.id AND ep.student_id = ?
      WHERE e.class_name = ? AND e.status IN ('terjadwal', 'aktif', 'selesai')
      ORDER BY COALESCE(es.exam_date, e.created_at) DESC
    `)
    .all(selectedChild.id, selectedChild.class_name);

  res.json({
    children,
    selectedChild,
    results,
    upcomingExams,
  });
});
