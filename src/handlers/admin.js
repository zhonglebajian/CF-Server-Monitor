import { checkAuth, authResponse } from '../middleware/auth.js';

function isValidUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidName(name) {
  return name && typeof name === 'string' && name.trim().length > 0 && name.length <= 100;
}

export async function handleAdminAPI(request, env, sys) {
  if (!checkAuth(request, env)) {
    return authResponse(sys.admin_title);
  }

  try {
    const data = await request.json();
    
    if (data.action === 'save_settings') {
      for (const [k, v] of Object.entries(data.settings)) {
        await env.DB.prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        ).bind(k, v).run();
      }
      return new Response(JSON.stringify({ success: true, message: '设置已保存' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } 
    else if (data.action === 'add') {
      const name = data.name || 'New Server';
      if (!isValidName(name)) {
        return new Response(JSON.stringify({ error: '服务器名称无效' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const id = crypto.randomUUID();
      const group = data.server_group || 'Default';
      
      const { max_order } = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM servers').first();
      const sortOrder = (max_order || 0) + 1;
      
      await env.DB.prepare(`
        INSERT INTO servers 
        (id, name, cpu, ram, disk, load_avg, uptime, last_updated, 
         ram_total, net_rx, net_tx, net_in_speed, net_out_speed, 
         os, cpu_info, arch, boot_time, ram_used, swap_total, swap_used, 
         disk_total, disk_used, processes, tcp_conn, udp_conn, 
         country, ip_v4, ip_v6, server_group, price, expire_date, 
         bandwidth, traffic_limit, ping_ct, ping_cu, ping_cm, ping_bd, 
         monthly_rx, monthly_tx, last_rx, last_tx, reset_month, sort_order) 
        VALUES (?, ?, '0', '0', '0', '0', '0', 0, 
                '0', '0', '0', '0', '0', 
                '', '', '', '', '0', '0', '0', 
                '0', '0', '0', '0', '0', 
                'XX', '0', '0', ?, '', '', 
                '', '', '0', '0', '0', '0', 
                '0', '0', '0', '0', '', ?)
      `).bind(id, name, group, sortOrder).run();
      
      return new Response(JSON.stringify({ 
        success: true, 
        id: id,
        message: `服务器 "${name}" 已添加` 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } 
    else if (data.action === 'delete') {
      const { id } = data;
      if (!id || !isValidUUID(id)) {
        return new Response(JSON.stringify({ error: '服务器 ID 无效' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      await env.DB.prepare('DELETE FROM metrics_history WHERE server_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(id).run();
      
      return new Response(JSON.stringify({ success: true, message: '服务器已删除' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } 
    else if (data.action === 'save_order') {
      const { orders } = data;
      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return new Response(JSON.stringify({ error: '缺少排序数据' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      for (let i = 0; i < orders.length; i++) {
        if (!isValidUUID(orders[i])) {
          return new Response(JSON.stringify({ error: '排序数据包含无效 ID' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        await env.DB.prepare('UPDATE servers SET sort_order = ? WHERE id = ?').bind(i, orders[i]).run();
      }
      
      return new Response(JSON.stringify({ success: true, message: '排序已保存' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'edit') {
      const { id, server_group, price, expire_date, bandwidth, traffic_limit, is_hidden } = data;
      if (!id || !isValidUUID(id)) {
        return new Response(JSON.stringify({ error: '服务器 ID 无效' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      await env.DB.prepare(`
        UPDATE servers 
        SET server_group = ?, price = ?, expire_date = ?, bandwidth = ?, traffic_limit = ?, is_hidden = ? 
        WHERE id = ?
      `).bind(
        server_group || 'Default', 
        price || '', 
        expire_date || '', 
        bandwidth || '', 
        traffic_limit || '',
        is_hidden || '0',
        id
      ).run();
      
      return new Response(JSON.stringify({ success: true, message: '服务器信息已更新' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'batch_delete') {
      const { ids } = data;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ error: '请选择要删除的服务器' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      for (const id of ids) {
        if (!isValidUUID(id)) {
          return new Response(JSON.stringify({ error: '包含无效的服务器 ID' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      const placeholders = ids.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM metrics_history WHERE server_id IN (${placeholders})`).bind(...ids).run();
      await env.DB.prepare(`DELETE FROM servers WHERE id IN (${placeholders})`).bind(...ids).run();
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `已删除 ${ids.length} 台服务器` 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'get_stats') {
      const { results: servers } = await env.DB.prepare(
        'SELECT id, name, last_updated, country, cpu, ram, disk, net_in_speed, net_out_speed FROM servers'
      ).all();
      
      const now = Date.now();
      const stats = {
        total: servers.length,
        online: 0,
        offline: 0,
        total_cpu: 0,
        total_ram: 0,
        total_disk: 0,
        total_net_in: 0,
        total_net_out: 0
      };
      
      servers.forEach(s => {
        const lastUpdated = new Date(s.last_updated).getTime();
        if ((now - lastUpdated) < 300000) {
          stats.online++;
          stats.total_cpu += parseFloat(s.cpu) || 0;
          stats.total_ram += parseFloat(s.ram) || 0;
          stats.total_disk += parseFloat(s.disk) || 0;
          stats.total_net_in += parseFloat(s.net_in_speed) || 0;
          stats.total_net_out += parseFloat(s.net_out_speed) || 0;
        } else {
          stats.offline++;
        }
      });
      
      if (stats.online > 0) {
        stats.avg_cpu = (stats.total_cpu / stats.online).toFixed(2);
        stats.avg_ram = (stats.total_ram / stats.online).toFixed(2);
        stats.avg_disk = (stats.total_disk / stats.online).toFixed(2);
      }
      
      return new Response(JSON.stringify({ success: true, stats }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'clean_history') {
      const days = data.days || 7;
      if (typeof days !== 'number' || days < 1 || days > 365) {
        return new Response(JSON.stringify({ error: '天数参数无效' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      await env.DB.prepare(
        `DELETE FROM metrics_history WHERE timestamp < datetime('now', '-' || ? || ' days')`
      ).bind(days).run();
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `已清理 ${days} 天前的历史数据` 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: '未知操作' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (e) {
    console.error('Admin API 错误:', e);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}