import { Router } from 'express';
import { AuthenticatedRequest, hashPassword, requireRole } from '../auth.ts';
import {
  createNotification,
  db,
  getActiveAcademicYear,
  getAppSettingsMap,
  logActivity,
} from '../db.ts';
import {
  gradeAndComputeParticipantResult,
  notifyExamPublished,
  recalculateExamResultsForKktp,
} from '../grading.ts';

export const adminRouter = Router();
adminRouter.use(requireRole(['superadmin']));

// ==================== DASHBOARD ====================

adminRouter.get('/dashboard', (_req, res) => {
  const studentCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM students`).get() as { cnt: number }).cnt;
  const subjectCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM subjects`).get() as { cnt: number }).cnt;
  const activeExamCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM exams WHERE status = 'aktif'`).get() as { cnt: number }
  ).cnt;
  const completedExamCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM exams WHERE status = 'selesai'`).get() as { cnt: number }
  ).cnt;
  const questionCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM questions`).get() as { cnt: number }).cnt;

  const finishedParticipantsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM exam_participants WHERE status IN ('selesai', 'dihentikan')`)
      .get() as { cnt: number }
  ).cnt;

  // Students who have active exams not yet finished
  const pendingActiveCount = (
    db
      .prepare(`
        SELECT COUNT(*) AS cnt
        FROM exams e
        JOIN students s ON s.class_name = e.class_name
        LEFT JOIN exam_participants ep ON ep.exam_id = e.id AND ep.student_id = s.id
        WHERE e.status = 'aktif' AND (ep.id IS NULL OR ep.status IN ('belum_mulai', 'sedang_mengerjakan'))
      `)
      .get() as { cnt: number }
  ).cnt;

  const avgRow = db
    .prepare(`SELECT AVG(total_score) AS avg_score FROM exam_results`)
    .get() as { avg_score: number | null };
  const classAverageScore = avgRow.avg_score !== null ? Math.round(avgRow.avg_score * 10) / 10 : 0;

  const scoreProgression = db
    .prepare(`
      SELECT e.id, e.title, sub.name AS subject_name, e.class_name, e.kktp,
             ROUND(AVG(er.total_score), 1) AS average_score,
             COUNT(er.id) AS participant_count
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      JOIN exam_results er ON er.exam_id = e.id
      GROUP BY e.id
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT 12
    `)
    .all();

  const ongoingExams = db
    .prepare(`
      SELECT e.id, e.title, e.class_name, e.duration_minutes, e.kktp,
             sub.name AS subject_name, es.exam_date, es.start_time, es.end_time,
             (SELECT COUNT(*) FROM students s WHERE s.class_name = e.class_name) AS total_students,
             (SELECT COUNT(*) FROM exam_participants ep WHERE ep.exam_id = e.id AND ep.status IN ('selesai', 'dihentikan')) AS finished_students,
             (SELECT COUNT(*) FROM exam_participants ep WHERE ep.exam_id = e.id AND ep.status = 'sedang_mengerjakan') AS working_students
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      WHERE e.status = 'aktif'
      ORDER BY e.id DESC
    `)
    .all();

  const recentActivities = db
    .prepare(`SELECT * FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT 12`)
    .all();

  res.json({
    stats: {
      studentCount,
      subjectCount,
      activeExamCount,
      completedExamCount,
      questionCount,
      finishedParticipantsCount,
      pendingActiveCount,
      classAverageScore,
    },
    scoreProgression,
    ongoingExams,
    recentActivities,
  });
});

// ==================== STUDENTS MANAGEMENT ====================

adminRouter.get('/students', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT s.*, u.username, u.is_active
      FROM students s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.class_name ASC, s.full_name ASC
    `)
    .all() as Array<{
    id: number;
    user_id: number;
    nis: string;
    nisn: string | null;
    full_name: string;
    gender: 'L' | 'P';
    class_name: string;
    username: string;
    is_active: number;
  }>;

  const parentStmt = db.prepare(`
    SELECT p.id, p.full_name, u.username, p.whatsapp_number, psr.relationship_label
    FROM parent_student_relationships psr
    JOIN parents p ON p.id = psr.parent_id
    JOIN users u ON u.id = p.user_id
    WHERE psr.student_id = ?
  `);

  const students = rows.map((st) => {
    const parents = parentStmt.all(st.id) as Array<{
      id: number;
      full_name: string;
      username: string;
      whatsapp_number: string | null;
      relationship_label: string;
    }>;
    return {
      ...st,
      parents,
      parent_names: parents.map((p) => p.full_name).join(', '),
      parent_ids: parents.map((p) => p.id),
    };
  });

  res.json({ students });
});

adminRouter.post('/students', (req: AuthenticatedRequest, res) => {
  const {
    nis,
    nisn,
    fullName,
    gender,
    className,
    username,
    password,
    parentName,
    parentUsername,
    parentPassword,
    parentWhatsapp,
    existingParentId,
  } = req.body ?? {};

  if (!nis || !fullName || !gender || !className || !username || !password) {
    return res.status(400).json({ error: 'NIS, nama lengkap, jenis kelamin, kelas, username, dan password wajib diisi.' });
  }

  const studentRole = db.prepare(`SELECT id FROM roles WHERE name = 'student'`).get() as { id: number };
  const parentRole = db.prepare(`SELECT id FROM roles WHERE name = 'parent'`).get() as { id: number };
  const activeYear = getActiveAcademicYear();

  try {
    const result = db.transaction(() => {
      const cleanUsername = String(username).trim();
      const userInfo = db
        .prepare(`
          INSERT INTO users (username, password_hash, role_id, full_name, is_active)
          VALUES (?, ?, ?, ?, 1)
        `)
        .run(cleanUsername, hashPassword(String(password)), studentRole.id, String(fullName).trim());
      const studentUserId = Number(userInfo.lastInsertRowid);

      const studentInfo = db
        .prepare(`
          INSERT INTO students (user_id, nis, nisn, full_name, gender, class_name, academic_year_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          studentUserId,
          String(nis).trim(),
          nisn ? String(nisn).trim() : null,
          String(fullName).trim(),
          gender === 'P' ? 'P' : 'L',
          String(className).trim(),
          activeYear.id
        );
      const studentId = Number(studentInfo.lastInsertRowid);

      if (existingParentId) {
        db.prepare(`
          INSERT OR IGNORE INTO parent_student_relationships (parent_id, student_id, relationship_label)
          VALUES (?, ?, 'Orang Tua / Wali')
        `).run(Number(existingParentId), studentId);
      } else if (parentName && parentUsername) {
        const cleanParentUser = String(parentUsername).trim();
        const existingPUser = db
          .prepare(`
            SELECT p.id AS parent_id
            FROM users u
            JOIN parents p ON p.user_id = u.id
            WHERE u.username = ?
          `)
          .get(cleanParentUser) as { parent_id: number } | undefined;

        let parentId: number;
        if (existingPUser) {
          parentId = existingPUser.parent_id;
        } else {
          if (!parentPassword) {
            throw new Error('Password awal orang tua wajib diisi saat membuat akun orang tua baru.');
          }
          const pUserInfo = db
            .prepare(`
              INSERT INTO users (username, password_hash, role_id, full_name, is_active)
              VALUES (?, ?, ?, ?, 1)
            `)
            .run(cleanParentUser, hashPassword(String(parentPassword)), parentRole.id, String(parentName).trim());
          const pInfo = db
            .prepare(`INSERT INTO parents (user_id, full_name, whatsapp_number) VALUES (?, ?, ?)`)
            .run(
              Number(pUserInfo.lastInsertRowid),
              String(parentName).trim(),
              parentWhatsapp ? String(parentWhatsapp).trim() : null
            );
          parentId = Number(pInfo.lastInsertRowid);
        }

        db.prepare(`
          INSERT OR IGNORE INTO parent_student_relationships (parent_id, student_id, relationship_label)
          VALUES (?, ?, 'Orang Tua / Wali')
        `).run(parentId, studentId);
      }

      return studentId;
    })();

    logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'TAMBAH_SISWA', `Menambahkan siswa ${fullName} (${nis})`);
    res.json({ ok: true, id: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menambahkan siswa.';
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'NIS atau username sudah digunakan oleh akun lain.' });
    }
    res.status(400).json({ error: msg });
  }
});

