import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
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
  console.error('Unhandled Express Error:', err);
  return res.status(500).json({ error: err.message || 'Internal Server Error' });
});

async function main() {
  await connectDB();
  await restoreAllSessions();
  startBlastRunner();

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

  app.listen(PORT, () => {
    console.log(`\n🚀 WhatsBlast Server listening on port ${PORT}`);
    console.log(`👉 API Base: http://localhost:3000/api`);
  });
}

main().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
