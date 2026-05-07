/**
 * Health check endpoint
 * GET /api/health - Check health of all services and integrations
 */
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ServiceCheck {
  name: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  latency?: number;
  details?: string;
  url?: string;
}

async function checkUrl(url: string, timeoutMs = 5000): Promise<{ status: 'up' | 'down'; latency: number; httpCode?: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    return { status: res.ok || res.status < 500 ? 'up' : 'down', latency, httpCode: res.status };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

async function checkSystemdService(name: string): Promise<ServiceCheck> {
  try {
    const { stdout } = await execAsync(`systemctl is-active ${name} 2>/dev/null`);
    const active = stdout.trim() === 'active';
    return { name, status: active ? 'up' : 'down', details: stdout.trim() };
  } catch {
    return { name, status: 'down', details: 'service not found' };
  }
}

async function checkPm2Service(name: string): Promise<ServiceCheck> {
  try {
    const { stdout } = await execAsync('pm2 jlist 2>/dev/null');
    const list = JSON.parse(stdout);
    const proc = list.find((p: { name: string }) => p.name === name);
    if (!proc) return { name, status: 'unknown', details: 'not found in pm2' };
    const status = proc.pm2_env?.status === 'online' ? 'up' : 'down';
    return { name, status, details: `${proc.pm2_env?.status} · restarts: ${proc.pm2_env?.restart_time}` };
  } catch {
    return { name, status: 'unknown', details: 'pm2 not available' };
  }
}

export async function GET() {
  const checks: ServiceCheck[] = [];

  // Internal services
  const missionControl = await checkSystemdService('mission-control');
  checks.push({ ...missionControl, name: 'Mission Control' });

  // Check OpenClaw gateway via port 18789
  const openclawPort = await checkUrl('http://localhost:18789', 2000);
  checks.push({
    name: 'OpenClaw Gateway',
    status: openclawPort.status,
    details: openclawPort.status === 'up' ? 'port 18789 active' : 'not reachable',
  });

  // External URLs
  const urlChecks = await Promise.all([
    checkUrl('https://tenazo.jgarmar.es', 5000),
    checkUrl('https://openclaw.jgarmar.es', 5000),
    checkUrl('https://api.anthropic.com', 3000),
  ]);

  checks.push({
    name: 'TenacitOS Dashboard',
    status: urlChecks[0].status,
    latency: urlChecks[0].latency,
    url: 'https://tenazo.jgarmar.es',
  });

  checks.push({
    name: 'OpenClaw Web',
    status: urlChecks[1].status,
    latency: urlChecks[1].latency,
    url: 'https://openclaw.jgarmar.es',
  });

  checks.push({
    name: 'Anthropic API',
    status: urlChecks[2].status === 'up' || (urlChecks[2] as { httpCode?: number }).httpCode === 401 ? 'up' : urlChecks[2].status,
    latency: urlChecks[2].latency,
    url: 'https://api.anthropic.com',
    details: urlChecks[2].status === 'up' || (urlChecks[2] as { httpCode?: number }).httpCode === 401 ? 'reachable' : 'unreachable',
  });

  // Overall status
  const downCount = checks.filter((c) => c.status === 'down').length;
  const overallStatus = downCount === 0 ? 'healthy' : downCount < checks.length / 2 ? 'degraded' : 'critical';

  return NextResponse.json({
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
