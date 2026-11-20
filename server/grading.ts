import { db, createNotification } from './db.ts';

interface ExamQuestionRow {
  question_id: number;
  question_type: 'pg_4' | 'pg_3' | 'isian_singkat' | 'uraian';
  correct_answer_text: string | null;
  match_mode: 'exact' | 'case_insensitive' | 'contains';
  weight: number;
  custom_weight: number | null;
}

export function normalizeText(val: string | null | undefined): string {
  return (val ?? '').trim().replace(/\s+/g, ' ');
}

export function checkShortAnswerMatch(
  studentText: string | null | undefined,
  correctText: string | null | undefined,
  mode: 'exact' | 'case_insensitive' | 'contains'
): boolean {
  const ans = normalizeText(studentText);
  const key = normalizeText(correctText);
  if (!ans || !key) return false;

  // Support multiple acceptable answers separated by "|"
  const keys = key.split('|').map((k) => k.trim()).filter(Boolean);
  for (const candidate of keys) {
    if (mode === 'exact') {
      if (ans === candidate) return true;
    } else if (mode === 'case_insensitive') {
      if (ans.toLowerCase() === candidate.toLowerCase()) return true;
    } else if (mode === 'contains') {
      if (ans.toLowerCase().includes(candidate.toLowerCase())) return true;
    }
  }
  return false;
}

