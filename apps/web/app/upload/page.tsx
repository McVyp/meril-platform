"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, X, Film } from "lucide-react";
import { toast } from "sonner";

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("video/")) return;
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(f);
      });
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
    },
    [title],
  );

  const clearFile = () => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleSubmit = async () => {
    if (!file || !title) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const urlRes = await fetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      if (!urlRes.ok) throw new Error("Could not start upload.");
      const { videoId, presignedUrl, s3Key } = await urlRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // simulate progress up to 90% until real events fire
        let simProgress = 0;
        const sim = setInterval(() => {
          simProgress += 2;
          if (simProgress < 90) {
            setUploadProgress(simProgress);
          } else {
            setUploadProgress(90);
            clearInterval(sim);
          }
        }, 100);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            clearInterval(sim);
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          clearInterval(sim);
          setUploadProgress(100);
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error(`S3 upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => {
          clearInterval(sim);
          reject(new Error("S3 upload failed"));
        };
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      const createRes = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, title, description, s3Key }),
      });

      if (!createRes.ok)
        throw new Error("Upload succeeded but saving the video failed.");

      await new Promise((r) => setTimeout(r, 1500));
      setFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setTitle("");
      setDescription("");
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Upload complete");
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Upload failed — please try again",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-[2rem] font-semibold mb-8 font-[family-name:var(--font-geist-pixel-square)]">
          Upload
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-white/70 text-[1.5rem]">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your video a title"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/30 h-[2rem]"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="description"
                className="text-white/70 text-[1.5rem]"
              >
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this video about?"
                rows={4}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:border-white/30 resize-none"
              />
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-white/50 bg-white/10"
                  : "border-white/10 hover:border-white/30 hover:bg-white/5"
              } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && handleFile(e.target.files[0])
                }
              />
              <Upload className="mx-auto mb-3 text-white/30" size={24} />
              {file ? (
                <div className="text-white/70 text-[1.2rem]">
                  <p className="font-medium text-white">{file.name}</p>
                  <p className="mt-1">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <div className="text-white/40 text-[1.2rem]">
                  <p>Drop a video file here</p>
                  <p className="mt-1 text-white/20">or click to browse</p>
                </div>
              )}
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-[1.5rem] text-white/50">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!file || !title || isUploading}
              className="w-full bg-white text-black hover:bg-white/90 disabled:opacity-30 text-[1.5rem] font-bold py-6"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>

          <div className="lg:sticky lg:top-8">
            {previewUrl ? (
              <div className="relative rounded-lg overflow-hidden bg-white/5 aspect-video">
                <video
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 rounded-full p-1.5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 aspect-video flex flex-col items-center justify-center text-white/20 bg-white/5">
                <Film size={24} className="mb-3" />
                <p className="text-[1.5rem]">Preview will appear here</p>
              </div>
            )}

            {file && (
              <div className="mt-4 space-y-1 text-[1.5rem] text-white/40">
                <p>File: {file.name}</p>
                <p>Size: {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                <p>Type: {file.type}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
