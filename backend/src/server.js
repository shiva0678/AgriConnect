import cors from 'cors'
import express from 'express'
import { supabase } from './config/supabase.js'

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/api/health', (request, response) => {
  response.json({
    success: true,
    message: 'AgriConnect API is running',
    databaseConfigured: Boolean(supabase),
  })
})

app.listen(port, () => {
  console.log(`AgriConnect API listening on port ${port}`)
})