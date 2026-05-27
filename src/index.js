import { initDatabase, cleanupOldData } from './database/schema.js';
import { handleAdminAPI } from './handlers/admin.js';
import { handleAdminUI } from './handlers/admin-ui.js';
import { handleUpdate } from './handlers/update.js';
import { handleDashboard, handleServerDetail, handleServerAPI, handleServersAPI } from './handlers/dashboard.js';
import { loadSettings } from './utils/settings.js';
import { checkAuth, authResponse } from './middleware/auth.js';

function downsampleData(data, hours) {
  if (data.length <= 1) return data;
  
  let intervalMs;
  if (hours <= 4) {
    return data;
  } else if (hours <= 12) {
    intervalMs = 2 * 60 * 1000;
  } else if (hours <= 24) {
    intervalMs = 5 * 60 * 1000;
  } else if (hours <= 72) {
    intervalMs = 13 * 60 * 1000;
  } else {
    intervalMs = 20 * 60 * 1000;
  }
  
  const sampled = [];
  let lastTimestamp = null;
  
  for (const point of data) {
    if (lastTimestamp === null || point.timestamp - lastTimestamp >= intervalMs) {
      sampled.push(point);
      lastTimestamp = point.timestamp;
    }
  }
  
  return sampled;
}

async function fetchHistoryData(env, sys, request, id, hours, columns) {
  if (sys.is_public !== 'true' && !checkAuth(request, env)) {
    return authResponse(sys.site_title);
  }
  
  if (!id) return new Response('Missing ID', { status: 400 });
  
  const isLoggedIn = checkAuth(request, env);
  let serverQuery = 'SELECT id FROM servers WHERE id = ?';
  if (!isLoggedIn) {
    serverQuery += " AND is_hidden != '1'";
  }
  const server = await env.DB.prepare(serverQuery).bind(id).first();
  if (!server) return new Response('Not Found', { status: 404 });
  
  const now = Date.now();
  const cutoff = now - (hours * 60 * 60 * 1000);
  
  const history = await env.DB.prepare(`
    SELECT timestamp, ${columns}
    FROM metrics_history
    WHERE server_id = ? AND timestamp > ?
    ORDER BY timestamp ASC
  `).bind(id, cutoff).all();
  
  const processed = history.results.map(row => ({
    ...row,
    timestamp: row.timestamp
  }));
  
  const sampled = downsampleData(processed, hours);
  
  return new Response(JSON.stringify(sampled), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env, ctx) {
    await initDatabase(env.DB);

    const url = new URL(request.url);
    const sys = await loadSettings(env.DB);
    const method = request.method;
    const path = url.pathname;

    const routes = [
      { method: 'POST', path: '/admin/api', handler: () => handleAdminAPI(request, env, sys) },
      { method: 'GET', path: '/admin', handler: () => handleAdminUI(request, env, sys) },
      { method: 'POST', path: '/update', handler: () => handleUpdate(request, env, ctx) },
      { method: 'GET', path: '/api/server', handler: () => handleServerAPI(request, env, sys) },
      { method: 'GET', path: '/api/servers', handler: () => handleServersAPI(request, env, sys) },
      { method: 'GET', path: '/api/history', handler: () => {
        const id = url.searchParams.get('id');
        const metric = url.searchParams.get('metric') || 'cpu';
        const hours = parseFloat(url.searchParams.get('hours') || '24');
        return fetchHistoryData(env, sys, request, id, hours, metric);
      }},
      { method: 'GET', path: '/api/history/all', handler: () => {
        const id = url.searchParams.get('id');
        const hours = parseFloat(url.searchParams.get('hours') || '24');
        const allColumns = 'cpu, ram, disk, processes, net_in_speed, net_out_speed, tcp_conn, udp_conn, ping_ct, ping_cu, ping_cm, ping_bd';
        return fetchHistoryData(env, sys, request, id, hours, allColumns);
      }},
      { method: 'GET', path: '/', handler: () => {
        const viewId = url.searchParams.get('id');
        if (viewId) {
          return handleServerDetail(request, env, sys, viewId);
        }
        return handleDashboard(request, env, sys);
      }}
    ];

    for (const route of routes) {
      if (route.method === method && route.path === path) {
        return route.handler();
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    await initDatabase(env.DB);
    
    console.log('[Cron] 开始执行定时清理任务');
    await cleanupOldData(env.DB);
    console.log('[Cron] 定时清理任务完成');
  }
};