adminRouter.put('/students/:id', (req: AuthenticatedRequest, res) => {
  const studentId = Number(req.params.id);
  const { nis, nisn, fullName, gender, className, username, parentIds } = req.body ?? {};
  const student = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId) as
    | { id: number; user_id: number }
    | undefined;
  if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE users SET username = ?, full_name = ?, updated_at = datetime('now') WHERE id = ?
      `).run(String(username).trim(), String(fullName).trim(), student.user_id);

      db.prepare(`
        UPDATE students
        SET nis = ?, nisn = ?, full_name = ?, gender = ?, class_name = ?
        WHERE id = ?
      `).run(
        String(nis).trim(),
        nisn ? String(nisn).trim() : null,
        String(fullName).trim(),
        gender === 'P' ? 'P' : 'L',
        String(className).trim(),
        studentId
      );

      if (Array.isArray(parentIds)) {
        db.prepare(`DELETE FROM parent_student_relationships WHERE student_id = ?`).run(studentId);
        const ins = db.prepare(`
          INSERT OR IGNORE INTO parent_student_relationships (parent_id, student_id, relationship_label)
          VALUES (?, ?, 'Orang Tua / Wali')
        `);
        for (const pid of parentIds) {
          ins.run(Number(pid), studentId);
        }
      }
    })();
    logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'EDIT_SISWA', `Memperbarui data siswa ${fullName}`);
    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui siswa.';
    if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'NIS atau username sudah digunakan.' });
    res.status(400).json({ error: msg });
  }
});

adminRouter.delete('/students/:id', (req: AuthenticatedRequest, res) => {
  const studentId = Number(req.params.id);
  const student = db.prepare(`SELECT user_id, full_name FROM students WHERE id = ?`).get(studentId) as
    | { user_id: number; full_name: string }
    | undefined;
  if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });

  db.prepare(`DELETE FROM users WHERE id = ?`).run(student.user_id);
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'HAPUS_SISWA', `Menghapus siswa ${student.full_name}`);
  res.json({ ok: true });
});

adminRouter.patch('/students/:id/toggle-active', (req: AuthenticatedRequest, res) => {
  const studentId = Number(req.params.id);
  const row = db
    .prepare(`SELECT u.id AS user_id, u.is_active, s.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?`)
    .get(studentId) as { user_id: number; is_active: number; full_name: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
  const nextState = row.is_active === 1 ? 0 : 1;
  db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(nextState, row.user_id);
  logActivity(
    req.auth!.userId,
    req.auth!.fullName,
    'superadmin',
    'STATUS_SISWA',
    `${nextState === 1 ? 'Mengaktifkan' : 'Menonaktifkan'} akun ${row.full_name}`
  );
  res.json({ ok: true, is_active: nextState });
});

adminRouter.post('/students/:id/reset-password', (req: AuthenticatedRequest, res) => {
  const studentId = Number(req.params.id);
  const { newPassword } = req.body ?? {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
  }
  const row = db
    .prepare(`SELECT u.id AS user_id, s.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?`)
    .get(studentId) as { user_id: number; full_name: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(String(newPassword)),
    row.user_id
  );
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'RESET_PASSWORD_SISWA', `Reset password ${row.full_name}`);
  res.json({ ok: true });
});

adminRouter.post('/students/import', (req: AuthenticatedRequest, res) => {
  const { rows } = req.body ?? {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Data impor kosong.' });
  }

  const studentRole = db.prepare(`SELECT id FROM roles WHERE name = 'student'`).get() as { id: number };
  const parentRole = db.prepare(`SELECT id FROM roles WHERE name = 'parent'`).get() as { id: number };
  const activeYear = getActiveAcademicYear();

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, unknown>;
    const nis = String(r.nis || '').trim();
    const fullName = String(r.fullName || '').trim();
    const username = String(r.username || '').trim();
    const password = String(r.password || '').trim();
    const className = String(r.className || '3A').trim();
    const gender = String(r.gender || 'L').toUpperCase().startsWith('P') ? 'P' : 'L';
    const nisn = r.nisn ? String(r.nisn).trim() : null;
    const parentName = String(r.parentName || '').trim();
    const parentUsername = String(r.parentUsername || '').trim();
    const parentPassword = String(r.parentPassword || '').trim();
    const parentWhatsapp = r.parentWhatsapp ? String(r.parentWhatsapp).trim() : null;

    if (!nis || !fullName || !username || !password) {
      errors.push(`Baris ${i + 1}: NIS, Nama Lengkap, Username, dan Password wajib diisi.`);
      continue;
    }

    try {
      db.transaction(() => {
        const uInfo = db
          .prepare(`INSERT INTO users (username, password_hash, role_id, full_name, is_active) VALUES (?, ?, ?, ?, 1)`)
          .run(username, hashPassword(password), studentRole.id, fullName);
        const sInfo = db
          .prepare(`
            INSERT INTO students (user_id, nis, nisn, full_name, gender, class_name, academic_year_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(Number(uInfo.lastInsertRowid), nis, nisn, fullName, gender, className, activeYear.id);
        const studentId = Number(sInfo.lastInsertRowid);

        if (parentName && parentUsername) {
          const existingP = db
            .prepare(`SELECT p.id FROM users u JOIN parents p ON p.user_id = u.id WHERE u.username = ?`)
            .get(parentUsername) as { id: number } | undefined;
          let parentId: number;
          if (existingP) {
            parentId = existingP.id;
          } else {
            const pPass = parentPassword || password;
            const puInfo = db
              .prepare(`INSERT INTO users (username, password_hash, role_id, full_name, is_active) VALUES (?, ?, ?, ?, 1)`)
              .run(parentUsername, hashPassword(pPass), parentRole.id, parentName);
            const pInfo = db
              .prepare(`INSERT INTO parents (user_id, full_name, whatsapp_number) VALUES (?, ?, ?)`)
              .run(Number(puInfo.lastInsertRowid), parentName, parentWhatsapp);
            parentId = Number(pInfo.lastInsertRowid);
          }
          db.prepare(`
            INSERT OR IGNORE INTO parent_student_relationships (parent_id, student_id, relationship_label)
            VALUES (?, ?, 'Orang Tua / Wali')
          `).run(parentId, studentId);
        }
      })();
      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal impor';
      errors.push(`Baris ${i + 1} (${fullName}): ${msg.includes('UNIQUE') ? 'NIS atau username duplikat' : msg}`);
    }
  }

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'IMPOR_SISWA', `Mengimpor ${imported} peserta didik dari Excel`);
  res.json({ imported, errors });
});

// ==================== PARENTS MANAGEMENT ====================

