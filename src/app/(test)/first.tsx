"use client";

import { useRouter } from "next/navigation";
import Spline from "@splinetool/react-spline";
import Image from "next/image";

export default function Home() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white font-sans">
      {/* --- Spline animation (DO NOT MODIFY) --- */}
      {/* Keep your existing Spline scene here if it exists */}

      {/* --- Yellow Background Behind Image --- */}
      <div className="absolute inset-0 flex items-center justify-center z-5 bg-yellow-400" />

      {/* --- Background Image --- */}
      <div className="absolute inset-0 flex items-center justify-center z-10 hover-animation">
        <Image
          src="/LG.png"
          alt="Background Logo"
          width={900}
          height={900}
          className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] select-none"
          priority
        />
      </div>

      {/* --- Overlay for depth --- */}
      <div className="absolute inset-0 z-15 bg-gradient-to-b from-transparent via-[#1b144060] to-[#0a0615] pointer-events-none" />

      {/* --- Button Group (Centered and in front of background) --- */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 z-30">
        {/* Sign In Button */}
        <div
          className="relative bubble-bg cursor-pointer"
          onClick={() => router.push("/(tabs)/SignIn")}
        >
          <button className="relative z-10 px-16 py-4 text-lg font-semibold rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:shadow-[0_0_35px_rgba(255,255,255,0.4)] hover:scale-105 transition-all duration-300">
            Sign In
            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-white to-white/70 opacity-0 hover:opacity-60 blur-2xl transition duration-300"
/>
          </button>

          {/* Floating bubbles */}
          {[...Array(6)].map((_, i) => (
            <span
              key={`login-bubble-${i}`}
              style={{
                position: "absolute",
                bottom: "0",
                background: "rgba(255, 255, 255, 0.25)",
                borderRadius: "50%",
                left: `${Math.random() * 100}%`,
                width: `${10 + Math.random() * 18}px`,
                height: `${10 + Math.random() * 18}px`,
                animation: "floatUp 6s ease-in-out infinite",
                animationDelay: `${Math.random() * 3}s`,
              }}
            />
          ))}
        </div>

        {/* Sign Up Button */}
        <div
          className="relative bubble-bg cursor-pointer"
          onClick={() => router.push("/")}
        >
          <button className="relative z-10 px-16 py-4 text-lg font-semibold rounded-full bg-gradient-to-r from-black to-black shadow-[0_0_20px_rgba(0,0,0,0.6)] hover:shadow-[0_0_50px_rgba(0,0,0,0.9)] hover:scale-105 transition-all duration-300"
>
            Sign Up
            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/30 to-purple-400/30 blur-2xl opacity-0 hover:opacity-100 transition duration-500" />
          </button>

          {/* Floating bubbles */}
          {[...Array(6)].map((_, i) => (
            <span
              key={`signup-bubble-${i}`}
              style={{
                position: "absolute",
                bottom: "0",
                background: "rgba(255, 255, 255, 0.25)",
                borderRadius: "50%",
                left: `${Math.random() * 100}%`,
                width: `${10 + Math.random() * 18}px`,
                height: `${10 + Math.random() * 18}px`,
                animation: "floatUp 6s ease-in-out infinite",
                animationDelay: `${Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* --- Keyframes for animation --- */}
      <style jsx global>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(-120px) scale(0.8);
            opacity: 0;
          }
        }
        @keyframes hoverAnimation {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
          100% {
            transform: translateY(0);
          }
        }
        .hover-animation {
          animation: hoverAnimation 3s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
