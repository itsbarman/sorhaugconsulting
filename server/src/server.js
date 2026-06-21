import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import pg from 'pg';
import { z } from 'zod';

dotenv.config();

const { Pool } = pg;
const require = createRequire(import.meta.url);
const archiver = require('archiver');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_ROOT = path.resolve(__dirname, '../../client');
const PROTECTED_DIR = path.resolve(__dirname, '../protected');
const PROJECTS_FILE = path.resolve(__dirname, './data/projects.json');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ASSET_SIGNING_SECRET = process.env.ASSET_SIGNING_SECRET;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrator';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL mangler i .env');
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET mangler eller er for kort. Bruk minst 32 tegn.');
}
if (!ASSET_SIGNING_SECRET || ASSET_SIGNING_SECRET.length < 32) {
  throw new Error('ASSET_SIGNING_SECRET mangler eller er for kort. Bruk minst 32 tegn.');
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
  throw new Error('ADMIN_EMAIL og ADMIN_PASSWORD_HASH ma settes i .env');
}

if (!fs.existsSync(PROTECTED_DIR)) {
  fs.mkdirSync(PROTECTED_DIR, { recursive: true });
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const dbRun = (query, params = []) => pool.query(query, params);
const dbGet = async (query, params = []) => {
  const result = await pool.query(query, params);
  return result.rows[0] || null;
};
const dbAll = async (query, params = []) => {
  const result = await pool.query(query, params);
  return result.rows;
};

const MIN_PASSWORD_LENGTH = 10;

const toUserEmail = (value) => String(value || '').trim().toLowerCase();

const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: z.enum(['admin', 'client']).default('client')
});

const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1500).optional().default(''),
  memberEmails: z.array(z.string().trim().email().max(200)).optional().default([])
});

const projectMemberSchema = z.object({
  email: z.string().trim().email().max(200)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200)
});

const selfRegisterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200)
});

const parseValidationError = (parsed, fallbackMessage) => {
  const firstIssue = parsed?.error?.issues?.[0];
  if (!firstIssue) {
    return fallbackMessage;
  }

  if (firstIssue.path?.[0] === 'password' && firstIssue.code === 'too_small') {
    return `Passord ma vaere minst ${MIN_PASSWORD_LENGTH} tegn.`;
  }

  if (firstIssue.path?.[0] === 'email') {
    return 'Ugyldig e-postadresse.';
  }

  if (firstIssue.path?.[0] === 'name') {
    return 'Navn ma vaere minst 2 tegn.';
  }

  return fallbackMessage;
};

const sanitizeFileName = (name) => {
  const base = path.basename(String(name || 'file'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
};

const stripExtension = (name) => name.replace(/\.[^.]+$/, '');

const detectAssetFolderKey = (fileName) => {
  const name = String(fileName || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'bilder';
  if (ext === '.pdf') return 'pdf';
  if (['.doc', '.docx', '.docs', '.txt'].includes(ext)) return 'docs';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'excel';
  if (['.ppt', '.pptx'].includes(ext)) return 'powerpoint';
  if (ext === '.xml') return 'xml';
  if (ext === '.zip') return 'zip';
  if (ext === '.json') return 'json';
  return 'andre-filer';
};

const folderLabelFromKey = (folderKey) => {
  const labels = {
    bilder: 'Bilder',
    pdf: 'PDF',
    docs: 'Docs',
    excel: 'Excel',
    powerpoint: 'PowerPoint',
    xml: 'XML',
    zip: 'ZIP',
    json: 'JSON',
    'andre-filer': 'Andre filer'
  };

  return labels[folderKey] || 'Andre filer';
};

const ALLOWED_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
  '.xml',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.docs',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.json'
]);

const isAllowedUploadFile = (file) => {
  const ext = path.extname(String(file?.originalname || '')).toLowerCase();
  if (ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return true;
  }

  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  const allowedMimeTypes = new Set([
    'application/pdf',
    'application/xml',
    'text/xml',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/json'
  ]);

  return allowedMimeTypes.has(mimeType);
};

const removeUploadedFiles = (files) => {
  for (const file of files || []) {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
};

const randomId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

const ensureCsrfToken = (req) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('base64url');
  }
  return req.session.csrfToken;
};

