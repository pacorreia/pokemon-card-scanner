import express from 'express'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json())
app.use(express.static(join(__dirname, 'dist')))

// Exchange GitHub OAuth authorization code for an access token.
// The client_secret is kept server-side and never sent to the browser.
app.post('/api/github/token', async (req, res) => {
  const { code, redirectUri } = req.body

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'missing_code', error_description: 'Authorization code is required' })
  }

  const clientId = process.env.VITE_GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'server_misconfigured', error_description: 'OAuth credentials are not configured' })
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const data = await response.json()

    if (data.error) {
      return res.status(400).json(data)
    }

    return res.json({ access_token: data.access_token })
  } catch {
    return res.status(500).json({ error: 'token_exchange_failed', error_description: 'Failed to exchange code for token' })
  }
})

// SPA fallback — serve index.html for all unmatched routes
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

// eslint-disable-next-line no-undef
const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
