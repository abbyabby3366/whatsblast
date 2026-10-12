// Express 4 ignores promises returned by route handlers, so a rejected async
// handler becomes an unhandledRejection and (on Node >= 15) kills the process.
// Patch Layer.handle_request so rejections are forwarded to next(err) and reach
// the global error handler instead. Must be imported before routes are used.
import { createRequire } from 'module';

const requireCjs = createRequire(__filename);
const Layer = requireCjs('express/lib/router/layer.js');

if (!Layer.prototype.__asyncPatched) {
  Layer.prototype.handle_request = function handle(req: any, res: any, next: (err?: any) => void) {
    const fn = this.handle;

    if (fn.length > 3) {
      // not a standard request handler
      return next();
    }

    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.catch === 'function') {
        ret.catch((err: any) => next(err || new Error('Rejected with falsy value')));
      }
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;
}

export {};
