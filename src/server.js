const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.send('Uptime Guardian is alive')
})

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