adminRouter.get('/parents', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT p.*, u.username, u.is_active
      FROM parents p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.full_name ASC
    `)
    .all() as Array<{
    id: number;
    user_id: number;
    full_name: string;
    whatsapp_number: string | null;
    username: string;
    is_active: number;
  }>;

  const childStmt = db.prepare(`
    SELECT s.id, s.nis, s.nisn, s.full_name, s.gender, s.class_name, psr.relationship_label
    FROM parent_student_relationships psr
    JOIN students s ON s.id = psr.student_id
    WHERE psr.parent_id = ?
  `);

  const parents = rows.map((p) => ({
    ...p,
    children: childStmt.all(p.id),
  }));

  res.json({ parents });
});

adminRouter.post('/parents', (req: AuthenticatedRequest, res) => {
  const { fullName, username, password, whatsappNumber, studentIds } = req.body ?? {};
  if (!fullName || !username || !password) {
    return res.status(400).json({ error: 'Nama orang tua, username, dan password wajib diisi.' });
  }
  const parentRole = db.prepare(`SELECT id FROM roles WHERE name = 'parent'`).get() as { id: number };
  try {
    const parentId = db.transaction(() => {
      const uInfo = db
        .prepare(`INSERT INTO users (username, password_hash, role_id, full_name, is_active) VALUES (?, ?, ?, ?, 1)`)
        .run(String(username).trim(), hashPassword(String(password)), parentRole.id, String(fullName).trim());
      const pInfo = db
        .prepare(`INSERT INTO parents (user_id, full_name, whatsapp_number) VALUES (?, ?, ?)`)
        .run(Number(uInfo.lastInsertRowid), String(fullName).trim(), whatsappNumber ? String(whatsappNumber).trim() : null);
      const pid = Number(pInfo.lastInsertRowid);

      if (Array.isArray(studentIds)) {
        const ins = db.prepare(`
          INSERT OR IGNORE INTO parent_student_relationships (parent_id, student_id, relationship_label)
          VALUES (?, ?, 'Orang Tua / Wali')
        `);
        for (const sid of studentIds) ins.run(pid, Number(sid));
      }
      return pid;
    })();
    logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'TAMBAH_ORANG_TUA', `Menambahkan akun orang tua ${fullName}`);
    res.json({ ok: true, id: parentId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal menambah akun orang tua.';
    if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'Username orang tua sudah digunakan.' });
    res.status(400).json({ error: msg });
  }
});

adminRouter.put('/parents/:id', (req: AuthenticatedRequest, res) => {
  const parentId = Number(req.params.id);
  const { fullName, username, whatsappNumber, studentIds } = req.body ?? {};
  const parent = db.prepare(`SELECT * FROM parents WHERE id = ?`).get(parentId) as
    | { id: number; user_id: number }
    | undefined;
  if (!parent) return res.status(404).json({ error: 'Akun orang tua tidak ditemukan.' });

  try {
    db.transaction(() => {
      db.prepare(`UPDATE users SET username = ?, full_name = ?, updated_at = datetime('now') WHERE id = ?`).run(
        String(username).trim(),
        String(fullName).trim(),
        parent.user_id
      );
      db.prepare(`UPDATE parents SET full_name = ?, whatsapp_number = ? WHERE id = ?`).run(
        String(fullName).trim(),
        whatsappNumber ? String(whatsappNumber).trim() : null,
        parentId
      );
      if (Array.isArray(studentIds)) {
        db.prepare(`DELETE FROM parent_student_relationships WHERE parent_id = ?`).run(parentId);
        const ins = db.prepare(`
          INSERT OR IGNORE INTO parent_student_relationships (parent_id, student_id, relationship_label)
          VALUES (?, ?, 'Orang Tua / Wali')
        `);
        for (const sid of studentIds) ins.run(parentId, Number(sid));
      }
    })();
    logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'EDIT_ORANG_TUA', `Memperbarui akun orang tua ${fullName}`);
    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal memperbarui orang tua.';
    if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'Username sudah digunakan.' });
    res.status(400).json({ error: msg });
  }
});

adminRouter.delete('/parents/:id', (req: AuthenticatedRequest, res) => {
  const parentId = Number(req.params.id);
  const parent = db.prepare(`SELECT user_id, full_name FROM parents WHERE id = ?`).get(parentId) as
    | { user_id: number; full_name: string }
    | undefined;
  if (!parent) return res.status(404).json({ error: 'Akun orang tua tidak ditemukan.' });
  db.prepare(`DELETE FROM users WHERE id = ?`).run(parent.user_id);
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'HAPUS_ORANG_TUA', `Menghapus akun orang tua ${parent.full_name}`);
  res.json({ ok: true });
});

adminRouter.patch('/parents/:id/toggle-active', (req: AuthenticatedRequest, res) => {
  const parentId = Number(req.params.id);
  const row = db
    .prepare(`SELECT u.id AS user_id, u.is_active, p.full_name FROM parents p JOIN users u ON u.id = p.user_id WHERE p.id = ?`)
    .get(parentId) as { user_id: number; is_active: number; full_name: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Orang tua tidak ditemukan.' });
  const next = row.is_active === 1 ? 0 : 1;
  db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(next, row.user_id);
  res.json({ ok: true, is_active: next });
});

adminRouter.post('/parents/:id/reset-password', (req: AuthenticatedRequest, res) => {
  const parentId = Number(req.params.id);
  const { newPassword } = req.body ?? {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
  }
  const row = db
    .prepare(`SELECT u.id AS user_id, p.full_name FROM parents p JOIN users u ON u.id = p.user_id WHERE p.id = ?`)
    .get(parentId) as { user_id: number; full_name: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Orang tua tidak ditemukan.' });
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(String(newPassword)),
    row.user_id
  );
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'RESET_PASSWORD_ORANG_TUA', `Reset password ${row.full_name}`);
  res.json({ ok: true });
});

// ==================== SUBJECTS MANAGEMENT ====================

adminRouter.get('/subjects', (_req, res) => {
  const settingsMap = getAppSettingsMap();
  const defaultKktp = Number(settingsMap.default_kktp || 75);
  const subjects = db
    .prepare(`
      SELECT s.*, ay.year_label AS academic_year_label,
             COALESCE((SELECT k.threshold FROM kktp_settings k WHERE k.subject_id = s.id AND k.exam_id IS NULL LIMIT 1), ?) AS kktp_threshold,
             (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id) AS question_count,
             (SELECT COUNT(*) FROM exams e WHERE e.subject_id = s.id) AS exam_count
      FROM subjects s
      JOIN academic_years ay ON ay.id = s.academic_year_id
      ORDER BY s.name ASC
    `)
    .all(defaultKktp);
  res.json({ subjects });
});

adminRouter.post('/subjects', (req: AuthenticatedRequest, res) => {
  const { name, className, semester, kktp } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Nama mata pelajaran wajib diisi.' });
  const activeYear = getActiveAcademicYear();
  const info = db
    .prepare(`INSERT INTO subjects (name, class_name, semester, academic_year_id) VALUES (?, ?, ?, ?)`)
    .run(
      String(name).trim(),
      String(className || 'Kelas III').trim(),
      String(semester || activeYear.semester).trim(),
      activeYear.id
    );
  const subjectId = Number(info.lastInsertRowid);
  const settingsMap = getAppSettingsMap();
  const defaultKktp = Number(kktp || settingsMap.default_kktp || 75);
  db.prepare(`INSERT INTO kktp_settings (subject_id, exam_id, threshold) VALUES (?, NULL, ?)`).run(subjectId, defaultKktp);
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'TAMBAH_MAPEL', `Menambahkan mata pelajaran ${name}`);
  res.json({ ok: true, id: subjectId });
});

adminRouter.post('/subjects/seed-standard', (req: AuthenticatedRequest, res) => {
  const standardSubjects = [
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'IPAS',
    'Seni Budaya dan Prakarya (SBdP)',
    'Pendidikan Agama',
    'Bahasa Sunda',
    'Pendidikan Lingkungan Hidup (PLH)',
  ];
  const activeYear = getActiveAcademicYear();
  const settingsMap = getAppSettingsMap();
  const defaultKktp = Number(settingsMap.default_kktp || 75);

  let added = 0;
  db.transaction(() => {
    for (const subjName of standardSubjects) {
      const exists = db.prepare(`SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)`).get(subjName);
      if (!exists) {
        const info = db
          .prepare(`INSERT INTO subjects (name, class_name, semester, academic_year_id) VALUES (?, 'Kelas III', ?, ?)`)
          .run(subjName, activeYear.semester, activeYear.id);
        db.prepare(`INSERT INTO kktp_settings (subject_id, exam_id, threshold) VALUES (?, NULL, ?)`).run(
          Number(info.lastInsertRowid),
          defaultKktp
        );
        added++;
      }
    }
  })();

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'TAMBAH_MAPEL_STANDAR', `Menambahkan ${added} mata pelajaran standar Kurikulum Merdeka Kelas 3`);
  res.json({ ok: true, added });
});

adminRouter.put('/subjects/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { name, className, semester } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Nama mata pelajaran wajib diisi.' });
  db.prepare(`UPDATE subjects SET name = ?, class_name = ?, semester = ? WHERE id = ?`).run(
    String(name).trim(),
    String(className || 'Kelas III').trim(),
    String(semester || 'Ganjil').trim(),
    id
  );
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'EDIT_MAPEL', `Memperbarui mata pelajaran ${name}`);
  res.json({ ok: true });
});

adminRouter.delete('/subjects/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const subj = db.prepare(`SELECT name FROM subjects WHERE id = ?`).get(id) as { name: string } | undefined;
  db.prepare(`DELETE FROM subjects WHERE id = ?`).run(id);
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'HAPUS_MAPEL', `Menghapus mata pelajaran ${subj?.name || id}`);
  res.json({ ok: true });
});

// ==================== BANK SOAL (QUESTIONS) ====================

adminRouter.get('/questions', (req, res) => {
  const subjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
  let query = `
    SELECT q.*, sub.name AS subject_name
    FROM questions q
    JOIN subjects sub ON sub.id = q.subject_id
  `;
  const params: unknown[] = [];
  if (subjectId) {
    query += ` WHERE q.subject_id = ?`;
    params.push(subjectId);
  }
  query += ` ORDER BY q.created_at DESC, q.id DESC`;

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  const optStmt = db.prepare(`SELECT * FROM answer_options WHERE question_id = ? ORDER BY option_label ASC`);

  const questions = rows.map((q) => ({
    ...q,
    options: optStmt.all(q.id),
  }));
  res.json({ questions });
});

adminRouter.post('/questions', (req: AuthenticatedRequest, res) => {
  const {
    subjectId,
    questionType,
    questionText,
    questionImage,
    correctAnswerText,
    matchMode,
    weight,
    topic,
    learningObjective,
    difficulty,
    options,
  } = req.body ?? {};

  if (!subjectId || !questionType || !questionText) {
    return res.status(400).json({ error: 'Mata pelajaran, jenis soal, dan teks soal wajib diisi.' });
  }

  const questionId = db.transaction(() => {
    // Ensure a question_bank entry exists for this subject
    let bank = db.prepare(`SELECT id FROM question_banks WHERE subject_id = ? LIMIT 1`).get(Number(subjectId)) as
      | { id: number }
      | undefined;
    if (!bank) {
      const subj = db.prepare(`SELECT name FROM subjects WHERE id = ?`).get(Number(subjectId)) as { name: string } | undefined;
      const bInfo = db
        .prepare(`INSERT INTO question_banks (subject_id, title, description) VALUES (?, ?, ?)`)
        .run(Number(subjectId), `Bank Soal ${subj?.name || ''}`, 'Bank soal ulangan harian kelas 3');
      bank = { id: Number(bInfo.lastInsertRowid) };
    }

    const qInfo = db
      .prepare(`
        INSERT INTO questions (
          bank_id, subject_id, question_type, question_text, question_image,
          correct_answer_text, match_mode, weight, topic, learning_objective, difficulty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        bank.id,
        Number(subjectId),
        questionType,
        String(questionText).trim(),
        questionImage || null,
        correctAnswerText ? String(correctAnswerText).trim() : null,
        matchMode || 'case_insensitive',
        Number(weight || 1),
        String(topic || '').trim(),
        String(learningObjective || '').trim(),
        difficulty || 'sedang'
      );
    const qid = Number(qInfo.lastInsertRowid);

    if ((questionType === 'pg_4' || questionType === 'pg_3') && Array.isArray(options)) {
      const insOpt = db.prepare(`
        INSERT INTO answer_options (question_id, option_label, option_text, option_image, is_correct)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const opt of options) {
        insOpt.run(
          qid,
          String(opt.option_label).toUpperCase(),
          String(opt.option_text || '').trim(),
          opt.option_image || null,
          opt.is_correct ? 1 : 0
        );
      }
    }
    return qid;
  })();

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'TAMBAH_SOAL', `Menambahkan soal baru ke Bank Soal (#${questionId})`);
  res.json({ ok: true, id: questionId });
});

adminRouter.put('/questions/:id', (req: AuthenticatedRequest, res) => {
  const qid = Number(req.params.id);
  const {
    subjectId,
    questionType,
    questionText,
    questionImage,
    correctAnswerText,
    matchMode,
    weight,
    topic,
    learningObjective,
    difficulty,
    options,
  } = req.body ?? {};

  if (!subjectId || !questionType || !questionText) {
    return res.status(400).json({ error: 'Mata pelajaran, jenis soal, dan teks soal wajib diisi.' });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE questions
      SET subject_id = ?, question_type = ?, question_text = ?, question_image = ?,
          correct_answer_text = ?, match_mode = ?, weight = ?, topic = ?,
          learning_objective = ?, difficulty = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      Number(subjectId),
      questionType,
      String(questionText).trim(),
      questionImage || null,
      correctAnswerText ? String(correctAnswerText).trim() : null,
      matchMode || 'case_insensitive',
      Number(weight || 1),
      String(topic || '').trim(),
      String(learningObjective || '').trim(),
      difficulty || 'sedang',
      qid
    );

    db.prepare(`DELETE FROM answer_options WHERE question_id = ?`).run(qid);
    if ((questionType === 'pg_4' || questionType === 'pg_3') && Array.isArray(options)) {
      const insOpt = db.prepare(`
        INSERT INTO answer_options (question_id, option_label, option_text, option_image, is_correct)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const opt of options) {
        insOpt.run(
          qid,
          String(opt.option_label).toUpperCase(),
          String(opt.option_text || '').trim(),
          opt.option_image || null,
          opt.is_correct ? 1 : 0
        );
      }
    }
  })();

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'EDIT_SOAL', `Memperbarui soal #${qid}`);
  res.json({ ok: true });
});

adminRouter.delete('/questions/:id', (req: AuthenticatedRequest, res) => {
  const qid = Number(req.params.id);
  db.prepare(`DELETE FROM questions WHERE id = ?`).run(qid);
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'HAPUS_SOAL', `Menghapus soal #${qid} dari Bank Soal`);
  res.json({ ok: true });
});

// ==================== EXAMS & SCHEDULES ====================

adminRouter.get('/exams', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT e.*, sub.name AS subject_name,
             COALESCE(es.exam_date, '') AS exam_date,
             COALESCE(es.start_time, '') AS start_time,
             COALESCE(es.end_time, '') AS end_time,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS assigned_question_count,
             (SELECT COUNT(*) FROM exam_participants ep WHERE ep.exam_id = e.id AND ep.status IN ('selesai', 'dihentikan')) AS submitted_count,
             (SELECT COUNT(*) FROM students s WHERE s.class_name = e.class_name) AS total_class_students,
             EXISTS(
               SELECT 1 FROM exam_questions eq JOIN questions q ON q.id = eq.question_id
               WHERE eq.exam_id = e.id AND q.question_type = 'uraian'
             ) AS has_essay
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      ORDER BY e.created_at DESC, e.id DESC
    `)
    .all();
  res.json({ exams: rows });
});

adminRouter.get('/exams/:id', (req, res) => {
  const examId = Number(req.params.id);
  const exam = db
    .prepare(`
      SELECT e.*, sub.name AS subject_name,
             COALESCE(es.exam_date, '') AS exam_date,
             COALESCE(es.start_time, '') AS start_time,
             COALESCE(es.end_time, '') AS end_time
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      WHERE e.id = ?
    `)
    .get(examId);
  if (!exam) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  const questionRows = db
    .prepare(`
      SELECT q.*, eq.sort_order, eq.custom_weight, sub.name AS subject_name
      FROM exam_questions eq
      JOIN questions q ON q.id = eq.question_id
      JOIN subjects sub ON sub.id = q.subject_id
      WHERE eq.exam_id = ?
      ORDER BY eq.sort_order ASC, eq.id ASC
    `)
    .all(examId) as Array<Record<string, unknown>>;

  const optStmt = db.prepare(`SELECT * FROM answer_options WHERE question_id = ? ORDER BY option_label ASC`);
  const questions = questionRows.map((q) => ({ ...q, options: optStmt.all(q.id) }));

  res.json({ exam, questions });
});

adminRouter.post('/exams', (req: AuthenticatedRequest, res) => {
  const {
    title,
    subjectId,
    className,
    topic,
    learningObjective,
    durationMinutes,
    maxScore,
    kktp,
    instructions,
    status,
    isResultsPublished,
    allowReviewKeys,
    examDate,
    startTime,
    endTime,
    questionIds,
  } = req.body ?? {};

  if (!title || !subjectId || !className) {
    return res.status(400).json({ error: 'Judul ulangan, mata pelajaran, dan kelas wajib diisi.' });
  }

  const activeYear = getActiveAcademicYear();
  const qIds: number[] = Array.isArray(questionIds) ? questionIds.map(Number) : [];

  const examId = db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO exams (
          title, subject_id, class_name, topic, learning_objective,
          duration_minutes, question_count, max_score, kktp, instructions,
          status, is_results_published, allow_review_keys, academic_year_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        String(title).trim(),
        Number(subjectId),
        String(className).trim(),
        String(topic || '').trim(),
        String(learningObjective || '').trim(),
        Number(durationMinutes || 45),
        qIds.length,
        Number(maxScore || 100),
        Number(kktp || 75),
        String(instructions || '').trim(),
        status || 'draft',
        isResultsPublished ? 1 : 0,
        allowReviewKeys ? 1 : 0,
        activeYear.id
      );
    const eid = Number(info.lastInsertRowid);

    if (examDate || startTime || endTime) {
      db.prepare(`INSERT INTO exam_schedules (exam_id, exam_date, start_time, end_time) VALUES (?, ?, ?, ?)`).run(
        eid,
        examDate || new Date().toISOString().slice(0, 10),
        startTime || '07:30',
        endTime || '09:00'
      );
    }

    db.prepare(`INSERT INTO kktp_settings (subject_id, exam_id, threshold) VALUES (?, ?, ?)`).run(
      Number(subjectId),
      eid,
      Number(kktp || 75)
    );

    const insEq = db.prepare(`INSERT INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)`);
    qIds.forEach((qid, idx) => {
      insEq.run(eid, qid, idx + 1);
    });

    return eid;
  })();

  if (status === 'aktif' || status === 'terjadwal') {
    const students = db
      .prepare(`SELECT user_id FROM students WHERE class_name = ?`)
      .all(String(className).trim()) as Array<{ user_id: number }>;
    for (const s of students) {
      createNotification(
        s.user_id,
        status === 'aktif' ? 'Ulangan Baru Tersedia' : 'Jadwal Ulangan Baru',
        `Ulangan "${title}" (${examDate || 'segera'}) telah ${status === 'aktif' ? 'dibuka' : 'dijadwalkan'} untuk kelas ${className}.`,
        'info',
        'available-exams'
      );
    }
  }

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'BUAT_ULANGAN', `Membuat ulangan "${title}" (${className})`);
  res.json({ ok: true, id: examId });
});

adminRouter.put('/exams/:id', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const {
    title,
    subjectId,
    className,
    topic,
    learningObjective,
    durationMinutes,
    maxScore,
    kktp,
    instructions,
    status,
    isResultsPublished,
    allowReviewKeys,
    examDate,
    startTime,
    endTime,
    questionIds,
  } = req.body ?? {};

  const existing = db.prepare(`SELECT id, kktp FROM exams WHERE id = ?`).get(examId) as { id: number; kktp: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  const qIds: number[] = Array.isArray(questionIds) ? questionIds.map(Number) : [];

  db.transaction(() => {
    db.prepare(`
      UPDATE exams
      SET title = ?, subject_id = ?, class_name = ?, topic = ?, learning_objective = ?,
          duration_minutes = ?, question_count = ?, max_score = ?, kktp = ?, instructions = ?,
          status = ?, is_results_published = ?, allow_review_keys = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      String(title).trim(),
      Number(subjectId),
      String(className).trim(),
      String(topic || '').trim(),
      String(learningObjective || '').trim(),
      Number(durationMinutes || 45),
      qIds.length,
      Number(maxScore || 100),
      Number(kktp || 75),
      String(instructions || '').trim(),
      status || 'draft',
      isResultsPublished ? 1 : 0,
      allowReviewKeys ? 1 : 0,
      examId
    );

    db.prepare(`
      INSERT INTO exam_schedules (exam_id, exam_date, start_time, end_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (exam_id) DO UPDATE SET
        exam_date = excluded.exam_date,
        start_time = excluded.start_time,
        end_time = excluded.end_time
    `).run(examId, examDate || new Date().toISOString().slice(0, 10), startTime || '07:30', endTime || '09:00');

    if (Array.isArray(questionIds)) {
      db.prepare(`DELETE FROM exam_questions WHERE exam_id = ?`).run(examId);
      const insEq = db.prepare(`INSERT INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)`);
      qIds.forEach((qid, idx) => insEq.run(examId, qid, idx + 1));
    }

    db.prepare(`DELETE FROM kktp_settings WHERE exam_id = ?`).run(examId);
    db.prepare(`INSERT INTO kktp_settings (subject_id, exam_id, threshold) VALUES (?, ?, ?)`).run(
      Number(subjectId),
      examId,
      Number(kktp || 75)
    );
  })();

  if (Number(kktp || 75) !== existing.kktp) {
    recalculateExamResultsForKktp(examId, Number(kktp || 75));
  }

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'EDIT_ULANGAN', `Memperbarui ulangan "${title}"`);
  res.json({ ok: true });
});

