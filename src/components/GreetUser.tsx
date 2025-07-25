'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'

export default function GreetUser() {
  const [greeting, setGreeting] = useState<string | null>(null)
  const [isGuest, setIsGuest] = useState<boolean>(false)
  useEffect(() => {
    async function fetchGreeting() {
      const supabase = createClient()

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError || !session?.user) {
        setGreeting('Hey Guest! sign in to unlock full access and save your workflows.')
        setIsGuest(true)
        return
      }

      const userId = session.user.id

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single()

      if (profileError || !profile?.full_name) {
        setGreeting('Hey Guest! sign in to unlock full access and save your workflows.')
        setIsGuest(true)
        return
      }

      const firstName = profile.full_name.split(' ')[0] ?? 'Guest'
      setGreeting(`Welcome Back, ${firstName}👋`)
      setIsGuest(false)
    }

    fetchGreeting()
  }, [])

  return (
    <AnimatePresence>
      {greeting && (
        <motion.h2
          key="greeting"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={"font-semibold text-white mb-4 text-center text-xl" + (isGuest ? "text-gray-400" : "text-blue-200") }
        >
          {greeting}
        </motion.h2>
      )}
    </AnimatePresence>
  )
}