const signPayload = (payloadJson) =>
  crypto.createHmac('sha256', ASSET_SIGNING_SECRET).update(payloadJson).digest('base64url');

const createAssetToken = ({ assetId, userEmail, expiresInSeconds = 300 }) => {
  const payload = {
    assetId,
    userEmail,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };
  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const signature = signPayload(payloadJson);
  return `${payloadEncoded}.${signature}`;
};

const verifyAssetToken = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
    const expected = signPayload(payloadJson);

    const sigA = Buffer.from(signature);
    const sigB = Buffer.from(expected);
    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return null;
    }

    const payload = JSON.parse(payloadJson);
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

const bootstrapFromJson = async () => {
  if (!fs.existsSync(PROJECTS_FILE)) {
    return;
  }

  const row = await dbGet('SELECT COUNT(*)::int AS total FROM projects');
  if ((row?.total || 0) > 0) {
    return;
  }

  const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
  let parsed = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  for (const project of parsed) {
    const projectId = String(project.id || randomId('prj'));
    await dbRun(
      `INSERT INTO projects (id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [projectId, String(project.name || 'Prosjekt'), String(project.description || '')]
    );

    const members = Array.isArray(project.allowedUsers) ? project.allowedUsers : [];
    for (const emailRaw of members) {
      const email = toUserEmail(emailRaw);
      const member = await dbGet('SELECT id FROM users WHERE email = $1', [email]);
      if (member) {
        await dbRun(
          `INSERT INTO project_members (project_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (project_id, user_id) DO NOTHING`,
          [projectId, member.id]
        );
      }
    }

    const assets = Array.isArray(project.assets) ? project.assets : [];
    for (const asset of assets) {
      const assetId = String(asset.id || randomId('ast'));
      const originalName = sanitizeFileName(asset.file || `${assetId}.bin`);
      const storedName = sanitizeFileName(asset.file || `${assetId}.bin`);
      await dbRun(
        `INSERT INTO assets
        (id, project_id, title, kind, file_name, stored_name, mime_type, size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING`,
        [
          assetId,
          projectId,
          String(asset.title || assetId),
          String(asset.kind || 'dokument'),
          originalName,
          storedName,
          'application/octet-stream',
          0
        ]
      );
    }
  }
};

const initDb = async () => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  const adminEmail = toUserEmail(ADMIN_EMAIL);
  const adminExisting = await dbGet('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (!adminExisting) {
    await dbRun(
      'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [randomId('usr'), ADMIN_NAME, adminEmail, ADMIN_PASSWORD_HASH, 'admin']
    );
  }

  await bootstrapFromJson();
};

const PgSession = connectPgSimple(session);
const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"]
      }
    }
  })
);

app.use(express.json({ limit: '64kb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PROTECTED_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 15);
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    if (isAllowedUploadFile(file)) {
      cb(null, true);
      return;
    }

    const error = new Error(
      'Ugyldig filtype. Tillatt: bilder, PDF, XML, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ZIP og JSON.'
    );
    error.statusCode = 400;
    cb(error);
  },
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true
    }),
    name: 'sc_session',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'For mange innloggingsforsok. Prov igjen senere.' }
});

const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'For mange registreringsforsok. Prov igjen senere.' }
});

const ensureAuthenticated = (req, res, next) => {
  if (!req.session.user?.id) {
    return res.status(401).json({ message: 'Ikke innlogget.' });
  }
  return next();
};

const ensureAdmin = (req, res, next) => {
  if (req.session.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Mangler admin-tilgang.' });
  }
  return next();
};

const ensureDashboardAccess = (req, res, next) => {
  if (!req.session.user?.id) {
    return res.redirect('/innlogging.html');
  }
  return next();
};

const csrfMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  if (!csrfMethods.has(req.method)) {
    return next();
  }

  if (req.path === '/api/auth/login' || req.path === '/api/auth/register') {
    return next();
  }

  if (!req.session.user?.id) {
    return res.status(401).json({ message: 'Ikke innlogget.' });
  }

  const expected = ensureCsrfToken(req);
  const incoming = req.get('x-csrf-token');
  if (!incoming || incoming !== expected) {
    return res.status(403).json({ message: 'CSRF-validering feilet.' });
  }

  return next();
});

const getUserProjects = async (user) => {
  if (user.role === 'admin') {
    return dbAll('SELECT id, name, description FROM projects ORDER BY name ASC');
  }

  return dbAll(
    `SELECT p.id, p.name, p.description
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1
     ORDER BY p.name ASC`,
    [user.id]
  );
};

const userHasProjectAccess = async (user, projectId) => {
  if (user.role === 'admin') {
    return true;
  }

  const row = await dbGet(
    'SELECT 1 AS ok FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, user.id]
  );
  return Boolean(row?.ok);
};

const getProjectAssets = async (projectId) =>
  dbAll(
    `SELECT id, title, kind, file_name, stored_name, mime_type, size_bytes
     FROM assets
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId]
  );

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parseValidationError(parsed, 'Ugyldig e-post eller passordformat.') });
  }

  const email = toUserEmail(parsed.data.email);
  const password = parsed.data.password;

  const dbUser = await dbGet(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
    [email]
  );

  const passwordHash = dbUser?.password_hash || ADMIN_PASSWORD_HASH;
  const isPasswordMatch = await bcrypt.compare(password, passwordHash);

  if (!dbUser || !isPasswordMatch) {
    return res.status(401).json({ message: 'Feil brukernavn eller passord.' });
  }

  req.session.regenerate((error) => {
    if (error) {
      return res.status(500).json({ message: 'Klarte ikke opprette sesjon.' });
    }

    req.session.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role
    };
    const csrfToken = ensureCsrfToken(req);
    return res.json({ ok: true, csrfToken, user: req.session.user });
  });
});

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  const parsed = selfRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parseValidationError(parsed, 'Ugyldige registreringsdata.') });
  }

  const email = toUserEmail(parsed.data.email);
  const existing = await dbGet('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return res.status(409).json({ message: 'Bruker med e-post finnes allerede.' });
  }

  const userId = randomId('usr');
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await dbRun(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [userId, parsed.data.name, email, passwordHash, 'client']
  );

  req.session.regenerate((error) => {
    if (error) {
      return res.status(500).json({ message: 'Klarte ikke opprette sesjon.' });
    }

    req.session.user = {
      id: userId,
      name: parsed.data.name,
      email,
      role: 'client'
    };
    const csrfToken = ensureCsrfToken(req);
    return res.status(201).json({ ok: true, csrfToken, user: req.session.user });
  });
});

