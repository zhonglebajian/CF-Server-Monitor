export function formatBytes(bytes) {
  const b = parseInt(bytes);
  if (isNaN(b) || b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  let result = '';
  if (days > 0) result += `${days}天 `;
  if (hours > 0) result += `${hours}小时 `;
  result += `${minutes}分钟`;
  return result;
}

export function getPingColor(ping) {
  const p = parseInt(ping);
  if (p === 0 || isNaN(p)) return '#9ca3af';
  if (p < 100) return '#10b981';
  if (p < 200) return '#f59e0b';
  return '#ef4444';
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function successResponse(message, data = {}) {
  return jsonResponse({ success: true, message, ...data });
}