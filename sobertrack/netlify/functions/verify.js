// netlify/functions/verify.js
// Proxies video frames to Gemini AI for medication verification.
// The GEMINI_API_KEY env var is set in Netlify dashboard — never exposed to users.

const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'GEMINI_API_KEY not configured on server' })
    };
  }

  let frames;
  try {
    ({ frames } = JSON.parse(event.body || '{}'));
    if (!frames || !frames.length) throw new Error('No frames provided');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message }) };
  }

  const prompt = `You are a medication verification assistant for a Video Observed Therapy app.
Analyze these ${frames.length} frames (sequential stills from a short recording) of a person taking Disulfiram.

Respond with ONLY a single JSON object. No explanation, no markdown, no extra text whatsoever.

Required JSON keys:
- pill_visible: {result:"yes" or "no", confidence: integer 0-100}
- ingestion_shown: {result:"yes" or "no", confidence: integer 0-100}
- mouth_clear: {result:"yes" or "no", confidence: integer 0-100}
- flags: array containing zero or more of: "poor_lighting","face_not_visible","no_pill_detected","possible_pre_recorded","hand_obscuring_mouth"
- overall_pass: boolean — true only if all three results are "yes" and no critical flags present

Example of the ONLY acceptable response:
{"pill_visible":{"result":"yes","confidence":90},"ingestion_shown":{"result":"yes","confidence":85},"mouth_clear":{"result":"yes","confidence":88},"flags":[],"overall_pass":true}`;

  const parts = [
    { text: prompt },
    ...frames.map(b64 => ({
      inline_data: { mime_type: 'image/jpeg', data: b64 }
    }))
  ];

  const requestBody = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json'
    }
  });

  const GEMINI_HOST = 'generativelanguage.googleapis.com';
  const GEMINI_PATH = `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const geminiResult = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: GEMINI_HOST,
        path: GEMINI_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    if (geminiResult.status !== 200) {
      return {
        statusCode: 502, headers,
        body: JSON.stringify({
          error: `Gemini returned ${geminiResult.status}`,
          detail: geminiResult.body.slice(0, 300)
        })
      };
    }

    // Extract text from Gemini response envelope
    const envelope = JSON.parse(geminiResult.body);
    const allParts = envelope.candidates?.[0]?.content?.parts || [];
    const text = allParts.map(p => p.text || '').join('').trim();

    if (!text) {
      return {
        statusCode: 502, headers,
        body: JSON.stringify({ error: 'Empty response from Gemini' })
      };
    }

    // Parse the JSON — try direct, then strip fences, then extract block
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) {
      const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
      try { parsed = JSON.parse(stripped); }
      catch (_) {
        const match = stripped.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error(`Cannot parse Gemini response: ${text.slice(0, 200)}`);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