adminRouter.delete('/exams/:id', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const exam = db.prepare(`SELECT title FROM exams WHERE id = ?`).get(examId) as { title: string } | undefined;
  db.prepare(`DELETE FROM exams WHERE id = ?`).run(examId);
  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'HAPUS_ULANGAN', `Menghapus ulangan "${exam?.title || examId}"`);
  res.json({ ok: true });
});

adminRouter.post('/exams/:id/copy', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const source = db.prepare(`SELECT * FROM exams WHERE id = ?`).get(examId) as Record<string, unknown> | undefined;
  if (!source) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  const sched = db.prepare(`SELECT * FROM exam_schedules WHERE exam_id = ?`).get(examId) as
    | { exam_date: string; start_time: string; end_time: string }
    | undefined;
  const qRows = db
    .prepare(`SELECT question_id, sort_order, custom_weight FROM exam_questions WHERE exam_id = ? ORDER BY sort_order ASC`)
    .all(examId) as Array<{ question_id: number; sort_order: number; custom_weight: number | null }>;

  const newId = db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO exams (
          title, subject_id, class_name, topic, learning_objective,
          duration_minutes, question_count, max_score, kktp, instructions,
          status, is_results_published, allow_review_keys, academic_year_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)
      `)
      .run(
        `${source.title} (Salinan)`,
        source.subject_id,
        source.class_name,
        source.topic,
        source.learning_objective,
        source.duration_minutes,
        source.question_count,
        source.max_score,
        source.kktp,
        source.instructions,
        source.allow_review_keys,
        source.academic_year_id
      );
    const nid = Number(info.lastInsertRowid);
    if (sched) {
      db.prepare(`INSERT INTO exam_schedules (exam_id, exam_date, start_time, end_time) VALUES (?, ?, ?, ?)`).run(
        nid,
        sched.exam_date,
        sched.start_time,
        sched.end_time
      );
    }
    const insQ = db.prepare(`INSERT INTO exam_questions (exam_id, question_id, sort_order, custom_weight) VALUES (?, ?, ?, ?)`);
    for (const q of qRows) insQ.run(nid, q.question_id, q.sort_order, q.custom_weight);
    return nid;
  })();

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'SALIN_ULANGAN', `Menyalin ulangan "${source.title}"`);
  res.json({ ok: true, id: newId });
});

adminRouter.patch('/exams/:id/status', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!['draft', 'terjadwal', 'aktif', 'selesai'].includes(status)) {
    return res.status(400).json({ error: 'Status ulangan tidak valid.' });
  }
  const exam = db.prepare(`SELECT id, title, class_name FROM exams WHERE id = ?`).get(examId) as
    | { id: number; title: string; class_name: string }
    | undefined;
  if (!exam) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  if (status === 'aktif') {
    const qCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM exam_questions WHERE exam_id = ?`).get(examId) as { cnt: number }).cnt;
    if (qCount === 0) {
      return res.status(400).json({ error: 'Tambahkan minimal 1 soal sebelum mengaktifkan ulangan.' });
    }
  }

  db.prepare(`UPDATE exams SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, examId);

  if (status === 'aktif' || status === 'terjadwal') {
    const students = db
      .prepare(`SELECT user_id FROM students WHERE class_name = ?`)
      .all(exam.class_name) as Array<{ user_id: number }>;
    for (const s of students) {
      createNotification(
        s.user_id,
        status === 'aktif' ? 'Ulangan Sedang Berlangsung' : 'Ulangan Dijadwalkan',
        status === 'aktif'
          ? `Ulangan "${exam.title}" sudah aktif dan siap dikerjakan.`
          : `Ulangan "${exam.title}" telah dijadwalkan untuk kelas ${exam.class_name}.`,
        'info',
        'available-exams'
      );
    }
  }

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'UBAH_STATUS_ULANGAN', `Mengubah status "${exam.title}" menjadi ${status}`);
  res.json({ ok: true });
});

adminRouter.patch('/exams/:id/publish', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const { published } = req.body ?? {};
  const flag = published ? 1 : 0;

  const exam = db.prepare(`SELECT id, title FROM exams WHERE id = ?`).get(examId) as { id: number; title: string } | undefined;
  if (!exam) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  db.transaction(() => {
    db.prepare(`UPDATE exams SET is_results_published = ?, updated_at = datetime('now') WHERE id = ?`).run(flag, examId);
    db.prepare(`UPDATE exam_results SET is_published = ? WHERE exam_id = ?`).run(flag, examId);
  })();

  if (flag === 1) {
    notifyExamPublished(examId);
  }

  logActivity(
    req.auth!.userId,
    req.auth!.fullName,
    'superadmin',
    'PUBLIKASI_NILAI',
    `${flag === 1 ? 'Memublikasikan' : 'Menarik publikasi'} nilai ulangan "${exam.title}"`
  );
  res.json({ ok: true, is_results_published: flag });
});

// ==================== LIVE MONITORING & SECURITY ====================

adminRouter.get('/exams/:id/monitor', (req, res) => {
  const examId = Number(req.params.id);
  const exam = db
    .prepare(`SELECT e.*, sub.name AS subject_name FROM exams e JOIN subjects sub ON sub.id = e.subject_id WHERE e.id = ?`)
    .get(examId) as { id: number; title: string; class_name: string; question_count: number } | undefined;
  if (!exam) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  const totalQuestions = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM exam_questions WHERE exam_id = ?`).get(examId) as { cnt: number }
  ).cnt;

  const participants = db
    .prepare(`
      SELECT s.id AS student_id, s.nis, s.full_name, s.class_name,
             ep.id AS participant_id,
             COALESCE(ep.status, 'belum_mulai') AS status,
             ep.started_at, ep.finished_at, ep.device_lock_token, ep.last_heartbeat_at, ep.reset_count,
             (SELECT COUNT(*) FROM student_answers sa WHERE sa.participant_id = ep.id AND (sa.selected_option IS NOT NULL OR TRIM(COALESCE(sa.answer_text, '')) != '')) AS answered_count,
             er.total_score, er.is_passed, er.is_published
      FROM students s
      LEFT JOIN exam_participants ep ON ep.student_id = s.id AND ep.exam_id = ?
      LEFT JOIN exam_results er ON er.participant_id = ep.id
      WHERE s.class_name = ?
      ORDER BY s.full_name ASC
    `)
    .all(examId, exam.class_name);

  res.json({ exam, totalQuestions, participants });
});

