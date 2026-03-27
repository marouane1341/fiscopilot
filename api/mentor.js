export default async function handler(req, res) {
  const { prompt, apiKey } = JSON.parse(req.body);
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Tu es un expert-comptable belge ITAA. " + prompt }] }]
    })
  });

  const data = await response.json();
  res.status(200).json(data);
}

