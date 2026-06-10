const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Read settings
let settings = {
  ip: 'your-server-ip.aternos.me',
  port: 25565,
  username: 'Aternos_KeepAlive_Bot'
};

const settingsPath = path.join(__dirname, 'settings.json');
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse settings.json, using defaults:', err);
  }
}

let bot;
let botStatus = 'Disconnected';
let connectionError = null;
const startTime = Date.now();

function createBot() {
  console.log(`Connecting to ${settings.ip}:${settings.port} as ${settings.username} (Version: ${settings.version || 'Auto-Detect'})...`);
  botStatus = 'Connecting...';
  connectionError = null;

  const botOptions = {
    host: settings.ip,
    port: parseInt(settings.port),
    username: settings.username
  };

  if (settings.version) {
    botOptions.version = settings.version;
  }

  bot = mineflayer.createBot(botOptions);

  bot.on('spawn', () => {
    botStatus = 'Connected';
    console.log('Bot successfully spawned in the game!');
    startAntiAFK();
    startAutoSleep();
  });

  bot.on('death', () => {
    console.log('Bot died! Auto-respawning...');
    bot.respawn();
  });

  bot.on('end', (reason) => {
    botStatus = 'Disconnected';
    console.log(`Bot disconnected: ${reason}. Reconnecting in 15 seconds...`);
    if (antiAFKInterval) clearInterval(antiAFKInterval);
    if (autoSleepInterval) clearInterval(autoSleepInterval);
    setTimeout(createBot, 15000);
  });

  bot.on('error', (err) => {
    console.error('Bot error:', err);
    connectionError = err.message;
  });
}

// Anti-AFK behavior (random movements/looking)
let antiAFKInterval;
function startAntiAFK() {
  if (antiAFKInterval) clearInterval(antiAFKInterval);

  antiAFKInterval = setInterval(() => {
    if (botStatus !== 'Connected' || !bot.entity || bot.isSleeping) return;

    // Random action selection
    const action = Math.random();

    if (action < 0.4) {
      // 1. Move random direction
      const dirs = ['forward', 'back', 'left', 'right'];
      const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
      
      bot.setControlState(randomDir, true);
      setTimeout(() => {
        bot.setControlState(randomDir, false);
      }, 500 + Math.random() * 1000); // Walk for 0.5 - 1.5s
      
    } else if (action < 0.7) {
      // 2. Look around randomly
      const yaw = (Math.random() - 0.5) * 2 * Math.PI;
      const pitch = (Math.random() - 0.5) * Math.PI / 2;
      bot.look(yaw, pitch, false);
      
    } else {
      // 3. Jump
      bot.setControlState('jump', true);
      setTimeout(() => {
        bot.setControlState('jump', false);
      }, 200);
    }
  }, 10000 + Math.random() * 10000); // Perform random actions every 10-20 seconds
}

// Auto-sleep behavior at night
let autoSleepInterval;
function startAutoSleep() {
  if (autoSleepInterval) clearInterval(autoSleepInterval);

  autoSleepInterval = setInterval(async () => {
    if (botStatus !== 'Connected' || !bot.entity) return;
    if (!bot.time) return; // Make sure time object is loaded

    const timeOfDay = bot.time.timeOfDay;
    const isNight = timeOfDay >= 12541 && timeOfDay <= 23458;

    if (isNight && !bot.isSleeping) {
      // Find a bed within 5 blocks
      const bedBlock = bot.findBlock({
        matching: (block) => bot.isABed(block),
        maxDistance: 5
      });

      if (bedBlock) {
        try {
          await bot.sleep(bedBlock);
          console.log('Bot is now sleeping in bed.');
        } catch (err) {
          console.warn('Failed to sleep:', err.message);
        }
      }
    } else if (!isNight && bot.isSleeping) {
      try {
        await bot.wake();
        console.log('Bot woke up.');
      } catch (err) {
        console.warn('Failed to wake up:', err.message);
      }
    }
  }, 10000); // Check every 10 seconds
}

// Initialize mineflayer bot
createBot();

// Web Server for Status Dashboard & Ping Keep-Alive
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

  let botPosition = 'N/A';
  if (bot && bot.entity && bot.entity.position) {
    const { x, y, z } = bot.entity.position;
    botPosition = `X: ${x.toFixed(1)}, Y: ${y.toFixed(1)}, Z: ${z.toFixed(1)}`;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Minecraft Keep-Alive Bot Dashboard</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #0e1117;
          color: #c9d1d9;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background-color: #161b22;
          border: 1px solid #30363d;
          border-radius: 12px;
          padding: 30px;
          width: 400px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        h1 {
          color: #58a6ff;
          margin-bottom: 25px;
          font-size: 1.8rem;
        }
        .status-badge {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          font-size: 0.95rem;
          margin-bottom: 20px;
        }
        .status-connected {
          background-color: rgba(46, 160, 67, 0.15);
          color: #3fb950;
          border: 1px solid rgba(46, 160, 67, 0.4);
        }
        .status-disconnected {
          background-color: rgba(248, 81, 81, 0.15);
          color: #f85149;
          border: 1px solid rgba(248, 81, 81, 0.4);
        }
        .status-connecting {
          background-color: rgba(210, 153, 34, 0.15);
          color: #d29922;
          border: 1px solid rgba(210, 153, 34, 0.4);
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          text-align: left;
          margin-top: 10px;
        }
        .info-label {
          color: #8b949e;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .info-value {
          font-size: 1rem;
          font-weight: 500;
          margin-top: 2px;
        }
        .divider {
          height: 1px;
          background-color: #30363d;
          margin: 20px 0;
        }
        footer {
          margin-top: 25px;
          font-size: 0.75rem;
          color: #8b949e;
        }
      </style>
      <script>
        // Auto-refresh the dashboard status every 10 seconds
        setInterval(() => {
          window.location.reload();
        }, 10000);
      </script>
    </head>
    <body>
      <div class="card">
        <h1>Minecraft Keep-Alive Bot</h1>
        
        <div class="status-badge ${
          botStatus === 'Connected' ? 'status-connected' : 
          botStatus === 'Connecting...' ? 'status-connecting' : 'status-disconnected'
        }">
          ${botStatus}
        </div>

        <div class="info-grid">
          <div>
            <div class="info-label">Server IP</div>
            <div class="info-value">${settings.ip}</div>
          </div>
          <div>
            <div class="info-label">Server Port</div>
            <div class="info-value">${settings.port}</div>
          </div>
          <div>
            <div class="info-label">Bot Username</div>
            <div class="info-value">${settings.username}</div>
          </div>
          <div>
            <div class="info-label">Dashboard Uptime</div>
            <div class="info-value">${uptimeString}</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="info-grid" style="grid-template-columns: 1fr;">
          <div>
            <div class="info-label">In-Game Coordinates</div>
            <div class="info-value">${botPosition}</div>
          </div>
          ${connectionError ? `
          <div style="margin-top: 10px;">
            <div class="info-label" style="color: #f85149;">Connection Error</div>
            <div class="info-value" style="color: #f85149; font-size: 0.9rem;">${connectionError}</div>
          </div>` : ''}
        </div>

        <footer>
          Auto-refreshing every 10s • Keep-alive dashboard active
        </footer>
      </div>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