app.post('/api/auth/logout', ensureAuthenticated, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ message: 'Klarte ikke logge ut.' });
    }
    res.clearCookie('sc_session');
    return res.json({ ok: true });
  });
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session.user?.id) {
    return res.status(401).json({ authenticated: false });
  }
  const csrfToken = ensureCsrfToken(req);
  return res.json({ authenticated: true, user: req.session.user, csrfToken });
});

app.get('/api/projects', ensureAuthenticated, async (req, res) => {
  const projects = await getUserProjects(req.session.user);
  return res.json({ projects });
});

app.get('/api/projects/:projectId/assets', ensureAuthenticated, async (req, res) => {
  const projectId = req.params.projectId;
  const project = await dbGet('SELECT id, name, description FROM projects WHERE id = $1', [projectId]);

  if (!project) {
    return res.status(404).json({ message: 'Fant ikke prosjektet.' });
  }

  const hasAccess = await userHasProjectAccess(req.session.user, project.id);
  if (!hasAccess) {
    return res.status(403).json({ message: 'Ingen tilgang til prosjektet.' });
  }

  const assetsRaw = await getProjectAssets(project.id);
  const assets = assetsRaw.map((asset) => ({
    id: asset.id,
    title: asset.title,
    kind: asset.kind,
    url: `/api/assets/${asset.id}?token=${createAssetToken({
      assetId: asset.id,
      userEmail: req.session.user.email
    })}`,
    fileName: asset.file_name,
    sizeBytes: asset.size_bytes
  }));

  return res.json({ project: { id: project.id, name: project.name }, assets });
});

