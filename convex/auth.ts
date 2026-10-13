import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      const rawUsername = params.username
      if (typeof rawUsername !== 'string') throw new Error('Username is required.')
      const username = rawUsername.trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
        throw new Error('Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.')
      }
      if (params.flow === 'signUp') {
        const name = typeof params.name === 'string' ? params.name.trim() : ''
        if (!name || name.length > 100) throw new Error('Name is required and must be 100 characters or fewer.')
        if (params.password !== params.confirmPassword) throw new Error('Passwords do not match.')
        // Password's account key is named `email`; use a non-deliverable reserved
        // address derived from username because this app does not collect email.
        return { email: `${username}@users.invalid`, username, name }
      }
      return { email: `${username}@users.invalid`, username, name: username }
    },
  })],
})
