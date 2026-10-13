import { defineApp } from 'convex/server'
import { v } from 'convex/values'

export default defineApp({
  env: {
    ADMIN_BOOTSTRAP_USERNAME: v.optional(v.string()),
    TBA_API_KEY: v.optional(v.string()),
  },
})
