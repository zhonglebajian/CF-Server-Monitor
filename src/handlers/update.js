import { saveMetricsHistory } from '../database/schema.js';
import { checkOfflineNodes } from '../services/notification.js';
import { loadSettings } from '../utils/settings.js';

export async function handleUpdate(request, env, ctx) {
  try {
    const data = await request.json();
    const { id, secret, metrics } = data;

    if (secret !== env.API_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let countryCode = request.cf?.country || 'XX';
    if (countryCode.toUpperCase() === 'TW') countryCode = 'CN';

    const serverExists = await env.DB.prepare(
      'SELECT * FROM servers WHERE id = ?'
    ).bind(id).first();
    
    if (!serverExists) {
      return new Response('Server not found', { status: 404 });
    }

    const sys = await loadSettings(env.DB);

    const nowTime = new Date();
    const tzOffset = 8 * 60 * 60000;
    const localNow = new Date(nowTime.getTime() + tzOffset);
    const currentMonthStr = `${localNow.getFullYear()}-${localNow.getMonth() + 1}`;
    
    let monthly_rx = parseFloat(serverExists.monthly_rx || '0');
    let monthly_tx = parseFloat(serverExists.monthly_tx || '0');
    let last_rx = parseFloat(serverExists.last_rx || '0');
    let last_tx = parseFloat(serverExists.last_tx || '0');
    let reset_month = serverExists.reset_month || currentMonthStr;

    if (sys.auto_reset_traffic === 'true' && currentMonthStr !== reset_month) {
      monthly_rx = 0;
      monthly_tx = 0;
      reset_month = currentMonthStr;
    }

    const current_rx = parseFloat(metrics.net_rx || '0');
    const current_tx = parseFloat(metrics.net_tx || '0');

    if (current_rx >= last_rx) {
      monthly_rx += (current_rx - last_rx);
    } else {
      monthly_rx += current_rx;
    }

    if (current_tx >= last_tx) {
      monthly_tx += (current_tx - last_tx);
    } else {
      monthly_tx += current_tx;
    }

    last_rx = current_rx;
    last_tx = current_tx;

    await env.DB.prepare(`
      UPDATE servers 
      SET cpu = ?, ram = ?, disk = ?, load_avg = ?, uptime = ?, last_updated = ?,
          ram_total = ?, net_rx = ?, net_tx = ?, net_in_speed = ?, net_out_speed = ?,
          os = ?, cpu_info = ?, cpu_cores = ?, arch = ?, boot_time = ?, ram_used = ?, swap_total = ?, 
          swap_used = ?, disk_total = ?, disk_used = ?, processes = ?, tcp_conn = ?, udp_conn = ?, 
          country = ?, ip_v4 = ?, ip_v6 = ?, ping_ct = ?, ping_cu = ?, ping_cm = ?, ping_bd = ?,
          monthly_rx = ?, monthly_tx = ?, last_rx = ?, last_tx = ?, reset_month = ?
      WHERE id = ?
    `).bind(
      metrics.cpu, metrics.ram, metrics.disk, metrics.load, metrics.uptime, Date.now(),
      metrics.ram_total || '0', metrics.net_rx || '0', metrics.net_tx || '0',
      metrics.net_in_speed || '0', metrics.net_out_speed || '0',
      metrics.os || '', metrics.cpu_info || '', metrics.cpu_cores || '0', metrics.arch || '', metrics.boot_time || '',
      metrics.ram_used || '0', metrics.swap_total || '0', metrics.swap_used || '0',
      metrics.disk_total || '0', metrics.disk_used || '0', metrics.processes || '0',
      metrics.tcp_conn || '0', metrics.udp_conn || '0', countryCode,
      metrics.ip_v4 || '0', metrics.ip_v6 || '0',
      metrics.ping_ct || '0', metrics.ping_cu || '0', metrics.ping_cm || '0', metrics.ping_bd || '0',
      monthly_rx.toString(), monthly_tx.toString(), last_rx.toString(), last_tx.toString(), reset_month,
      id
    ).run();

    await saveMetricsHistory(env.DB, id, metrics);

    ctx.waitUntil(checkOfflineNodes(env.DB, sys));

    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('更新数据失败:', e);
    return new Response(`Error: ${e.message}`, { status: 400 });
  }
}