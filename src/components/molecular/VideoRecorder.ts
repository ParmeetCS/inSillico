// =============================================================================
// VideoRecorder – WebM video export from Three.js canvas
// Supports local download and optional Supabase storage upload
// =============================================================================

export class VideoRecorder {
  private canvas: HTMLCanvasElement | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private recording = false;
  private startTime = 0;
  private onComplete: ((blob: Blob) => void) | null = null;

  /** Bind to a canvas element */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  /** Whether currently recording */
  isRecording(): boolean {
    return this.recording;
  }

  /** Get elapsed recording time in seconds */
  getElapsed(): number {
    if (!this.recording) return 0;
    return (performance.now() - this.startTime) / 1000;
  }

  /** Start recording the canvas as WebM video */
  start(onComplete?: (blob: Blob) => void): boolean {
    if (!this.canvas || this.recording) return false;

    this.onComplete = onComplete ?? null;
    this.chunks = [];

    try {
      // Capture stream at 30fps
      this.stream = this.canvas.captureStream(30);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        this.recording = false;
        if (this.onComplete) this.onComplete(blob);
      };

      this.mediaRecorder.start(100); // chunk every 100ms
      this.recording = true;
      this.startTime = performance.now();
      return true;
    } catch (err) {
      console.error("[VideoRecorder] Failed to start:", err);
      return false;
    }
  }

  /** Stop recording. Triggers onComplete callback. */
  stop(): void {
    if (this.mediaRecorder && this.recording) {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  /** Download the last recorded blob as a file */
  static download(blob: Blob, filename = "reaction-animation.webm"): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** Upload to Supabase storage bucket */
  static async uploadToSupabase(
    blob: Blob,
    projectId: string,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<string | null> {
    try {
      const filename = `reactions/${projectId}/${Date.now()}.webm`;
      const res = await fetch(`${supabaseUrl}/storage/v1/object/animations/${filename}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "video/webm",
        },
        body: blob,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      return `${supabaseUrl}/storage/v1/object/public/animations/${filename}`;
    } catch (err) {
      console.error("[VideoRecorder] Upload failed:", err);
      return null;
    }
  }

  /** Release resources */
  dispose(): void {
    this.stop();
    this.canvas = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
