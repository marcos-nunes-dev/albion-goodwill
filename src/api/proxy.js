const puppeteer = require("puppeteer");
const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

// Cache to store results
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

// Apply rate limiting to all routes
router.use(limiter);

// Function to fetch data with Puppeteer
async function fetchWithPuppeteer(playerName) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // Navigate to the URL
    const url = `https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons?lookback_days=9999`;
    await page.goto(url, { waitUntil: "networkidle0" });

    // Get the response content
    const content = await page.content();

    // Check if we got the Cloudflare challenge
    if (content.includes("challenge-platform")) {
      throw new Error("Cloudflare challenge detected");
    }

    // Get the JSON response
    const response = await page.evaluate(() => {
      const pre = document.querySelector("pre");
      return pre ? pre.textContent : null;
    });

    if (!response) {
      throw new Error("No data found");
    }

    return JSON.parse(response);
  } finally {
    await browser.close();
  }
}

// Proxy endpoint
router.get("/player-stats", async (req, res) => {
  const playerName = req.query.name;

  if (!playerName) {
    return res.status(400).json({ error: "Player name is required" });
  }

  try {
    // Check cache first
    const cachedData = cache.get(playerName);
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      return res.json(cachedData.data);
    }

    // Fetch new data
    const data = await fetchWithPuppeteer(playerName);

    // Cache the result
    cache.set(playerName, {
      data,
      timestamp: Date.now(),
    });

    res.json(data);
  } catch (error) {
    console.error("Error fetching player stats:", error);
    res.status(500).json({
      error: "Failed to fetch player stats",
      details: error.message,
    });
  }
});

module.exports = router;
