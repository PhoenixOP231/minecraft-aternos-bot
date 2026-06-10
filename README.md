# Aternos Minecraft Keep-Alive Bot

This is a Minecraft bot designed to keep an Aternos (or other self-hosted/free) Minecraft server online 24/7 by joining the server, performing random undetectable movements to bypass AFK-kicks, and serving a dashboard page that can be pinged by hosting services like Railway.app to prevent cold-starts.

## File Structure

- [index.js](file:///C:/Users/parth/.gemini/antigravity/scratch/minecraft-bot/index.js) — The main application containing the web dashboard server and Mineflayer bot configuration.
- [settings.json](file:///C:/Users/parth/.gemini/antigravity/scratch/minecraft-bot/settings.json) — Configuration file for setting the server IP and username.
- [package.json](file:///C:/Users/parth/.gemini/antigravity/scratch/minecraft-bot/package.json) — Node.js dependencies and run script.

## Local Setup

1. Open a terminal inside `C:/Users/parth/.gemini/antigravity/scratch/minecraft-bot`.
2. Run `npm install` to install dependencies.
3. Configure your server IP and Port inside `settings.json`.
4. Run the bot locally:
   ```bash
   npm start
   ```
5. View the dashboard at `http://localhost:3000`.

## Deploying to Railway

1. Push this folder to a GitHub Repository.
2. Log in to [Railway.app](https://railway.app).
3. Create a **New Project** and select **Deploy from GitHub repo**.
4. Select the repository containing these files.
5. In your Railway service settings, make sure to add a **Custom Domain** or **Generate Domain** under the networking section. This exposes port `3000` (via the environment variable `PORT` that Railway automatically sets).
6. To prevent Railway from turning off the app due to inactivity on a hobby plan, you can set up a free service like [UptimeRobot](https://uptimerobot.com) to ping your Railway dashboard URL (e.g., `https://your-bot.up.railway.app`) every 5 minutes.