app.get('/api/projects/:projectId/members', ensureAuthenticated, async (req, res) => {
  const projectId = req.params.projectId;
  const project = await dbGet('SELECT id, name FROM projects WHERE id = $1', [projectId]);

  if (!project) {
    return res.status(404).json({ message: 'Fant ikke prosjektet.' });
  }

  const hasAccess = await userHasProjectAccess(req.session.user, project.id);
  if (!hasAccess) {
    return res.status(403).json({ message: 'Ingen tilgang til prosjektet.' });
  }

  const members = await dbAll(
    `SELECT DISTINCT m.id, m.name, m.email, m.role
     FROM (
       SELECT u.id, u.name, u.email, u.role
       FROM users u
       JOIN project_members pm ON pm.user_id = u.id
       WHERE pm.project_id = $1

       UNION ALL

       SELECT u.id, u.name, u.email, u.role
       FROM users u
       WHERE u.role = 'admin'
     ) AS m
     ORDER BY m.role DESC, m.name ASC, m.email ASC`,
    [project.id]
  );

  return res.json({
    project: { id: project.id, name: project.name },
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role
    }))
  });
});

app.get('/api/projects/:projectId/download', ensureAuthenticated, async (req, res) => {
  const projectId = req.params.projectId;
  const requestedFolder = String(req.query.folder || 'all').trim().toLowerCase();
  const allowedFolders = new Set([
    'all',
    'bilder',
    'pdf',
    'docs',
    'excel',
    'powerpoint',
    'xml',
    'zip',
    'json',
    'andre-filer'
  ]);

  if (!allowedFolders.has(requestedFolder)) {
    return res.status(400).json({ message: 'Ugyldig mappefilter.' });
  }

  const project = await dbGet('SELECT id, name FROM projects WHERE id = $1', [projectId]);
  if (!project) {
    return res.status(404).json({ message: 'Fant ikke prosjektet.' });
  }

  const hasAccess = await userHasProjectAccess(req.session.user, project.id);
  if (!hasAccess) {
    return res.status(403).json({ message: 'Ingen tilgang til prosjektet.' });
  }

  const assetsRaw = await getProjectAssets(project.id);
  const filteredAssets = assetsRaw.filter((asset) => {
    if (requestedFolder === 'all') {
      return true;
    }
    return detectAssetFolderKey(asset.file_name) === requestedFolder;
  });

  if (!filteredAssets.length) {
    return res.status(404).json({ message: 'Ingen filer funnet for valgt nedlasting.' });
  }

  const projectBase = stripExtension(sanitizeFileName(project.name || 'prosjekt'));
  const suffix = requestedFolder === 'all' ? 'alle-filer' : requestedFolder;
  const zipName = sanitizeFileName(`${projectBase}-${suffix}.zip`);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (error) => {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Klarte ikke lage ZIP-fil.' });
      return;
    }
    res.end();
  });

  archive.pipe(res);

  for (const asset of filteredAssets) {
    const absolutePath = path.resolve(PROTECTED_DIR, asset.stored_name);
    if (!absolutePath.startsWith(PROTECTED_DIR) || !fs.existsSync(absolutePath)) {
      continue;
    }

    const folderKey = detectAssetFolderKey(asset.file_name);
    const folderLabel = folderLabelFromKey(folderKey);
    const safeFileName = sanitizeFileName(asset.file_name);
    const zipPath = requestedFolder === 'all' ? `${folderLabel}/${safeFileName}` : safeFileName;
    archive.file(absolutePath, { name: zipPath });
  }

  archive.finalize();
});

