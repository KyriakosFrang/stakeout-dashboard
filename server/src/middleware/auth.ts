import { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware() {
  const user = process.env.STAKEOUT_DASHBOARD_USER;
  const password = process.env.STAKEOUT_DASHBOARD_PASSWORD;
  const token = process.env.STAKEOUT_DASHBOARD_TOKEN;

  // No auth configured — local dev passthrough
  if (!user && !password && !token) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization ?? '';

    // Bearer token check (for programmatic / reverse-proxy access)
    if (token && authHeader.startsWith('Bearer ')) {
      if (authHeader.slice(7) === token) return next();
    }

    // Basic auth check
    if (user && password && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon !== -1) {
        const u = decoded.slice(0, colon);
        const p = decoded.slice(colon + 1);
        if (u === user && p === password) return next();
      }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Stakeout Dashboard"');
    res.status(401).json({ error: 'Authentication required' });
  };
}