adminRouter.post('/exams/:id/reset-participant/:studentId', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const studentId = Number(req.params.studentId);
  const mode = req.body?.mode === 'device_only' ? 'device_only' : 'full';

  const participant = db
    .prepare(`SELECT id FROM exam_participants WHERE exam_id = ? AND student_id = ?`)
    .get(examId, studentId) as { id: number } | undefined;

  if (!participant) {
    return res.status(404).json({ error: 'Peserta belum memiliki sesi ujian.' });
  }

  const student = db.prepare(`SELECT full_name FROM students WHERE id = ?`).get(studentId) as { full_name: string } | undefined;

  if (mode === 'device_only') {
    db.prepare(`UPDATE exam_participants SET device_lock_token = NULL WHERE id = ?`).run(participant.id);
    logActivity(
      req.auth!.userId,
      req.auth!.fullName,
      'superadmin',
      'RESET_PERANGKAT',
      `Membuka kunci perangkat ujian untuk ${student?.full_name || studentId}`
    );
  } else {
    db.transaction(() => {
      db.prepare(`DELETE FROM exam_results WHERE participant_id = ?`).run(participant.id);
      db.prepare(`DELETE FROM student_answers WHERE participant_id = ?`).run(participant.id);
      db.prepare(`
        UPDATE exam_participants
        SET status = 'belum_mulai', started_at = NULL, finished_at = NULL,
            device_lock_token = NULL, reset_count = reset_count + 1
        WHERE id = ?
      `).run(participant.id);
    })();
    logActivity(
      req.auth!.userId,
      req.auth!.fullName,
      'superadmin',
      'RESET_UJIAN',
      `Mereset ulangan untuk ${student?.full_name || studentId}`
    );
  }

  res.json({ ok: true });
});

