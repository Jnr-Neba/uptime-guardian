const express = require('express')
const os = require('os')
const http = require('http')
const https = require('https')

const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'uptime-guardian',
    tagline: 'Monitoring your infrastructure, so you can sleep at night',
    status: 'operational',
    version: process.env.APP_VERSION || 'local',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(process.uptime()),
      human: formatUptime(process.uptime())
    },
    system: {
      platform: os.platform(),
      memory: {
        total_mb: Math.round(os.totalmem() / 1024 / 1024),
        free_mb: Math.round(os.freemem() / 1024 / 1024),
        used_percent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
      },
      cpus: os.cpus().length
    },
    endpoints: [
      { path: '/',          method: 'GET',  description: 'Service info and system stats' },
      { path: '/healthz',   method: 'GET',  description: 'Kubernetes liveness probe'     },
      { path: '/readyz',    method: 'GET',  description: 'Kubernetes readiness probe'    },
      { path: '/api/check', method: 'POST', description: 'Check endpoint health'         },
      { path: '/dashboard', method: 'GET',  description: 'Live operations dashboard'     }
    ]
  })
})

app.get('/healthz', (req, res) => {
  const memUsedPercent = Math.round(
    ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
  )
  const healthy = memUsedPercent < 95
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks: {
      server: 'ok',
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      memory_pressure: memUsedPercent > 80 ? 'high' : 'normal'
    },
    uptime_seconds: Math.floor(process.uptime())
  })
})

app.get('/readyz', (req, res) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString()
  })
})

app.post('/api/check', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  // Validate URL format
  try {
    new URL(url)
  } catch (e) {
    return res.status(400).json({
      url,
      healthy: false,
      error: 'Invalid URL — make sure it starts with http:// or https://'
    })
  }

  const start = Date.now()
  const client = url.startsWith('https') ? https : http

  const request = client.get(url, { timeout: 5000 }, (response) => {
    const latency = Date.now() - start
    response.resume()
    res.json({
      url,
      status: response.statusCode,
      latency_ms: latency,
      healthy: response.statusCode >= 200 && response.statusCode < 400,
      checked_at: new Date().toISOString()
    })
  })

  request.on('timeout', () => {
    request.destroy()
    res.json({ url, status: null, latency_ms: 5000, healthy: false, error: 'timeout', checked_at: new Date().toISOString() })
  })

  request.on('error', (err) => {
    res.json({ url, status: null, latency_ms: Date.now() - start, healthy: false, error: err.message, checked_at: new Date().toISOString() })
  })
})

app.get('/dashboard', (req, res) => {
  const html = getDashboardHtml()
  res.send(html)
})