app.get('/api/assets/:assetId', ensureAuthenticated, async (req, res) => {
  const token = req.query.token;
  const tokenPayload = verifyAssetToken(token);

  if (!tokenPayload) {
    return res.status(401).json({ message: 'Ugyldig eller utlopet filtoken.' });
  }

  if (tokenPayload.assetId !== req.params.assetId) {
    return res.status(401).json({ message: 'Token stemmer ikke med ressurs.' });
  }

  const sessionEmail = toUserEmail(req.session.user.email);
  if (toUserEmail(tokenPayload.userEmail) !== sessionEmail) {
    return res.status(401).json({ message: 'Token tilhorer en annen bruker.' });
  }

  const assetWithProject = await dbGet(
    `SELECT a.id, a.stored_name, a.file_name, a.mime_type, a.project_id,
            p.name AS project_name
     FROM assets a
     JOIN projects p ON p.id = a.project_id
     WHERE a.id = $1`,
    [req.params.assetId]
  );

  if (!assetWithProject) {
    return res.status(404).json({ message: 'Fant ikke ressurs.' });
  }

  const hasAccess = await userHasProjectAccess(req.session.user, assetWithProject.project_id);
  if (!hasAccess) {
    return res.status(403).json({ message: 'Ingen tilgang til ressursen.' });
  }

  const absolutePath = path.resolve(PROTECTED_DIR, assetWithProject.stored_name);
  if (!absolutePath.startsWith(PROTECTED_DIR)) {
    return res.status(400).json({ message: 'Ugyldig filsti.' });
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: 'Filen finnes ikke.' });
  }

  res.setHeader('Content-Type', assetWithProject.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${sanitizeFileName(assetWithProject.file_name)}"`
  );

  return res.sendFile(absolutePath);
});

app.get('/api/admin/users', ensureAuthenticated, ensureAdmin, async (_req, res) => {
  const users = await dbAll(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  return res.json({ users });
});

app.post('/api/admin/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parseValidationError(parsed, 'Ugyldige brukerdata.') });
  }

  const email = toUserEmail(parsed.data.email);
  const existing = await dbGet('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return res.status(409).json({ message: 'Bruker med e-post finnes allerede.' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const userId = randomId('usr');
  await dbRun(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [userId, parsed.data.name, email, passwordHash, parsed.data.role]
  );

  return res.status(201).json({
    user: { id: userId, name: parsed.data.name, email, role: parsed.data.role }
  });
});

