let dbInitialized = false;

export async function initDatabase(db) {
  if (dbInitialized) return;
  
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, 
        value TEXT
      )
    `).run();

    // 服务器表
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT,
        cpu TEXT DEFAULT '0',
        ram TEXT DEFAULT '0',
        disk TEXT DEFAULT '0',
        load_avg TEXT DEFAULT '0',
        uptime TEXT DEFAULT '0',
        last_updated INTEGER DEFAULT 0,
        ram_total TEXT DEFAULT '0',
        net_rx TEXT DEFAULT '0',
        net_tx TEXT DEFAULT '0',
        net_in_speed TEXT DEFAULT '0',
        net_out_speed TEXT DEFAULT '0',
        os TEXT DEFAULT '',
        cpu_info TEXT DEFAULT '',
        cpu_cores TEXT DEFAULT '0',
        arch TEXT DEFAULT '',
        boot_time TEXT DEFAULT '',
        ram_used TEXT DEFAULT '0',
        swap_total TEXT DEFAULT '0',
        swap_used TEXT DEFAULT '0',
        disk_total TEXT DEFAULT '0',
        disk_used TEXT DEFAULT '0',
        processes TEXT DEFAULT '0',
        tcp_conn TEXT DEFAULT '0',
        udp_conn TEXT DEFAULT '0',
        country TEXT DEFAULT 'XX',
        ip_v4 TEXT DEFAULT '0',
        ip_v6 TEXT DEFAULT '0',
        server_group TEXT DEFAULT 'Default',
        price TEXT DEFAULT '',
        expire_date TEXT DEFAULT '',
        bandwidth TEXT DEFAULT '',
        traffic_limit TEXT DEFAULT '',
        ping_ct TEXT DEFAULT '0',
        ping_cu TEXT DEFAULT '0',
        ping_cm TEXT DEFAULT '0',
        ping_bd TEXT DEFAULT '0',
        monthly_rx TEXT DEFAULT '0',
        monthly_tx TEXT DEFAULT '0',
        last_rx TEXT DEFAULT '0',
        last_tx TEXT DEFAULT '0',
        reset_month TEXT DEFAULT '',
        is_hidden TEXT DEFAULT '0',
        sort_order INTEGER DEFAULT 0
      )
    `).run();

    // ========== 新增：指标历史数据表 ==========
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS metrics_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now')),
        cpu REAL DEFAULT 0,
        ram REAL DEFAULT 0,
        disk REAL DEFAULT 0,
        load_avg TEXT DEFAULT '0',
        net_in_speed REAL DEFAULT 0,
        net_out_speed REAL DEFAULT 0,
        net_rx REAL DEFAULT 0,
        net_tx REAL DEFAULT 0,
        processes INTEGER DEFAULT 0,
        tcp_conn INTEGER DEFAULT 0,
        udp_conn INTEGER DEFAULT 0,
        ping_ct INTEGER DEFAULT 0,
        ping_cu INTEGER DEFAULT 0,
        ping_cm INTEGER DEFAULT 0,
        ping_bd INTEGER DEFAULT 0,
        ram_total REAL DEFAULT 0,
        ram_used REAL DEFAULT 0,
        swap_total REAL DEFAULT 0,
        swap_used REAL DEFAULT 0,
        disk_total REAL DEFAULT 0,
        disk_used REAL DEFAULT 0,
        FOREIGN KEY (server_id) REFERENCES servers(id)
      )
    `).run();

    // 为历史数据表创建索引，加速查询
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_history_server_time 
      ON metrics_history(server_id, timestamp)
    `).run();

    // 数据库列迁移（兼容旧版本）
    const { results: columns } = await db.prepare(`PRAGMA table_info(servers)`).all();
    const existingCols = columns.map(c => c.name);
    
    const newCols = {
      ping_ct: "TEXT DEFAULT '0'",
      ping_cu: "TEXT DEFAULT '0'",
      ping_cm: "TEXT DEFAULT '0'",
      ping_bd: "TEXT DEFAULT '0'",
      monthly_rx: "TEXT DEFAULT '0'",
      monthly_tx: "TEXT DEFAULT '0'",
      last_rx: "TEXT DEFAULT '0'",
      last_tx: "TEXT DEFAULT '0'",
      reset_month: "TEXT DEFAULT ''",
      cpu_cores: "TEXT DEFAULT '0'",
      is_hidden: "TEXT DEFAULT '0'",
      sort_order: "INTEGER DEFAULT 0"
    };

    for (const [colName, colDef] of Object.entries(newCols)) {
      if (!existingCols.includes(colName)) {
        await db.prepare(`ALTER TABLE servers ADD COLUMN ${colName} ${colDef}`).run();
      }
    }

    console.log('✅ 数据库初始化完成');
    dbInitialized = true;
  } catch (e) {
    console.error('❌ 数据库初始化失败:', e);
  }
}

export async function cleanupOldData(db) {
  try {
    const lastClean = await db.prepare(`SELECT value FROM settings WHERE key = 'last_cleanup'`).first();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (!lastClean || (now - parseInt(lastClean.value)) > oneDay) {
      const cutoff = now - 7 * oneDay;
      const deleteResult = await db.prepare(
        `DELETE FROM metrics_history WHERE timestamp < ?`
      ).bind(cutoff).run();
      
      if (deleteResult.meta.changes > 0) {
        await db.prepare(`
          INSERT OR REPLACE INTO settings (key, value) VALUES ('last_cleanup', ?)
        `).bind(now.toString()).run();
        
        console.log(`[Cron] 已清理 ${deleteResult.meta.changes} 条7天前的旧数据`);
      }
    }
  } catch (e) {
    console.error('[Cron] 清理数据失败:', e);
  }
}

// 保存历史指标数据
export async function saveMetricsHistory(db, serverId, metrics) {
  try {
    const now = Date.now();
    await db.prepare(`
      INSERT INTO metrics_history (
        server_id, timestamp, cpu, ram, disk, load_avg,
        net_in_speed, net_out_speed, net_rx, net_tx,
        processes, tcp_conn, udp_conn,
        ping_ct, ping_cu, ping_cm, ping_bd,
        ram_total, ram_used, swap_total, swap_used,
        disk_total, disk_used
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).bind(
      serverId,
      now,
      parseFloat(metrics.cpu) || 0,
      parseFloat(metrics.ram) || 0,
      parseFloat(metrics.disk) || 0,
      metrics.load || '0',
      parseFloat(metrics.net_in_speed) || 0,
      parseFloat(metrics.net_out_speed) || 0,
      parseFloat(metrics.net_rx) || 0,
      parseFloat(metrics.net_tx) || 0,
      parseInt(metrics.processes) || 0,
      parseInt(metrics.tcp_conn) || 0,
      parseInt(metrics.udp_conn) || 0,
      parseInt(metrics.ping_ct) || 0,
      parseInt(metrics.ping_cu) || 0,
      parseInt(metrics.ping_cm) || 0,
      parseInt(metrics.ping_bd) || 0,
      parseFloat(metrics.ram_total) || 0,
      parseFloat(metrics.ram_used) || 0,
      parseFloat(metrics.swap_total) || 0,
      parseFloat(metrics.swap_used) || 0,
      parseFloat(metrics.disk_total) || 0,
      parseFloat(metrics.disk_used) || 0
    ).run();
  } catch (e) {
    console.error('保存历史数据失败:', e);
  }
}