export function gradeAndComputeParticipantResult(
  participantId: number,
  options: { autoPublishIfNoEssay?: boolean } = {}
): { resultId: number; totalScore: number; isPassed: boolean; hasEssay: boolean } {
  const participant = db
    .prepare(`SELECT id, exam_id, student_id FROM exam_participants WHERE id = ?`)
    .get(participantId) as { id: number; exam_id: number; student_id: number } | undefined;

  if (!participant) {
    throw new Error('Data peserta ujian tidak ditemukan.');
  }

  const exam = db
    .prepare(`SELECT id, title, max_score, kktp, is_results_published FROM exams WHERE id = ?`)
    .get(participant.exam_id) as {
    id: number;
    title: string;
    max_score: number;
    kktp: number;
    is_results_published: number;
  };

  const examQuestions = db
    .prepare(`
      SELECT
        eq.question_id,
        eq.custom_weight,
        q.question_type,
        q.correct_answer_text,
        q.match_mode,
        q.weight
      FROM exam_questions eq
      JOIN questions q ON q.id = eq.question_id
      WHERE eq.exam_id = ?
      ORDER BY eq.sort_order ASC, eq.id ASC
    `)
    .all(participant.exam_id) as ExamQuestionRow[];

  const answers = db
    .prepare(`SELECT * FROM student_answers WHERE participant_id = ?`)
    .all(participantId) as Array<{
    id: number;
    question_id: number;
    selected_option: string | null;
    answer_text: string | null;
    score_awarded: number;
    is_correct: number | null;
  }>;

  const answerMap = new Map(answers.map((a) => [a.question_id, a]));

  let rawEarned = 0;
  let rawMax = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let hasEssay = false;

  const updateAnswerStmt = db.prepare(`
    UPDATE student_answers
    SET is_correct = ?, score_awarded = ?
    WHERE id = ?
  `);

  const scoreDetailsData: Array<{
    question_id: number;
    question_type: string;
    max_weight: number;
    earned_score: number;
    is_correct: number | null;
  }> = [];

  for (const eq of examQuestions) {
    const effectiveWeight = eq.custom_weight ?? eq.weight ?? 1;
    rawMax += effectiveWeight;
    const ans = answerMap.get(eq.question_id);

    if (eq.question_type === 'pg_4' || eq.question_type === 'pg_3') {
      const selected = normalizeText(ans?.selected_option).toUpperCase();
      if (!selected) {
        unansweredCount++;
        if (ans) updateAnswerStmt.run(0, 0, ans.id);
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: 0,
          is_correct: 0,
        });
      } else {
        const correctOpt = db
          .prepare(`SELECT option_label FROM answer_options WHERE question_id = ? AND is_correct = 1 LIMIT 1`)
          .get(eq.question_id) as { option_label: string } | undefined;
        const isCorrect = correctOpt && correctOpt.option_label.toUpperCase() === selected ? 1 : 0;
        const earned = isCorrect ? effectiveWeight : 0;
        rawEarned += earned;
        if (isCorrect) correctCount++;
        else wrongCount++;
        if (ans) updateAnswerStmt.run(isCorrect, earned, ans.id);
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: earned,
          is_correct: isCorrect,
        });
      }
    } else if (eq.question_type === 'isian_singkat') {
      const textVal = normalizeText(ans?.answer_text);
      if (!textVal) {
        unansweredCount++;
        if (ans) updateAnswerStmt.run(0, 0, ans.id);
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: 0,
          is_correct: 0,
        });
      } else if (eq.correct_answer_text && eq.correct_answer_text.trim().length > 0) {
        const isCorrect = checkShortAnswerMatch(textVal, eq.correct_answer_text, eq.match_mode) ? 1 : 0;
        const earned = isCorrect ? effectiveWeight : 0;
        rawEarned += earned;
        if (isCorrect) correctCount++;
        else wrongCount++;
        if (ans) updateAnswerStmt.run(isCorrect, earned, ans.id);
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: earned,
          is_correct: isCorrect,
        });
      } else {
        // No answer key configured on short answer -> preserve manual score if any
        const earned = Math.min(effectiveWeight, Math.max(0, ans?.score_awarded ?? 0));
        rawEarned += earned;
        const isCorrect = earned >= effectiveWeight ? 1 : earned > 0 ? 1 : 0;
        if (isCorrect) correctCount++;
        else wrongCount++;
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: earned,
          is_correct: isCorrect,
        });
      }
    } else {
      // Uraian: manual grading
      hasEssay = true;
      const textVal = normalizeText(ans?.answer_text);
      if (!textVal) {
        unansweredCount++;
        if (ans) updateAnswerStmt.run(0, 0, ans.id);
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: 0,
          is_correct: 0,
        });
      } else {
        const earned = Math.min(effectiveWeight, Math.max(0, ans?.score_awarded ?? 0));
        rawEarned += earned;
        const isCorrect = ans?.is_correct ?? (earned > 0 ? 1 : null);
        if (isCorrect === 1) correctCount++;
        else if (isCorrect === 0) wrongCount++;
        scoreDetailsData.push({
          question_id: eq.question_id,
          question_type: eq.question_type,
          max_weight: effectiveWeight,
          earned_score: earned,
          is_correct: isCorrect,
        });
      }
    }
  }

  const maxPossible = exam.max_score > 0 ? exam.max_score : 100;
  const totalScore = rawMax > 0 ? Math.round((rawEarned / rawMax) * maxPossible * 100) / 100 : 0;
  const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 1000) / 10 : 0;
  const isPassed = totalScore >= exam.kktp ? 1 : 0;

  const existingResult = db
    .prepare(`SELECT id, teacher_note, is_published FROM exam_results WHERE participant_id = ?`)
    .get(participantId) as { id: number; teacher_note: string; is_published: number } | undefined;

  const shouldPublish = existingResult
    ? existingResult.is_published
    : options.autoPublishIfNoEssay && !hasEssay && exam.is_results_published === 1
      ? 1
      : 0;

  let resultId: number;
  if (existingResult) {
    db.prepare(`
      UPDATE exam_results
      SET total_score = ?, max_possible_score = ?, percentage = ?,
          correct_count = ?, wrong_count = ?, unanswered_count = ?,
          kktp_threshold = ?, is_passed = ?, is_published = ?, graded_at = datetime('now')
      WHERE id = ?
    `).run(
      totalScore,
      maxPossible,
      percentage,
      correctCount,
      wrongCount,
      unansweredCount,
      exam.kktp,
      isPassed,
      shouldPublish,
      existingResult.id
    );
    resultId = existingResult.id;
    db.prepare(`DELETE FROM score_details WHERE result_id = ?`).run(resultId);
  } else {
    const info = db
      .prepare(`
        INSERT INTO exam_results (
          participant_id, exam_id, student_id, total_score, max_possible_score,
          percentage, correct_count, wrong_count, unanswered_count,
          kktp_threshold, is_passed, teacher_note, is_published
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
      `)
      .run(
        participantId,
        participant.exam_id,
        participant.student_id,
        totalScore,
        maxPossible,
        percentage,
        correctCount,
        wrongCount,
        unansweredCount,
        exam.kktp,
        isPassed,
        shouldPublish
      );
    resultId = Number(info.lastInsertRowid);
  }

  const insertDetail = db.prepare(`
    INSERT INTO score_details (result_id, question_id, question_type, max_weight, earned_score, is_correct)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const d of scoreDetailsData) {
    insertDetail.run(resultId, d.question_id, d.question_type, d.max_weight, d.earned_score, d.is_correct);
  }

  return { resultId, totalScore, isPassed: isPassed === 1, hasEssay };
}

export function recalculateExamResultsForKktp(examId: number, newKktp: number): void {
  db.prepare(`
    UPDATE exam_results
    SET kktp_threshold = ?,
        is_passed = CASE WHEN total_score >= ? THEN 1 ELSE 0 END
    WHERE exam_id = ?
  `).run(newKktp, newKktp, examId);
}

export function notifyExamPublished(examId: number): void {
  const exam = db
    .prepare(`SELECT id, title FROM exams WHERE id = ?`)
    .get(examId) as { id: number; title: string } | undefined;
  if (!exam) return;

  const participants = db
    .prepare(`
      SELECT DISTINCT s.id AS student_id, s.user_id AS student_user_id, s.full_name AS student_name
      FROM exam_results er
      JOIN students s ON s.id = er.student_id
      WHERE er.exam_id = ? AND er.is_published = 1
    `)
    .all(examId) as Array<{ student_id: number; student_user_id: number; student_name: string }>;

  for (const p of participants) {
    createNotification(
      p.student_user_id,
      'Nilai Ulangan Dipublikasikan',
      `Nilai ulangan "${exam.title}" sudah dapat dilihat di menu Hasil dan Nilai.`,
      'success',
      'results'
    );

    const parents = db
      .prepare(`
        SELECT pa.user_id
        FROM parent_student_relationships psr
        JOIN parents pa ON pa.id = psr.parent_id
        WHERE psr.student_id = ?
      `)
      .all(p.student_id) as Array<{ user_id: number }>;

    for (const parent of parents) {
      createNotification(
        parent.user_id,
        'Nilai Anak Dipublikasikan',
        `Hasil ulangan "${exam.title}" untuk ${p.student_name} telah dipublikasikan oleh guru.`,
        'success',
        'results'
      );
    }
  }
}
