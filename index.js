const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Vec3 } = require('vec3');

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

  bot.on('kicked', (reason) => {
    const cleanReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
    console.log(`Bot was kicked: ${cleanReason}`);
    connectionError = `Kicked: ${cleanReason}`;
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
    if (botStatus !== 'Connected' || !bot.entity || bot.isSleeping || isTransitioningSleep) return;

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

// Helper to check if a block is solid
function isSolid(block) {
  return block && block.boundingBox === 'block' && block.name !== 'air';
}

// Helper to check if a block is replaceable (e.g. air, grass)
function isReplaceable(block) {
  if (!block) return true;
  if (block.name === 'air' || block.name.includes('air') || block.name === 'void_air' || block.name === 'cave_air') return true;
  const replaceable = ['tall_grass', 'short_grass', 'grass', 'fern', 'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'sunflower', 'lilac', 'rose_bush', 'peony', 'snow', 'sweet_berry_bush'];
  return replaceable.includes(block.name);
}

// Auto-sleep behavior at night
let autoSleepInterval;
let placedBedPosition = null;
let isTransitioningSleep = false;

// Scan surrounding area for a valid dry land block (up to 15 blocks away)
function findDryLand() {
  const base = bot.entity.position.floored();
  let closestLand = null;
  let minDistance = Infinity;

  // Search in a 15x15 horizontal area, from 3 blocks below to 3 blocks above
  for (let dx = -15; dx <= 15; dx++) {
    for (let dz = -15; dz <= 15; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        const floorPos = base.offset(dx, dy, dz);
        const floorBlock = bot.blockAt(floorPos);
        if (!isSolid(floorBlock) || floorBlock.name === 'water' || floorBlock.name === 'flowing_water' || floorBlock.name === 'lava') continue;

        const bodyPos = floorPos.offset(0, 1, 0);
        const headPos = floorPos.offset(0, 2, 0);
        const bodyBlock = bot.blockAt(bodyPos);
        const headBlock = bot.blockAt(headPos);

        if (bodyBlock && bodyBlock.name !== 'water' && bodyBlock.name !== 'flowing_water' && isReplaceable(bodyBlock) &&
            headBlock && headBlock.name !== 'water' && headBlock.name !== 'flowing_water' && isReplaceable(headBlock)) {
          
          const dist = bot.entity.position.distanceTo(floorPos.offset(0.5, 1, 0.5));
          if (dist < minDistance) {
            minDistance = dist;
            closestLand = floorPos.offset(0.5, 1, 0.5); // center of block above floor
          }
        }
      }
    }
  }
  return closestLand;
}

// Swim straight up until we reach the surface
async function swimToSurface() {
  console.log('Bot is underwater. Swimming to the surface...');
  bot.setControlState('jump', true);
  
  let attempts = 0;
  while (attempts < 40) { // Max 20 seconds (40 * 500ms)
    const headBlock = bot.blockAt(bot.entity.position.offset(0, 1.6, 0));
    if (headBlock && (headBlock.name === 'air' || headBlock.name === 'cave_air' || headBlock.name === 'void_air')) {
      console.log('Reached the water surface!');
      bot.setControlState('jump', false);
      await new Promise(resolve => setTimeout(resolve, 500)); // Let physics settle
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }
  
  bot.setControlState('jump', false);
  console.log('Failed to reach surface or timed out.');
  return false;
}

// Swim or fly to dry land
async function escapeWater() {
  console.log('Bot is in water. Attempting to get to dry land...');
  
  const landPos = findDryLand();
  if (!landPos) {
    console.log('No dry land found within 15 blocks.');
    return false;
  }

  console.log(`Found dry land at ${landPos}. Moving there...`);

  // 1. Try Creative Flight (Highly reliable since bot is in Creative Mode)
  if (bot.game.gameMode === 'creative' && bot.creative) {
    try {
      console.log('Initiating creative flight to dry land...');
      await bot.creative.startFlying();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Fly up 3 blocks first to clear water
      const upPos = bot.entity.position.offset(0, 3, 0);
      await bot.creative.flyTo(upPos);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Fly to the land target (slightly above the floor)
      const targetPos = new Vec3(landPos.x, landPos.y + 0.5, landPos.z);
      await bot.creative.flyTo(targetPos);
      await new Promise(resolve => setTimeout(resolve, 300));

      await bot.creative.stopFlying();
      console.log('Successfully flew and landed on dry land!');
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch (err) {
      console.warn('Creative flight failed, falling back to swimming:', err.message);
    }
  }

  // 2. Fallback: Swim to dry land (Survival mode)
  let attempts = 0;
  while (attempts < 20) { // Max 10 seconds (20 * 500ms)
    const block = bot.blockAt(bot.entity.position);
    const inWater = bot.entity.isInWater || (block && (block.name === 'water' || block.name === 'flowing_water'));
    if (!inWater) {
      console.log('Bot successfully swam to dry land!');
      bot.setControlState('forward', false);
      bot.setControlState('jump', false);
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    }

    const currentLandPos = findDryLand();
    if (currentLandPos) {
      const dx = currentLandPos.x - bot.entity.position.x;
      const dz = currentLandPos.z - bot.entity.position.z;
      const yaw = Math.atan2(-dx, -dz);
      
      await bot.look(yaw, 0, true);
      bot.setControlState('forward', true);
      // Toggle jump to climb block edges
      bot.setControlState('jump', attempts % 2 === 0);
    } else {
      bot.setControlState('forward', true);
      bot.setControlState('jump', true);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  bot.setControlState('forward', false);
  bot.setControlState('jump', false);
  console.log('Timed out trying to swim to dry land.');
  return false;
}

// Scan surrounding area for a valid bed placement site (excluding directly under bot feet, checking adjacent heights)
function findBedPlacement() {
  const basePos = bot.entity.position.floored().offset(0, -1, 0);
  const searchOffsets = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
    { dx: 1, dz: 1 },
    { dx: -1, dz: 1 },
    { dx: 1, dz: -1 },
    { dx: -1, dz: -1 }
  ];

  const directions = [
    { dir: new Vec3(0, 0, -1), yaw: Math.PI },       // North
    { dir: new Vec3(0, 0, 1), yaw: 0 },              // South
    { dir: new Vec3(1, 0, 0), yaw: -Math.PI / 2 },    // East
    { dir: new Vec3(-1, 0, 0), yaw: Math.PI / 2 }     // West
  ];

  // Try same level, 1 block higher, then 1 block lower
  for (const dy of [0, 1, -1]) {
    for (const offset of searchOffsets) {
      const floorPos = basePos.offset(offset.dx, dy, offset.dz);
      const floorBlock = bot.blockAt(floorPos);
      if (!isSolid(floorBlock) || floorBlock.name === 'water' || floorBlock.name === 'flowing_water') continue;

      const footSpace = bot.blockAt(floorPos.offset(0, 1, 0));
      const footSpaceAbove = bot.blockAt(floorPos.offset(0, 2, 0));
      if (!isReplaceable(footSpace) || !isReplaceable(footSpaceAbove)) continue;

      for (const d of directions) {
        const headFloorPos = floorPos.plus(d.dir);
        const headFloorBlock = bot.blockAt(headFloorPos);
        if (!isSolid(headFloorBlock) || headFloorBlock.name === 'water' || headFloorBlock.name === 'flowing_water') continue;

        const headSpace = bot.blockAt(headFloorPos.offset(0, 1, 0));
        const headSpaceAbove = bot.blockAt(headFloorPos.offset(0, 2, 0));
        if (!isReplaceable(headSpace) || !isReplaceable(headSpaceAbove)) continue;

        return {
          referenceBlock: floorBlock,
          yaw: d.yaw,
          direction: d.dir
        };
      }
    }
  }
  return null;
}

function startAutoSleep() {
  if (autoSleepInterval) clearInterval(autoSleepInterval);

  autoSleepInterval = setInterval(async () => {
    if (botStatus !== 'Connected' || !bot.entity) return;
    if (!bot.time) return; // Make sure time object is loaded

    const timeOfDay = bot.time.timeOfDay;
    const isNight = timeOfDay >= 12541 && timeOfDay <= 23458;

    if (isNight && !bot.isSleeping && !isTransitioningSleep) {
      isTransitioningSleep = true;
      try {
        // Check if the bot is in water
        const currentBlock = bot.blockAt(bot.entity.position);
        const inWater = bot.entity.isInWater || (currentBlock && (currentBlock.name === 'water' || currentBlock.name === 'flowing_water'));
        if (inWater) {
          if (bot.game.gameMode === 'creative') {
            console.log('Bot is in water and in Creative Mode. Relocating directly to dry land...');
            const landPos = findDryLand();
            if (landPos) {
              bot.entity.position = new Vec3(landPos.x, landPos.y + 0.5, landPos.z);
              await new Promise(resolve => setTimeout(resolve, 500)); // wait for position to sync
            }
          } else {
            // Survival mode: swim up to surface, then swim to land
            await swimToSurface();
            await escapeWater();
          }
        }

        // 1. Try to find an existing bed within 5 blocks
        let bedBlock = bot.findBlock({
          matching: (block) => bot.isABed(block),
          maxDistance: 5
        });

        // 2. If no bed is found, place one
        if (!bedBlock) {
          console.log('No bed found nearby. Attempting to place one...');
          const mcData = bot.registry;
          const Item = require('prismarine-item')(bot.registry);

          // Find if we have a bed in inventory
          let bedItem = bot.inventory.items().find(item => item.name.includes('bed'));
          if (!bedItem) {
            if (bot.game.gameMode === 'creative') {
              console.log('No bed in inventory. Manifesting one in creative mode...');
              const redBedId = mcData.itemsByName['red_bed'].id;
              // Set hotbar slot 0 (index 36) to a Red Bed
              await bot.creative.setInventorySlot(36, new Item(redBedId, 1));
              await new Promise(resolve => setTimeout(resolve, 500));
              bedItem = bot.inventory.items().find(item => item.name === 'red_bed');
            } else {
              throw new Error('No bed found in inventory (and not in creative mode).');
            }
          }

          if (!bedItem) {
            throw new Error('Could not obtain bed item.');
          }

          // Equip the bed item
          await bot.equip(bedItem, 'hand');
          await new Promise(resolve => setTimeout(resolve, 200));

          // Find a valid placement spot
          const placement = findBedPlacement();
          if (!placement) {
            throw new Error('No suitable solid ground or clear space to place bed.');
          }

          console.log(`Found bed placement block at ${placement.referenceBlock.position}. Facing yaw: ${placement.yaw}`);
          
          // Face the correct direction for placement (so the bed head goes the right way)
          await bot.look(placement.yaw, -Math.PI / 4, true);
          await new Promise(resolve => setTimeout(resolve, 300));

          // Place the bed on top of reference block
          await bot.placeBlock(placement.referenceBlock, new Vec3(0, 1, 0));
          await new Promise(resolve => setTimeout(resolve, 500));

          // Find the newly placed bed
          bedBlock = bot.findBlock({
            matching: (block) => bot.isABed(block),
            maxDistance: 4
          });

          if (bedBlock) {
            placedBedPosition = bedBlock.position;
            console.log(`Successfully placed bed at ${placedBedPosition}`);
          } else {
            throw new Error('Placed bed block but could not locate it in world.');
          }
        }

        // 3. Sleep in the bed
        if (bedBlock) {
          console.log('Attempting to sleep in bed...');
          await bot.sleep(bedBlock);
          console.log('Bot is now sleeping in bed.');
        }
      } catch (err) {
        console.warn('Auto-sleep attempt failed:', err.message);
      } finally {
        isTransitioningSleep = false;
      }
    } else if (!isNight && (bot.isSleeping || placedBedPosition)) {
      // Morning has arrived! Wake up and break the placed bed
      try {
        if (bot.isSleeping) {
          console.log('Morning arrived. Waking up...');
          await bot.wake();
          console.log('Bot woke up.');
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (placedBedPosition) {
          const bedBlock = bot.blockAt(placedBedPosition);
          if (bedBlock && bot.isABed(bedBlock)) {
            console.log('Attempting to break the placed bed...');
            await bot.lookAt(bedBlock.position.offset(0.5, 0.5, 0.5));
            await bot.dig(bedBlock);
            console.log('Broke the placed bed.');
          }
          placedBedPosition = null;
        }
      } catch (err) {
        console.warn('Failed to wake up or break bed:', err.message);
      }
    }
  }, 10000); // Check every 10 seconds
}

// Initialize mineflayer bot
createBot();

// Web Server for Status Dashboard & Ping Keep-Alive
const app = express();
const port = process.env.PORT || 7860;

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
