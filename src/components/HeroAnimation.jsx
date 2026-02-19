"use client";

import Lottie from "lottie-react";
import animationData from "@/animations/hero.json";

export default function HeroAnimation() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Lottie
        animationData={animationData}
        loop={true}
        className="w-[320px] md:w-[400px]"
      />
    </div>
  );
}
