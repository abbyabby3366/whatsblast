process.env.TZ = 'Asia/Kuala_Lumpur';
import 'dotenv/config';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Kuala_Lumpur');

import './utils/asyncErrors.js';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
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
import workflowRoutes from './routes/workflowRoutes.js';

import { restoreAllSessions, shutdownAllSessions } from './services/baileysManager.js';
import { startBlastRunner, stopBlastRunner, getActiveCampaigns, stopCampaignExecution } from './services/blastRunner.js';
import { startCrossChatRunner, stopCrossChatRunner } from './services/crossChatRunner.js';
import { initWorkflowScheduler, stopAllWorkflowJobs } from './services/workflowScheduler.js';
import { initMessageRetention, stopMessageRetention } from './services/messageRetentionService.js';
import { startMemoryMonitor, stopMemoryMonitor } from './services/memoryMonitor.js';
import { sendDeployNotification } from './utils/whatsappNotifier.js';
import { getAppVersion, getLatestCommitMessage } from './utils/version.js';


process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught exception:', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trailing slash normalization middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.slice(req.path.length);
    const safepath = req.path.slice(0, -1);
    req.url = safepath + query;
  }
  next();
});

// API Routes
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', customerRoutes);
app.use('/api', sessionRoutes);
app.use('/api', templateRoutes);
app.use('/api', campaignRoutes);
app.use('/api', messageRoutes);
app.use('/api', fileRoutes);
app.use('/api/workflows', workflowRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

import { pathToFileURL } from 'url';

let clientDistPath = path.resolve(process.cwd(), 'client/dist/client');
if (!fs.existsSync(clientDistPath)) {
  clientDistPath = path.resolve(process.cwd(), 'client/dist');
}

if (fs.existsSync(clientDistPath)) {
  console.log(`🌐 Serving static frontend assets from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
}

let ssrHandler: ((req: any) => Promise<any>) | null = null;

app.get('*', async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }

  if (ssrHandler) {
    try {
      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost';
      const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value as string);
          }
        }
      }

      const webRequest = new globalThis.Request(fullUrl, {
        method: req.method,
        headers,
      });

      const webResponse: any = await ssrHandler(webRequest);
      res.status(webResponse.status);
      webResponse.headers.forEach((val: string, key: string) => {
        res.append(key, val);
      });

      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } else {
        res.end();
      }
      return;
    } catch (ssrErr) {
      console.error('SSR Render Error:', ssrErr);
    }
  }

  if (fs.existsSync(clientDistPath)) {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
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

// Global Express Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body in request' });
  }
  if (err?.name === 'CastError' || err?.name === 'ValidationError' || err?.name === 'StrictModeError') {
    return res.status(400).json({ error: err.message || 'Invalid request' });
  }
  if (res.headersSent) {
    console.error('Unhandled Express Error after response started:', err);
    return;
  }
  console.error('Unhandled Express Error:', err);
  return res.status(500).json({ error: err.message || 'Internal Server Error' });
});

async function main() {
  await connectDB();
  await restoreAllSessions();
  startBlastRunner();
  startCrossChatRunner();
  await initWorkflowScheduler();
  await initMessageRetention();
  startMemoryMonitor();

  const serverDistPath = path.resolve(process.cwd(), 'client/dist/server/server.js');
  if (fs.existsSync(serverDistPath)) {
    try {
      const ssrModule = await import(pathToFileURL(serverDistPath).href);
      ssrHandler = ssrModule.default?.fetch || ssrModule.fetch || ssrModule.default;
      console.log('⚡ TanStack Start SSR Handler loaded successfully');
    } catch (err) {
      console.error('⚠️ Failed to load SSR Handler:', err);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 WhatsBlast Server listening on port ${PORT}`);
    console.log(`👉 API Base: http://localhost:3000/api`);

    // Send deployment WhatsApp notification
    if (process.env.NODE_ENV === 'production') {
      const version = getAppVersion();
      const commitMsg = getLatestCommitMessage();
      const notificationMsg = commitMsg
        ? `🚀 *WhatsBlast (${version}) built & deployed successfully!*\n\n📝 *Commit:* ${commitMsg}`
        : `🚀 *WhatsBlast (${version}) built & deployed successfully!*`;
      sendDeployNotification(notificationMsg);
    }

  });

  // Graceful shutdown: on redeploy the old instance must release WhatsApp sockets and
  // stop its runners/crons, otherwise both instances send and fight over the sessions.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`
🛑 Received ${signal}, shutting down gracefully...`);
    const forceExit = setTimeout(() => process.exit(1), 25_000);
    forceExit.unref();
    try {
      stopBlastRunner();
      stopCrossChatRunner();
      stopAllWorkflowJobs();
      stopMessageRetention();
      stopMemoryMonitor();
      server.close();
      // Let in-flight sends finish before the sockets go away
      await Promise.all([...getActiveCampaigns()].map((id) => stopCampaignExecution(id, 8000)));
      shutdownAllSessions();
      await mongoose.disconnect();
    } catch (err) {
      console.error('Error during shutdown:', err);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
