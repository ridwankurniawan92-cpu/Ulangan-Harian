import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { AuthenticatedRequest, SESSION_COOKIE_NAME, verifySessionToken } from './server/auth.ts';
import { db, initializeDatabase, UPLOAD_DIRECTORY } from './server/db.ts';
import { portalRouter } from './server/routes/portal.ts';
import { adminRouter } from './server/routes/admin.ts';

async function startServer() {
  initializeDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Serve uploaded question/option images
  app.use('/api/uploads', express.static(UPLOAD_DIRECTORY));

  // Hydrate authenticated user from Authorization Bearer token or signed HTTP-only cookie
  app.use((req: AuthenticatedRequest, _res, next) => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const token = bearerToken || req.cookies?.[SESSION_COOKIE_NAME];
    const payload = verifySessionToken(token);
    if (payload) {
      const user = db
        .prepare(`
          SELECT u.id, u.username, u.full_name, u.is_active, r.name AS role_name
          FROM users u
          JOIN roles r ON r.id = u.role_id
          WHERE u.id = ?
        `)
        .get(payload.uid) as
        | {
            id: number;
            username: string;
            full_name: string;
            is_active: number;
            role_name: 'superadmin' | 'student' | 'parent';
          }
        | undefined;

      if (user && user.is_active === 1) {
        let studentId: number | undefined;
        let studentClass: string | undefined;
        let parentId: number | undefined;

        if (user.role_name === 'student') {
          const st = db
            .prepare(`SELECT id, class_name FROM students WHERE user_id = ?`)
            .get(user.id) as { id: number; class_name: string } | undefined;
          studentId = st?.id;
          studentClass = st?.class_name;
        } else if (user.role_name === 'parent') {
          const pr = db.prepare(`SELECT id FROM parents WHERE user_id = ?`).get(user.id) as { id: number } | undefined;
          parentId = pr?.id;
        }

        req.auth = {
          userId: user.id,
          role: user.role_name,
          username: user.username,
          fullName: user.full_name,
          studentId,
          studentClass,
          parentId,
        };
      }
    }
    next();
  });

  app.use('/api', portalRouter);
  app.use('/api/admin', adminRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ULANGAN HARIAN KELAS 3 berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal memulai server:', err);
  process.exit(1);
});