function getDashboardHtml() {
  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'<title>Uptime Guardian — Dashboard</title>' +
'<style>' +
'*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
':root{' +
'--bg:#f8f9fc;--surface:#ffffff;--border:#e5e7f0;' +
'--text-primary:#0f1117;--text-secondary:#6b7280;--text-muted:#9ca3af;' +
'--accent:#6366f1;--accent-light:#eef2ff;' +
'--success:#10b981;--success-light:#d1fae5;' +
'--warning:#f59e0b;--warning-light:#fef3c7;' +
'--danger:#ef4444;--danger-light:#fee2e2;' +
'--radius:12px;--radius-sm:8px;' +
'--shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);' +
'--shadow-md:0 4px 6px rgba(0,0,0,0.05),0 2px 4px rgba(0,0,0,0.04);}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;background:var(--bg);color:var(--text-primary);min-height:100vh;}' +
'.header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}' +
'.header-left{display:flex;align-items:center;gap:12px;}' +
'.logo{width:32px;height:32px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;}' +
'.app-name{font-size:15px;font-weight:600;letter-spacing:-0.3px;}' +
'.app-tagline{font-size:12px;color:var(--text-muted);}' +
'.status-badge{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:500;background:var(--success-light);color:var(--success);}' +
'.status-dot{width:7px;height:7px;border-radius:50%;background:var(--success);animation:pulse 2s infinite;}' +
'@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(0.85)}}' +
'.main{max-width:1100px;margin:0 auto;padding:32px 24px;}' +
'.section-title{font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;}' +
'.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px;}' +
'.metric-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);transition:box-shadow 0.2s;}' +
'.metric-card:hover{box-shadow:var(--shadow-md);}' +
'.metric-label{font-size:12px;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:6px;}' +
'.metric-icon{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;}' +
'.metric-value{font-size:28px;font-weight:700;letter-spacing:-1px;color:var(--text-primary);line-height:1;margin-bottom:4px;}' +
'.metric-sub{font-size:12px;color:var(--text-muted);}' +
'.gauge-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);margin-bottom:32px;}' +
'.gauge-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}' +
'.gauge-title{font-size:14px;font-weight:500;}' +
'.gauge-value{font-size:24px;font-weight:700;letter-spacing:-0.5px;}' +
'.gauge-track{height:10px;background:var(--bg);border-radius:10px;overflow:hidden;margin-bottom:8px;}' +
'.gauge-fill{height:100%;border-radius:10px;transition:width 0.8s cubic-bezier(0.4,0,0.2,1),background 0.5s;}' +
'.gauge-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);}' +
'.checker-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow);margin-bottom:32px;}' +
'.checker-title{font-size:15px;font-weight:600;margin-bottom:4px;}' +
'.checker-desc{font-size:13px;color:var(--text-secondary);margin-bottom:16px;}' +
'.checker-input-row{display:flex;gap:10px;}' +
'.checker-input{flex:1;height:42px;padding:0 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;color:var(--text-primary);background:var(--bg);outline:none;transition:border-color 0.15s;}' +
'.checker-input:focus{border-color:var(--accent);background:white;}' +
'.checker-btn{height:42px;padding:0 20px;background:var(--accent);color:white;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:500;cursor:pointer;transition:opacity 0.15s,transform 0.1s;white-space:nowrap;}' +
'.checker-btn:hover{opacity:0.9}.checker-btn:active{transform:scale(0.98)}.checker-btn:disabled{opacity:0.5;cursor:not-allowed;}' +
'.result-card{margin-top:14px;padding:16px;border-radius:var(--radius-sm);border:1px solid var(--border);display:none;}' +
'.result-card.visible{display:block}' +
'.result-card.healthy{border-color:var(--success);background:var(--success-light)}' +
'.result-card.unhealthy{border-color:var(--danger);background:var(--danger-light)}' +
'.result-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}' +
'.result-status{font-size:15px;font-weight:600;}' +
'.result-status.healthy{color:var(--success)}.result-status.unhealthy{color:var(--danger)}' +
'.result-latency{font-size:13px;font-weight:500;color:var(--text-secondary);}' +
'.result-meta{font-size:12px;color:var(--text-secondary);}' +
'.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px;}' +
'@media(max-width:700px){.two-col{grid-template-columns:1fr}}' +
'.info-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);}' +
'.info-title{font-size:14px;font-weight:500;margin-bottom:14px;}' +
'.info-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;}' +
'.info-row:last-child{border-bottom:none}.info-key{color:var(--text-secondary)}.info-val{font-weight:500;font-family:"SF Mono",monospace;font-size:12px;}' +
'.endpoint-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;}' +
'.endpoint-row:last-child{border-bottom:none}' +
'.method-badge{font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:var(--accent-light);color:var(--accent);font-family:monospace;flex-shrink:0;}' +
'.endpoint-path{font-family:"SF Mono",monospace;font-size:12px;font-weight:500;flex-shrink:0;min-width:90px;}' +
'.endpoint-desc{color:var(--text-secondary);font-size:12px;}' +
'.refresh-bar{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:8px 14px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-md);}' +
'.refresh-dot{width:6px;height:6px;border-radius:50%;background:var(--success);}' +
'@keyframes spin-pulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.8);opacity:0.5}100%{transform:scale(1);opacity:1}}' +
'.refresh-dot.spinning{animation:spin-pulse 0.6s ease-in-out;}' +
'</style>' +
'</head>' +
'<body>' +
'<header class="header">' +
'<div class="header-left">' +
'<div class="logo">&#11042;</div>' +
'<div><div class="app-name">Uptime Guardian</div><div class="app-tagline">Monitoring your infrastructure, so you can sleep at night</div></div>' +
'</div>' +
'<div class="status-badge"><div class="status-dot"></div><span id="header-status">All systems operational</span></div>' +
'</header>' +
'<main class="main">' +
'<div class="section-title">Live metrics</div>' +
'<div class="metrics-grid">' +
'<div class="metric-card"><div class="metric-label"><div class="metric-icon" style="background:#eef2ff;color:#6366f1">&#9201;</div>Uptime</div><div class="metric-value" id="uptime-human">&#8212;</div><div class="metric-sub" id="uptime-seconds">&#8212;</div></div>' +
'<div class="metric-card"><div class="metric-label"><div class="metric-icon" style="background:#d1fae5;color:#10b981">&#9670;</div>Version</div><div class="metric-value" style="font-size:16px;padding-top:6px" id="version">&#8212;</div><div class="metric-sub" id="environment">&#8212;</div></div>' +
'<div class="metric-card"><div class="metric-label"><div class="metric-icon" style="background:#fef3c7;color:#f59e0b">&#11042;</div>CPUs</div><div class="metric-value" id="cpus">&#8212;</div><div class="metric-sub" id="platform">&#8212;</div></div>' +
'<div class="metric-card"><div class="metric-label"><div class="metric-icon" style="background:#ede9fe;color:#8b5cf6">&#9677;</div>Memory used</div><div class="metric-value" id="mem-used-percent">&#8212;</div><div class="metric-sub" id="mem-detail">&#8212;</div></div>' +
'</div>' +
'<div class="gauge-card"><div class="gauge-header"><span class="gauge-title">Memory pressure</span><span class="gauge-value" id="gauge-val">&#8212;%</span></div><div class="gauge-track"><div class="gauge-fill" id="gauge-fill" style="width:0%"></div></div><div class="gauge-labels"><span>0%</span><span>Normal &lt; 80%</span><span>Critical &gt; 95%</span><span>100%</span></div></div>' +
'<div class="checker-card">' +
'<div class="checker-title">Endpoint health checker</div>' +
'<div class="checker-desc">Enter any URL to check if it is reachable and measure response latency.</div>' +
'<div class="checker-input-row">' +
'<input class="checker-input" id="check-url" type="url" placeholder="https://api.github.com" />' +
'<button class="checker-btn" id="check-btn" onclick="checkEndpoint()">Check endpoint</button>' +
'</div>' +
'<div class="result-card" id="result-card"><div class="result-header"><span class="result-status" id="result-status"></span><span class="result-latency" id="result-latency"></span></div><div class="result-meta" id="result-meta"></div></div>' +
'</div>' +
'<div class="two-col">' +
'<div class="info-card"><div class="info-title">System info</div>' +
'<div class="info-row"><span class="info-key">Service</span><span class="info-val">uptime-guardian</span></div>' +
'<div class="info-row"><span class="info-key">Status</span><span class="info-val" id="sys-status">&#8212;</span></div>' +
'<div class="info-row"><span class="info-key">Platform</span><span class="info-val" id="sys-platform">&#8212;</span></div>' +
'<div class="info-row"><span class="info-key">Last updated</span><span class="info-val" id="sys-timestamp">&#8212;</span></div>' +
'<div class="info-row"><span class="info-key">Total memory</span><span class="info-val" id="sys-total-mem">&#8212;</span></div>' +
'<div class="info-row"><span class="info-key">Free memory</span><span class="info-val" id="sys-free-mem">&#8212;</span></div>' +
'</div>' +
'<div class="info-card"><div class="info-title">Available endpoints</div><div id="endpoints-list"></div></div>' +
'</div>' +
'</main>' +
'<div class="refresh-bar"><div class="refresh-dot" id="refresh-dot"></div><span id="refresh-label">Refreshing in 3s</span></div>' +
'<script>' +
'var countdown=3;' +
'async function fetchMetrics(){' +
'try{' +
'var res=await fetch("/");' +
'var data=await res.json();' +
'document.getElementById("header-status").textContent=data.status==="operational"?"All systems operational":"Degraded";' +
'document.getElementById("uptime-human").textContent=data.uptime.human;' +
'document.getElementById("uptime-seconds").textContent=data.uptime.seconds.toLocaleString()+" seconds total";' +
'var ver=data.version;' +
'document.getElementById("version").textContent=ver.length>12?ver.slice(0,8)+"...":ver;' +
'document.getElementById("environment").textContent=data.environment;' +
'var mem=data.system.memory;' +
'document.getElementById("cpus").textContent=data.system.cpus;' +
'document.getElementById("platform").textContent=data.system.platform;' +
'document.getElementById("mem-used-percent").textContent=mem.used_percent+"%";' +
'document.getElementById("mem-detail").textContent=mem.free_mb+" MB free of "+mem.total_mb+" MB";' +
'var pct=mem.used_percent;' +
'var fill=document.getElementById("gauge-fill");' +
'fill.style.width=pct+"%";' +
'fill.style.background=pct>95?"#ef4444":pct>80?"#f59e0b":"#10b981";' +
'document.getElementById("gauge-val").textContent=pct+"%";' +
'document.getElementById("sys-status").textContent=data.status;' +
'document.getElementById("sys-platform").textContent=data.system.platform;' +
'document.getElementById("sys-timestamp").textContent=new Date(data.timestamp).toLocaleTimeString();' +
'document.getElementById("sys-total-mem").textContent=mem.total_mb+" MB";' +
'document.getElementById("sys-free-mem").textContent=mem.free_mb+" MB";' +
'var list=document.getElementById("endpoints-list");' +
'list.innerHTML=data.endpoints.map(function(e){return "<div class=\'endpoint-row\'><span class=\'method-badge\'>"+e.method+"</span><span class=\'endpoint-path\'>"+e.path+"</span><span class=\'endpoint-desc\'>"+e.description+"</span></div>";}).join("");' +
'var dot=document.getElementById("refresh-dot");' +
'dot.classList.add("spinning");' +
'setTimeout(function(){dot.classList.remove("spinning");},600);' +
'}catch(e){console.error("Failed to fetch metrics",e);}' +
'}' +
'async function checkEndpoint(){' +
'var url=document.getElementById("check-url").value.trim();' +
'if(!url)return;' +
'var btn=document.getElementById("check-btn");' +
'btn.disabled=true;btn.textContent="Checking...";' +
'try{' +
'var res=await fetch("/api/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url})});' +
'var data=await res.json();' +
'var card=document.getElementById("result-card");' +
'var statusEl=document.getElementById("result-status");' +
'var latencyEl=document.getElementById("result-latency");' +
'var metaEl=document.getElementById("result-meta");' +
'card.className="result-card visible "+(data.healthy?"healthy":"unhealthy");' +
'statusEl.className="result-status "+(data.healthy?"healthy":"unhealthy");' +
'statusEl.textContent=data.healthy?"&#10003; "+url+" is reachable":"&#10007; "+url+" is unreachable";' +
'latencyEl.textContent=data.latency_ms+"ms";' +
'metaEl.textContent=data.error?"Error: "+data.error:"HTTP "+data.status+" · Checked at "+new Date(data.checked_at).toLocaleTimeString();' +
'}catch(e){console.error(e);}' +
'btn.disabled=false;btn.textContent="Check endpoint";' +
'}' +
'document.addEventListener("DOMContentLoaded",function(){' +
'document.getElementById("check-url").addEventListener("keydown",function(e){if(e.key==="Enter")checkEndpoint();});' +
'});' +
'setInterval(function(){' +
'countdown--;' +
'if(countdown<=0){fetchMetrics();countdown=3;}' +
'document.getElementById("refresh-label").textContent="Refreshing in "+countdown+"s";' +
'},1000);' +
'fetchMetrics();' +
'<\/script>' +
'</body></html>'
}

function formatUptime(seconds) {
  var d = Math.floor(seconds / 86400)
  var h = Math.floor((seconds % 86400) / 3600)
  var m = Math.floor((seconds % 3600) / 60)
  var s = Math.floor(seconds % 60)
  return d + 'd ' + h + 'h ' + m + 'm ' + s + 's'
}

app.listen(3000, () => {
  console.log('[uptime-guardian] Running on port 3000')
  console.log('[uptime-guardian] ENV: ' + (process.env.NODE_ENV || 'development'))
  console.log('[uptime-guardian] Dashboard: http://localhost:3000/dashboard')
})