adminRouter.post('/exams/:id/force-finish/:studentId', (req: AuthenticatedRequest, res) => {
  const examId = Number(req.params.id);
  const studentId = Number(req.params.studentId);

  let participant = db
    .prepare(`SELECT id, status FROM exam_participants WHERE exam_id = ? AND student_id = ?`)
    .get(examId, studentId) as { id: number; status: string } | undefined;

  if (!participant) {
    const info = db
      .prepare(`
        INSERT INTO exam_participants (exam_id, student_id, status, started_at, finished_at)
        VALUES (?, ?, 'dihentikan', datetime('now'), datetime('now'))
      `)
      .run(examId, studentId);
    participant = { id: Number(info.lastInsertRowid), status: 'dihentikan' };
  } else {
    db.prepare(`
      UPDATE exam_participants SET status = 'dihentikan', finished_at = datetime('now') WHERE id = ?
    `).run(participant.id);
  }

  gradeAndComputeParticipantResult(participant.id, { autoPublishIfNoEssay: false });
  const student = db.prepare(`SELECT full_name FROM students WHERE id = ?`).get(studentId) as { full_name: string } | undefined;
  logActivity(
    req.auth!.userId,
    req.auth!.fullName,
    'superadmin',
    'AKHIRI_UJIAN_PAKSA',
    `Mengakhiri ujian ${student?.full_name || studentId} oleh Superadmin`
  );
  res.json({ ok: true });
});

// ==================== RESULTS & ESSAY GRADING ====================

adminRouter.get('/exams/:id/results', (req, res) => {
  const examId = Number(req.params.id);
  const exam = db
    .prepare(`SELECT e.*, sub.name AS subject_name FROM exams e JOIN subjects sub ON sub.id = e.subject_id WHERE e.id = ?`)
    .get(examId) as { id: number; class_name: string } | undefined;
  if (!exam) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  const results = db
    .prepare(`
      SELECT er.*, s.nis, s.full_name AS student_name, s.class_name,
             ep.status AS participant_status, ep.started_at, ep.finished_at
      FROM exam_results er
      JOIN students s ON s.id = er.student_id
      JOIN exam_participants ep ON ep.id = er.participant_id
      WHERE er.exam_id = ?
      ORDER BY er.total_score DESC, s.full_name ASC
    `)
    .all(examId);

  const notTaken = db
    .prepare(`
      SELECT s.id, s.nis, s.full_name, s.class_name, COALESCE(ep.status, 'belum_mulai') AS participant_status
      FROM students s
      LEFT JOIN exam_participants ep ON ep.student_id = s.id AND ep.exam_id = ?
      WHERE s.class_name = ? AND (ep.id IS NULL OR ep.status IN ('belum_mulai', 'sedang_mengerjakan'))
      ORDER BY s.full_name ASC
    `)
    .all(examId, exam.class_name);

  res.json({ exam, results, notTaken });
});

