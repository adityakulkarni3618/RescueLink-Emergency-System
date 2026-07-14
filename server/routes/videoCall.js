const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');

const DAILY_API_KEY = process.env.DAILY_API_KEY || 'mock_daily_api_key';

/**
 * Creates a new Daily.co video room for a mission.
 * Falls back to a simulated mock room if DAILY_API_KEY is not configured.
 */
router.post('/create-room', verifyToken(), async (req, res) => {
  const { reqId } = req.body;
  
  if (DAILY_API_KEY === 'mock_daily_api_key') {
    const mockRoomUrl = `https://mock-domain.daily.co/mock-${reqId || Date.now()}`;
    console.log(`[DAILY.CO MOCK] Generated mock room URL: ${mockRoomUrl}`);
    return res.json({ url: mockRoomUrl, name: `mock-${reqId || Date.now()}` });
  }
  
  try {
    const response = await axios.post(
      'https://api.daily.co/v1/rooms',
      {
        properties: {
          enable_chat: true,
          enable_people_ui: true,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.round(Date.now() / 1000) + 3600 // Expire in 1 hour
        }
      },
      {
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`[DAILY.CO] Created room: ${response.data.name}`);
    res.json({ url: response.data.url, name: response.data.name });
  } catch (err) {
    console.error('[DAILY.CO ERROR] Failed to create room:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create video call room', detail: err.message });
  }
});

module.exports = router;
