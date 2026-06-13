exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { password } = JSON.parse(event.body || '{}');
    const correct = process.env.ADMIN_PASSWORD;

    if (!correct) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Not configured' }) };
    }

    if (password === correct) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    }

    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false }),
    };
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }
};