adminRouter.get('/results/:participantId/detail', (req, res) => {
  const participantId = Number(req.params.participantId);
  const participant = db
    .prepare(`
      SELECT ep.*, s.nis, s.full_name AS student_name, s.class_name,
             e.title AS exam_title, e.max_score, e.kktp, sub.name AS subject_name,
             er.id AS result_id, er.total_score, er.percentage, er.is_passed, er.teacher_note, er.is_published
      FROM exam_participants ep
      JOIN students s ON s.id = ep.student_id
      JOIN exams e ON e.id = ep.exam_id
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_results er ON er.participant_id = ep.id
      WHERE ep.id = ?
    `)
    .get(participantId) as Record<string, unknown> | undefined;

  if (!participant) return res.status(404).json({ error: 'Detail hasil tidak ditemukan.' });

  const items = db
    .prepare(`
      SELECT q.id AS question_id, q.question_type, q.question_text, q.question_image,
             q.correct_answer_text, q.weight, eq.custom_weight, eq.sort_order,
             sa.selected_option, sa.answer_text, sa.is_correct, sa.score_awarded, sa.teacher_feedback
      FROM exam_questions eq
      JOIN questions q ON q.id = eq.question_id
      LEFT JOIN student_answers sa ON sa.question_id = q.id AND sa.participant_id = ?
      WHERE eq.exam_id = ?
      ORDER BY eq.sort_order ASC, eq.id ASC
    `)
    .all(participantId, participant.exam_id) as Array<Record<string, unknown>>;

  const optStmt = db.prepare(`SELECT * FROM answer_options WHERE question_id = ? ORDER BY option_label ASC`);
  const detailedItems = items.map((it) => ({
    ...it,
    effective_weight: it.custom_weight ?? it.weight ?? 1,
    options: optStmt.all(it.question_id),
  }));

  res.json({ participant, items: detailedItems });
});

adminRouter.post('/results/:participantId/grade', (req: AuthenticatedRequest, res) => {
  const participantId = Number(req.params.participantId);
  const { questionScores, teacherNote, publishNow } = req.body ?? {};

  const participant = db
    .prepare(`SELECT id, exam_id, student_id FROM exam_participants WHERE id = ?`)
    .get(participantId) as { id: number; exam_id: number; student_id: number } | undefined;
  if (!participant) return res.status(404).json({ error: 'Peserta tidak ditemukan.' });

  db.transaction(() => {
    if (Array.isArray(questionScores)) {
      const upsert = db.prepare(`
        INSERT INTO student_answers (participant_id, question_id, score_awarded, teacher_feedback, is_correct, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT (participant_id, question_id) DO UPDATE SET
          score_awarded = excluded.score_awarded,
          teacher_feedback = excluded.teacher_feedback,
          is_correct = excluded.is_correct,
          updated_at = datetime('now')
      `);
      for (const qs of questionScores as Array<{
        questionId: number;
        scoreAwarded: number;
        maxWeight: number;
        feedback?: string;
      }>) {
        const clamped = Math.min(Number(qs.maxWeight || 100), Math.max(0, Number(qs.scoreAwarded || 0)));
        const isCorrectFlag = clamped >= Number(qs.maxWeight || 1) ? 1 : clamped > 0 ? 1 : 0;
        upsert.run(participantId, Number(qs.questionId), clamped, qs.feedback || '', isCorrectFlag);
      }
    }
  })();

  const graded = gradeAndComputeParticipantResult(participantId, { autoPublishIfNoEssay: false });

  db.prepare(`
    UPDATE exam_results
    SET teacher_note = ?,
        is_published = CASE WHEN ? = 1 THEN 1 ELSE is_published END
    WHERE id = ?
  `).run(String(teacherNote || ''), publishNow ? 1 : 0, graded.resultId);

  if (publishNow) {
    const exam = db.prepare(`SELECT title FROM exams WHERE id = ?`).get(participant.exam_id) as { title: string };
    const st = db.prepare(`SELECT user_id, full_name FROM students WHERE id = ?`).get(participant.student_id) as {
      user_id: number;
      full_name: string;
    };
    createNotification(
      st.user_id,
      'Nilai Ulangan Dipublikasikan',
      `Nilai dan catatan guru untuk ulangan "${exam.title}" sudah tersedia.`,
      'success',
      'results'
    );
    const parents = db
      .prepare(`SELECT pa.user_id FROM parent_student_relationships psr JOIN parents pa ON pa.id = psr.parent_id WHERE psr.student_id = ?`)
      .all(participant.student_id) as Array<{ user_id: number }>;
    for (const p of parents) {
      createNotification(
        p.user_id,
        'Nilai Anak Dipublikasikan',
        `Hasil ulangan "${exam.title}" untuk ${st.full_name} telah dinilai dan dipublikasikan.`,
        'success',
        'results'
      );
    }
  }

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'KOREKSI_NILAI', `Menyimpan koreksi & catatan guru untuk peserta #${participantId}`);
  res.json({ ok: true, ...graded });
});

// ==================== GRADE RECAP & ITEM ANALYSIS ====================

adminRouter.get('/recap', (req, res) => {
  const { studentId, subjectId, examId, className } = req.query;

  let where = `WHERE 1=1`;
  const params: unknown[] = [];

  if (studentId) {
    where += ` AND er.student_id = ?`;
    params.push(Number(studentId));
  }
  if (subjectId) {
    where += ` AND e.subject_id = ?`;
    params.push(Number(subjectId));
  }
  if (examId) {
    where += ` AND er.exam_id = ?`;
    params.push(Number(examId));
  }
  if (className) {
    where += ` AND s.class_name = ?`;
    params.push(String(className));
  }

  const rows = db
    .prepare(`
      SELECT er.*, s.nis, s.full_name AS student_name, s.class_name,
             e.title AS exam_title, sub.name AS subject_name,
             COALESCE(es.exam_date, substr(er.graded_at, 1, 10)) AS exam_date
      FROM exam_results er
      JOIN students s ON s.id = er.student_id
      JOIN exams e ON e.id = er.exam_id
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN exam_schedules es ON es.exam_id = e.id
      ${where}
      ORDER BY exam_date DESC, s.class_name ASC, s.full_name ASC
    `)
    .all(...params) as Array<{
    total_score: number;
    is_passed: number;
    exam_id: number;
    exam_title: string;
    student_name: string;
  }>;

  const scores = rows.map((r) => r.total_score);
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest = scores.length > 0 ? Math.min(...scores) : 0;
  const average = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const passedCount = rows.filter((r) => r.is_passed === 1).length;
  const failedCount = rows.length - passedCount;

  // List of students who haven't taken the filtered exam (if examId provided) or active/completed exams
  let notTakenList: Array<{ nis: string; full_name: string; class_name: string; exam_title: string }> = [];
  if (examId) {
    notTakenList = db
      .prepare(`
        SELECT s.nis, s.full_name, s.class_name, e.title AS exam_title
        FROM exams e
        JOIN students s ON s.class_name = e.class_name
        LEFT JOIN exam_participants ep ON ep.exam_id = e.id AND ep.student_id = s.id
        WHERE e.id = ? AND (ep.id IS NULL OR ep.status IN ('belum_mulai', 'sedang_mengerjakan'))
        ORDER BY s.full_name ASC
      `)
      .all(Number(examId)) as typeof notTakenList;
  } else {
    notTakenList = db
      .prepare(`
        SELECT s.nis, s.full_name, s.class_name, e.title AS exam_title
        FROM exams e
        JOIN students s ON s.class_name = e.class_name
        LEFT JOIN exam_participants ep ON ep.exam_id = e.id AND ep.student_id = s.id
        WHERE e.status IN ('aktif', 'selesai')
          AND (ep.id IS NULL OR ep.status IN ('belum_mulai', 'sedang_mengerjakan'))
          ${className ? 'AND s.class_name = ?' : ''}
        ORDER BY e.id DESC, s.full_name ASC
        LIMIT 100
      `)
      .all(...(className ? [String(className)] : [])) as typeof notTakenList;
  }

  // Group chart by exam
  const examChartMap = new Map<string, { label: string; sum: number; count: number; passed: number }>();
  for (const r of rows) {
    const cur = examChartMap.get(r.exam_title) || { label: r.exam_title, sum: 0, count: 0, passed: 0 };
    cur.sum += r.total_score;
    cur.count += 1;
    cur.passed += r.is_passed === 1 ? 1 : 0;
    examChartMap.set(r.exam_title, cur);
  }
  const chartData = Array.from(examChartMap.values()).map((c) => ({
    label: c.label,
    average: Math.round((c.sum / c.count) * 10) / 10,
    count: c.count,
    passed: c.passed,
  }));

  res.json({
    summary: { highest, lowest, average, passedCount, failedCount, totalRecords: rows.length },
    rows,
    notTakenList,
    chartData,
  });
});

