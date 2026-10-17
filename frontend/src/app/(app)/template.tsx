"use client";

import { motion } from "motion/react";

/**
 * Each screen eases in on navigation (a template re-mounts per route): a short rise and fade that says "new
 * page" without delaying it. MotionConfig in Providers turns the movement off under prefers-reduced-motion.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
