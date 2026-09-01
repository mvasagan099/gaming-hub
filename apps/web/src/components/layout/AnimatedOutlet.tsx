import { useLocation, useOutlet } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';

export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex flex-1 flex-col min-h-0 min-w-0 w-full"
    >
      {outlet}
    </motion.div>
  );
}
