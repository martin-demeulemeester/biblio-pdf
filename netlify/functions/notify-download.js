exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Webhook non configure' }) };
  }

  try {
    const { title, pseudo, country, city } = JSON.parse(event.body || '{}');

    const lieu = [city, country].filter(Boolean).join(', ');
    const fields = [
      { name: 'Document', value: title || 'Inconnu', inline: false },
      { name: 'Visiteur', value: pseudo || 'Anonyme', inline: true },
    ];
    if (lieu) fields.push({ name: 'Localisation', value: lieu, inline: true });

    const payload = {
      username: 'Biblio PDF',
      embeds: [{
        title: 'Nouveau telechargement',
        color: 0xf0b429,
        fields,
        timestamp: new Date().toISOString(),
      }],
    };

    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Discord a refuse' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
