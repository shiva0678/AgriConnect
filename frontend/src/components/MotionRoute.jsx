import { AnimatePresence, LazyMotion, MotionConfig, m } from "framer-motion";

const loadMotionFeatures = () =>
  import("../motion/features").then((module) => module.default);

function MotionRoute({ children, pathname }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures} strict>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {children}
          </m.div>
        </AnimatePresence>
      </LazyMotion>
    </MotionConfig>
  );
}

export default MotionRoute;
