// netlify/functions/sms.js
// Serverless function that forwards SMS via Twilio.
// Credentials are stored as Netlify env vars — never in front-end code.

const https = require('https');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // CORS headers so the PWA can call this from any domain
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { to, body } = JSON.parse(event.body || '{}');

    if (!to || !body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing to or body' }) };
    }

    const accountSid = process.env.TWILIO_SID;
    const authToken  = process.env.TWILIO_TOKEN;
    const fromNumber = process.env.TWILIO_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'Twilio env vars not configured' })
      };
    }

    const payload = new URLSearchParams({
      To:   to,
      From: fromNumber,
      Body: body
    }).toString();

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.twilio.com',
        path:     `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        method:   'POST',
        headers: {
          'Authorization':  `Basic ${auth}`,
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    if (result.status >= 200 && result.status < 300) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } else {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: `Twilio error ${result.status}`, detail: result.body })
      };
    }

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
