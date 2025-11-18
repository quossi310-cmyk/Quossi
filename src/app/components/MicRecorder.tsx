"use client";
import React, { useRef, useState } from "react";

type Props = {
  setInput: (s: string) => void;
  disabled?: boolean;
  autoSend?: boolean; // optional: if true, auto-send after transcription
  onSend?: () => Promise<void>;
};

export default function MicRecorder({ setInput, disabled, autoSend = false, onSend }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  async function startVoiceChat() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Mic start error:", err);
      setRecording(false);
      // optionally notify user
    }
  }

  async function stopVoiceChat() {
    const mr = mediaRecorderRef.current;
    if (!mr) {
      setRecording(false);
      return;
    }

    setRecording(false);
    setProcessing(true);

    const result = await new Promise<any>((resolve) => {
      mr.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, {
            type: chunksRef.current[0]?.type || "audio/webm",
          });

          // stop tracks
          try {
            streamRef.current?.getTracks().forEach((t) => t.stop());
          } catch (_) {}

          // upload to api
          const fd = new FormData();
          fd.append("file", blob, "recording.webm");

          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          resolve(data);
        } catch (err) {
          console.error("Transcription/upload error:", err);
          resolve({ error: "upload/transcription failed" });
        }
      };

      // stop recorder (this triggers onstop)
      try {
        mr.stop();
      } catch (e) {
        console.error("Failed to stop recorder:", e);
        resolve({ error: "failed to stop recorder" });
      }
    });

    setProcessing(false);

    if (result?.text) {
      setInput(result.text);
      if (autoSend && onSend) {
        try {
          await onSend();
        } catch (err) {
          console.error("Auto-send failed:", err);
        }
      }
    } else {
      console.warn("Transcription result:", result);
    }

    // cleanup
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    streamRef.current = null;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (disabled || processing) return;
          if (recording) stopVoiceChat();
          else startVoiceChat();
        }}
        aria-pressed={recording}
        disabled={disabled || processing}
      >
        {processing ? "Processing…" : recording ? "Stop recording" : "Start recording"}
      </button>
    </div>
  );
}
