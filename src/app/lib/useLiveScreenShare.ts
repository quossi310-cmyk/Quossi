"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseLiveOpts = {
  fps?: number;                 // e.g., 1 -> 1 frame/sec to Grok
  prompt?: string;              // instruction for Grok (tone, advice, etc.)
  onAdvice?: (text: string) => void; // called when Grok replies
  crop?: { x: number; y: number; w: number; h: number } | null; // optional crop
  jpegQuality?: number;         // 0..1
};

export function useLiveScreenShare(opts: UseLiveOpts = {}) {
  const fps = opts.fps ?? 1;
  const prompt = opts.prompt ?? "From this trading screen, explain status, risk, and give actionable advice.";
  const quality = opts.jpegQuality ?? 0.7;

  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAdvice, setLastAdvice] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) el.srcObject = streamRef.current;
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: "monitor", cursor: "always" } as any,
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      if (videoRef.current) videoRef.current.srcObject = stream;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      // start loop
      const loop = (t: number) => {
        if (!streamRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;
        if (v && c && v.videoWidth && v.videoHeight) {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(v, 0, 0, c.width, c.height);

          // Optional crop
          let dataUrl: string;
          if (opts.crop) {
            const { x, y, w, h } = opts.crop;
            const off = document.createElement("canvas");
            off.width = w; off.height = h;
            const octx = off.getContext("2d")!;
            octx.drawImage(c, x, y, w, h, 0, 0, w, h);
            dataUrl = off.toDataURL("image/jpeg", quality);
          } else {
            dataUrl = c.toDataURL("image/jpeg", quality);
          }

          // throttle by fps
          const now = performance.now();
          if (now - lastSentRef.current >= 1000 / fps && !busy) {
            lastSentRef.current = now;
            setBusy(true);
            abortRef.current?.abort();
            abortRef.current = new AbortController();
            fetch("/api/grok/vision/analyze-frame", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt,
                image_b64: dataUrl.split(",")[1],
              }),
              signal: abortRef.current.signal,
            })
              .then(r => r.json())
              .then(j => {
                // Try Grok chat style shape; fallback generic
                const msg =
                  j?.choices?.[0]?.message?.content ??
                  j?.output_text ??
                  j?.content ??
                  JSON.stringify(j);
                setLastAdvice(msg);
                opts.onAdvice?.(msg);
              })
              .catch((e) => {
                if (e?.name !== "AbortError") setError("Analysis error");
              })
              .finally(() => setBusy(false));
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e: any) {
      setError(e?.message || "Screen share denied");
      setActive(false);
      streamRef.current = null;
    }
  }, [fps, prompt, quality, opts.crop, opts.onAdvice, busy]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    active,
    busy,
    error,
    lastAdvice,
    attachVideo,
    start,
    stop,
  };
}
