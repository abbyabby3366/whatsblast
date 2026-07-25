import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import fileRoutes from './routes/fileRoutes.js';

import { restoreAllSessions } from './services/baileysManager.js';
import { startBlastRunner } from './services/blastRunner.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', customerRoutes);
app.use('/api', sessionRoutes);
app.use('/api', templateRoutes);
app.use('/api', campaignRoutes);
app.use('/api', messageRoutes);
app.use('/api', fileRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static production build if present (e.g. on Render)
let clientDistPath = path.resolve(process.cwd(), 'client/dist/client');
if (!fs.existsSync(clientDistPath)) {
  clientDistPath = path.resolve(process.cwd(), 'client/dist');
}

if (fs.existsSync(clientDistPath)) {
  const indexPath = path.join(clientDistPath, 'index.html');
  console.log(`🌐 Serving static frontend from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>🚀 WhatsBlast Server is Running</h2>
        <p>In development mode, access the React Frontend UI at: <br/><br/>
           <a href="http://localhost:25433" style="font-size: 18px; font-weight: bold; color: #2563eb;">http://localhost:25433</a>
        </p>
        <p>Backend REST API Base: <code>http://localhost:3000/api</code></p>
      </div>
    `);
  });
} else {
  app.get('/', (_req, res) => {
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>🚀 WhatsBlast Server is Running</h2>
        <p>In development mode, access the React Frontend UI at: <br/><br/>
           <a href="http://localhost:25433" style="font-size: 18px; font-weight: bold; color: #2563eb;">http://localhost:25433</a>
        </p>
        <p>Backend REST API Base: <code>http://localhost:3000/api</code></p>
      </div>
    `);
  });
}

async function main() {
  await connectDB();
  await restoreAllSessions();
  startBlastRunner();

  app.listen(PORT, () => {
    console.log(`\n🚀 WhatsBlast Server listening on port ${PORT}`);
    console.log(`👉 API Base: http://localhost:${PORT}/api`);
  });
}

main().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
