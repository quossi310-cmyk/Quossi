// app/hooks/useRealtimeVoice.ts
"use client";

import { useRef, useState } from "react";

export function useRealtimeVoice() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(false);

  async function start(sessionCtx?: { userId?: string; qScore?: number; tier?: string; voice?: string }) {
    if (active) return;
    setActive(true);

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioElRef.current = audioEl;

    pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);

    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach((t) => pc.addTrack(t, mic));

    pc.createDataChannel("oai-events");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // No instructions here — server will inject buildSystemPrompt()
    const session = await fetch("/api/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionCtx ?? {}),
    }).then((r) => r.json());

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = session?.model ?? "gpt-4o-realtime-preview";

    const sdpAnswer = await fetch(`${baseUrl}?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.client_secret?.value}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    }).then((r) => r.text());

    await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
  }

  async function stop() {
    setActive(false);
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    if (audioElRef.current) audioElRef.current.srcObject = null;
  }

  return { start, stop, active };
}
