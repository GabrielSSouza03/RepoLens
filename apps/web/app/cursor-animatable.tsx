"use client";

import { useEffect, useRef } from "react";
import { createAnimatable, utils } from "animejs";

export function CursorAnimatable() {
  const areaRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = areaRef.current;
    const square = squareRef.current;
    if (!area || !square) return;

    let bounds = area.getBoundingClientRect();
    const refreshBounds = () => {
      bounds = area.getBoundingClientRect();
    };

    const animatable = createAnimatable(square, {
      x: 500,
      y: 500,
      ease: "out(3)",
    });

    const onMouseMove = (e: MouseEvent) => {
      const { width, height, left, top } = bounds;
      const hw = width / 2;
      const hh = height / 2;
      const x = utils.clamp(e.clientX - left - hw, -hw, hw);
      const y = utils.clamp(e.clientY - top - hh, -hh, hh);
      animatable.x(x);
      animatable.y(y);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", refreshBounds);
    window.addEventListener("scroll", refreshBounds, true);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", refreshBounds);
      window.removeEventListener("scroll", refreshBounds, true);
      animatable.revert();
    };
  }, []);

  return (
    <div ref={areaRef} className="cursor-animatable" aria-hidden="true">
      <div ref={squareRef} className="cursor-animatable-square" />
    </div>
  );
}
