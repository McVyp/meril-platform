"use client";

import { Badge } from "@/components/ui/badge";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileChatOverlay } from "@/components/mobile-chat-overlay";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FlipHorizontal2, MessageCircle, SwitchCamera, Users, X } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { toast } from "sonner";

type MobileState = "idle" | "requesting-camera" | "creating" | "live";

export default function MobileStudioPage() {
  const [state, setState] = useState<MobileState>("idle");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [switchingCamera, setSwitchingCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const whipSessionUrlRef = useRef<string | null>(null);

  const [endedDialogOpen, setEndedDialogOpen] = useState(false);

  const startPreview = useCallback(
    async (mode: "user" | "environment" = "user") => {
      setState("requesting-camera");
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: true,
        });
        mediaStreamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setState("idle");
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Camera/mic access failed: ${err.message}`
            : `Camera/mic access failed`,
        );
        setState("idle");
      }
    },
    [],
  );

  const flipCamera = useCallback(async () => {
    if (switchingCamera) return;
    setSwitchingCamera(true);
    const nextMode = facingMode === "user" ? "environment" : "user";

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
        audio: true,
      });
      const oldStream = mediaStreamRef.current;
      if (peerConnectionRef.current) {
        const newVideoTrack = newStream.getVideoTracks()[0];
        const sender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track?.kind === "video");
        if (sender && newVideoTrack) {
          await sender.replaceTrack(newVideoTrack);
        }
      }
      mediaStreamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setFacingMode(nextMode);
      oldStream?.getTracks().forEach((track) => track.stop());
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Camera/mic access failed: ${err.message}`
          : `Camera/mic access failed`,
      );
    } finally {
      setSwitchingCamera(false);
    }
  }, [facingMode, switchingCamera]);

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; count?: number };
    if (msg.type === "VIEWER_COUNT") setViewerCount(msg.count ?? null);
  }, []);

  useWebSocket(streamId, handleMessage);

  useEffect(() => {
    startPreview();
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startPreview]);

  useEffect(() => {
    const handleUnload = () => {
      if (state === "live" && whipSessionUrlRef.current) {
        sessionStorage.setItem("stream-ended-on-reload", "true");
        fetch(whipSessionUrlRef.current, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
        if (streamId) {
          fetch(`/api/streams/${streamId}/end`, {
            method: "PUT",
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [state, streamId]);

  useEffect(() => {
    const flag = sessionStorage.getItem("stream-ended-on-reload");
    if (flag) {
      setEndedDialogOpen(true);
      sessionStorage.removeItem("stream-ended-on-reload");
    }
  }, []);

  const goLiveInFlightRef = useRef(false);

  const goLive = useCallback(async () => {
    if (!title.trim() || !mediaStreamRef.current) return;
    if (goLiveInFlightRef.current) return;
    goLiveInFlightRef.current = true;
    setDialogOpen(false);
    setState("creating");
    let createdStreamId: string | null = null;

    try {
      const streamRes = await fetch("/api/streams/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim() || title.trim(),
        }),
      });
      if (!streamRes.ok) throw new Error("Failed to create mobile stream");
      const { stream } = await streamRes.json();
      createdStreamId = stream.id;

      const tokenRes = await fetch(`/api/streams/${stream.id}/mobile-token`);
      if (!tokenRes.ok) throw new Error("Failed to get participant token");
      const tokenData = await tokenRes.json();

      const payload = JSON.parse(atob(tokenData.token.split(".")[1]));
      const whipUrl = payload.whip_url as string;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      mediaStreamRef.current?.getTracks().forEach((track) => {
        pc.addTransceiver(track, { direction: "sendonly" });
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
          return;
        }
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
      });

      const whipRes = await fetch(`/api/streams/${stream.id}/whip-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whipUrl,
          token: tokenData.token,
          sdpOffer: pc.localDescription!.sdp,
        }),
      });
      if (!whipRes.ok) throw new Error("WHIP publish failed");

      const { sdpAnswer, sessionLocation } = await whipRes.json();
      whipSessionUrlRef.current = sessionLocation;
      await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
      setStreamId(stream.id);
      setState("live");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to go live");
      setState("idle");
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;

      if (createdStreamId) {
        await fetch(`/api/streams/${createdStreamId}/end`, {
          method: "PUT",
        }).catch(() => {});
      }
    } finally {
      goLiveInFlightRef.current = false;
    }
  }, [title, description]);

  const endStream = useCallback(async () => {
    if (!streamId) return;
    try {
      if (whipSessionUrlRef.current) {
        await fetch(whipSessionUrlRef.current, { method: "DELETE" }).catch(
          () => {},
        );
      }
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      whipSessionUrlRef.current = null;
      await fetch(`/api/streams/${streamId}/end`, { method: "PUT" });
    } catch (err) {
      console.error("Failed to end mobile stream cleanly:", err);
    } finally {
      setStreamId(null);
      setState("idle");
      setTitle("");
      setDescription("");
      setViewerCount(null);
    }
  }, [streamId]);

  const canGoLive = !!title.trim() && !!mediaStreamRef.current;
  const isLive = state === "live";

  const toggleMirror = useCallback(() => {
    setMirrored((prev) => !prev);
  }, []);

  return (
    <div className="relative flex h-dvh flex-col bg-[#0A0B0D] text-white">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover transition-all duration-300 ${mirrored ? "scale-x-[-1]" : ""} ${switchingCamera ? "blur-md scale-110" : ""}`}
      />
      <div className="relative z-20 flex items-center justify-between p-4">
        <Badge variant={isLive ? "destructive" : "secondary"} >
          {isLive ? "LIVE" : "PREVIEW"}
        </Badge>

        <div className="flex items-center gap-3">
          <button
            onClick={flipCamera}
            disabled={switchingCamera}
            className="rounded-full bg-black/40 p-2 backdrop-blur cursor-pointer disabled:opacity-40"
            aria-label={
              facingMode === "user"
                ? "Switch to back camera"
                : "Switch to front camera"
            }
          >
            <SwitchCamera className="h-6 w-6" />
          </button>
          <button
            onClick={toggleMirror}
            className="rounded-full bg-black/40 p-2 backdrop-blur cursor-pointer"
            aria-label={
              mirrored ? "Turn off mirror effect" : "Turn on mirror effect"
            }
          >
            <FlipHorizontal2 className="h-6 w-6" />
          </button>
          {isLive && (
            <div className="flex items-center gap-3">
              <button onClick={() => setChatOpen((prev) => !prev)}>
                <MessageCircle className="h-6 w-6" />
              </button>
              <div className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 font-mono text-white backdrop-blur">
                <Users className="h-6 w-6" /> {viewerCount ?? 0}
              </div>
            </div>
          )}
          <Button
            onClick={() => (isLive ? endStream() : setDialogOpen(true))}
            disabled={state === "creating"}
            className={
              isLive
                ? "border-zinc-700 cursor-pointer bg-black/40 text-white backdrop-blur hover:bg-red-500/20 hover:text-red-500"
                : "bg-red-800 cursor-pointer text-white hover:bg-red-600 disabled:opacity-40"
            }
          >
            {isLive ? "End Stream" : "Go Live"}
          </Button>
        </div>
      </div>
      {isLive && chatOpen && streamId && (
        <MobileChatOverlay streamId={streamId} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start your Stream</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Stream Title"
              className="w-full rounded-md focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Stream Description"
              className="w-full rounded-md focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <DialogFooter>
            <Button onClick={goLive} disabled={!canGoLive}>
              Go Live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={endedDialogOpen} onOpenChange={setEndedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stream Ended</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p>Reloading the page ends your stream</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setEndedDialogOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