adminRouter.get('/item-analysis/:examId', (req, res) => {
  const examId = Number(req.params.examId);
  const exam = db
    .prepare(`SELECT e.*, sub.name AS subject_name FROM exams e JOIN subjects sub ON sub.id = e.subject_id WHERE e.id = ?`)
    .get(examId);
  if (!exam) return res.status(404).json({ error: 'Ulangan tidak ditemukan.' });

  const questions = db
    .prepare(`
      SELECT q.id, q.question_type, q.question_text, q.topic, q.difficulty, q.weight, eq.sort_order, eq.custom_weight
      FROM exam_questions eq
      JOIN questions q ON q.id = eq.question_id
      WHERE eq.exam_id = ?
      ORDER BY eq.sort_order ASC, eq.id ASC
    `)
    .all(examId) as Array<{
    id: number;
    question_type: string;
    question_text: string;
    topic: string;
    difficulty: string;
    weight: number;
    sort_order: number;
    custom_weight: number | null;
  }>;

  const totalParticipants = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM exam_participants WHERE exam_id = ? AND status IN ('selesai', 'dihentikan')`)
      .get(examId) as { cnt: number }
  ).cnt;

  const analysis = questions.map((q) => {
    const stats = db
      .prepare(`
        SELECT
          SUM(CASE WHEN sd.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
          SUM(CASE WHEN sd.is_correct = 0 AND (sa.selected_option IS NOT NULL OR TRIM(COALESCE(sa.answer_text, '')) != '') THEN 1 ELSE 0 END) AS wrong_count,
          AVG(sd.earned_score) AS avg_score
        FROM score_details sd
        JOIN exam_results er ON er.id = sd.result_id
        LEFT JOIN student_answers sa ON sa.participant_id = er.participant_id AND sa.question_id = sd.question_id
        WHERE er.exam_id = ? AND sd.question_id = ?
      `)
      .get(examId, q.id) as { correct_count: number | null; wrong_count: number | null; avg_score: number | null };

    const correctCount = stats.correct_count || 0;
    const wrongCount = stats.wrong_count || 0;
    const unansweredCount = Math.max(0, totalParticipants - correctCount - wrongCount);
    const correctRate = totalParticipants > 0 ? Math.round((correctCount / totalParticipants) * 1000) / 10 : 0;

    return {
      ...q,
      totalParticipants,
      correctCount,
      wrongCount,
      unansweredCount,
      correctRate,
      avgScore: stats.avg_score !== null ? Math.round(stats.avg_score * 100) / 100 : 0,
    };
  });

  res.json({ exam, totalParticipants, analysis });
});

// ==================== KKTP SETTINGS ====================

adminRouter.get('/kktp', (_req, res) => {
  const settingsMap = getAppSettingsMap();
  const defaultKktp = Number(settingsMap.default_kktp || 75);
  const subjects = db
    .prepare(`
      SELECT s.id AS subject_id, s.name AS subject_name,
             COALESCE((SELECT k.threshold FROM kktp_settings k WHERE k.subject_id = s.id AND k.exam_id IS NULL LIMIT 1), ?) AS threshold
      FROM subjects s
      ORDER BY s.name ASC
    `)
    .all(defaultKktp);

  const exams = db
    .prepare(`
      SELECT e.id AS exam_id, e.title AS exam_title, e.class_name, e.kktp AS threshold, sub.name AS subject_name
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      ORDER BY e.id DESC
    `)
    .all();

  res.json({ defaultKktp, subjects, exams });
});

adminRouter.post('/kktp', (req: AuthenticatedRequest, res) => {
  const { scope, subjectId, examId, threshold } = req.body ?? {};
  const val = Number(threshold);
  if (Number.isNaN(val) || val < 0 || val > 100) {
    return res.status(400).json({ error: 'Nilai KKTP harus antara 0 hingga 100.' });
  }

  if (scope === 'exam' && examId) {
    db.transaction(() => {
      db.prepare(`UPDATE exams SET kktp = ?, updated_at = datetime('now') WHERE id = ?`).run(val, Number(examId));
      db.prepare(`DELETE FROM kktp_settings WHERE exam_id = ?`).run(Number(examId));
      db.prepare(`INSERT INTO kktp_settings (subject_id, exam_id, threshold) SELECT subject_id, id, ? FROM exams WHERE id = ?`).run(
        val,
        Number(examId)
      );
      recalculateExamResultsForKktp(Number(examId), val);
    })();
    logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'ATUR_KKTP', `Mengubah KKTP ulangan #${examId} menjadi ${val}`);
  } else if (scope === 'subject' && subjectId) {
    db.transaction(() => {
      db.prepare(`DELETE FROM kktp_settings WHERE subject_id = ? AND exam_id IS NULL`).run(Number(subjectId));
      db.prepare(`INSERT INTO kktp_settings (subject_id, exam_id, threshold) VALUES (?, NULL, ?)`).run(Number(subjectId), val);
    })();
    logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'ATUR_KKTP', `Mengubah KKTP mata pelajaran #${subjectId} menjadi ${val}`);
  } else {
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_kktp', ?)`).run(String(val));
  }

  res.json({ ok: true });
});

// ==================== APP SETTINGS & ACTIVITY LOGS ====================

adminRouter.get('/settings', (_req, res) => {
  const settingsMap = getAppSettingsMap();
  const activeYear = getActiveAcademicYear();
  let classes: string[] = ['3A', '3B', '3C'];
  try {
    classes = JSON.parse(settingsMap.classes_json || '["3A","3B","3C"]');
  } catch {
    classes = ['3A', '3B', '3C'];
  }
  res.json({
    settings: {
      school_name: settingsMap.school_name || 'SD Negeri Kurikulum Merdeka',
      class_level: settingsMap.class_level || 'Kelas III',
      curriculum: settingsMap.curriculum || 'Kurikulum Merdeka',
      academic_year: activeYear.year_label,
      semester: activeYear.semester,
      classes,
      default_kktp: Number(settingsMap.default_kktp || 75),
    },
  });
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  const { school_name, academic_year, semester, classes, default_kktp } = req.body ?? {};
  db.transaction(() => {
    if (school_name) {
      db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_name', ?)`).run(String(school_name).trim());
    }
    if (Array.isArray(classes) && classes.length > 0) {
      const cleaned = classes.map((c) => String(c).trim()).filter(Boolean);
      db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('classes_json', ?)`).run(JSON.stringify(cleaned));
    }
    if (default_kktp !== undefined) {
      db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_kktp', ?)`).run(String(Number(default_kktp)));
    }
    if (academic_year || semester) {
      const active = getActiveAcademicYear();
      db.prepare(`UPDATE academic_years SET year_label = ?, semester = ? WHERE id = ?`).run(
        String(academic_year || active.year_label).trim(),
        String(semester || active.semester).trim(),
        active.id
      );
    }
  })();

  logActivity(req.auth!.userId, req.auth!.fullName, 'superadmin', 'UBAH_PENGATURAN', 'Memperbarui pengaturan aplikasi sekolah');
  res.json({ ok: true });
});

adminRouter.get('/activity-logs', (_req, res) => {
  const logs = db.prepare(`SELECT * FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT 100`).all();
  res.json({ logs });
});