app.post('/api/admin/projects', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Ugyldige prosjektdata.' });
  }

  const projectId = randomId('prj');
  await dbRun('INSERT INTO projects (id, name, description) VALUES ($1, $2, $3)', [
    projectId,
    parsed.data.name,
    parsed.data.description
  ]);

  const uniqueEmails = [...new Set(parsed.data.memberEmails.map(toUserEmail))];
  for (const email of uniqueEmails) {
    const user = await dbGet('SELECT id FROM users WHERE email = $1', [email]);
    if (user) {
      await dbRun(
        `INSERT INTO project_members (project_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, user.id]
      );
    }
  }

  return res.status(201).json({
    project: { id: projectId, name: parsed.data.name, description: parsed.data.description }
  });
});

app.post('/api/admin/projects/:projectId/members', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const parsed = projectMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Ugyldig e-post.' });
  }

  const project = await dbGet('SELECT id FROM projects WHERE id = $1', [req.params.projectId]);
  if (!project) {
    return res.status(404).json({ message: 'Prosjekt finnes ikke.' });
  }

  const user = await dbGet('SELECT id, email, name FROM users WHERE email = $1', [
    toUserEmail(parsed.data.email)
  ]);

  if (!user) {
    return res.status(404).json({ message: 'Fant ikke bruker med denne e-posten.' });
  }

  await dbRun(
    `INSERT INTO project_members (project_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [project.id, user.id]
  );

  return res.status(201).json({ member: { id: user.id, email: user.email, name: user.name } });
});

app.post(
  '/api/admin/projects/:projectId/assets',
  ensureAuthenticated,
  ensureAdmin,
  upload.array('files', 100),
  async (req, res) => {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const project = await dbGet('SELECT id FROM projects WHERE id = $1', [req.params.projectId]);
    if (!project) {
      removeUploadedFiles(uploadedFiles);
      return res.status(404).json({ message: 'Prosjekt finnes ikke.' });
    }

    if (!uploadedFiles.length) {
      return res.status(400).json({ message: 'Du ma laste opp minst en fil.' });
    }

    const title = String(req.body.title || '').trim();
    const kind = String(req.body.kind || 'dokument').trim().slice(0, 60) || 'dokument';

    const createdAssets = [];
    for (let index = 0; index < uploadedFiles.length; index += 1) {
      const file = uploadedFiles[index];
      const fileName = sanitizeFileName(file.originalname);
      const fallbackTitle = stripExtension(fileName);
      const computedTitle = title
        ? uploadedFiles.length === 1
          ? title
          : `${title} - ${index + 1}`
        : fallbackTitle || `Fil ${index + 1}`;

      const assetId = randomId('ast');
      await dbRun(
        `INSERT INTO assets
        (id, project_id, title, kind, file_name, stored_name, mime_type, size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          assetId,
          project.id,
          computedTitle,
          kind,
          fileName,
          file.filename,
          file.mimetype || 'application/octet-stream',
          file.size || 0
        ]
      );

      createdAssets.push({ id: assetId, title: computedTitle, kind, fileName });
    }

    return res.status(201).json({ assets: createdAssets, count: createdAssets.length });
  }
);

app.delete('/api/admin/projects/:projectId/assets/:assetId', ensureAuthenticated, ensureAdmin, async (req, res) => {
  const project = await dbGet('SELECT id FROM projects WHERE id = $1', [req.params.projectId]);
  if (!project) {
    return res.status(404).json({ message: 'Prosjekt finnes ikke.' });
  }

  const asset = await dbGet(
    `SELECT id, project_id, stored_name, file_name
     FROM assets
     WHERE id = $1`,
    [req.params.assetId]
  );

  if (!asset || asset.project_id !== project.id) {
    return res.status(404).json({ message: 'Fant ikke filen i prosjektet.' });
  }

  const absolutePath = path.resolve(PROTECTED_DIR, asset.stored_name);
  if (absolutePath.startsWith(PROTECTED_DIR) && fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  await dbRun('DELETE FROM assets WHERE id = $1', [asset.id]);
  return res.json({ ok: true, deleted: { id: asset.id, fileName: asset.file_name } });
});

app.get('/dashboard', ensureDashboardAccess, (req, res) => {
  res.sendFile(path.join(SITE_ROOT, 'dashboard.html'));
});

app.get('/dashboard.html', ensureDashboardAccess, (req, res) => {
  res.sendFile(path.join(SITE_ROOT, 'dashboard.html'));
});

app.get('/innlogging', (req, res) => {
  if (req.session.user?.id) {
    return res.redirect('/dashboard.html');
  }
  return res.sendFile(path.join(SITE_ROOT, 'innlogging.html'));
});

app.use('/backend', (_req, res) => {
  res.status(404).end();
});

app.use(
  express.static(SITE_ROOT, {
    index: 'index.html',
    extensions: ['html'],
    dotfiles: 'deny'
  })
);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'En eller flere filer er for store. Maks 20 MB per fil.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Du kan laste opp maks 100 filer per opplasting.' });
    }
    return res.status(400).json({ message: 'Filopplasting feilet.' });
  }

  if (err?.statusCode === 400) {
    return res.status(400).json({ message: err.message || 'Ugyldig opplastingsforesporsel.' });
  }

  console.error(err);
  res.status(500).json({ message: 'Uventet serverfeil.' });
});

await initDb();

app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});
