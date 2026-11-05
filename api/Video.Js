module.exports = async (req, res) => {
  const key = process.env.POLLINATIONS_API_KEY;

  if (!key) {
    return res.status(500).json({
      error: "AI engine is not configured"
    });
  }

  try {
    if (req.method === "POST") {
      const {
        prompt,
        mode,
        duration,
        imageData
      } = req.body || {};

      if (!prompt || prompt.length > 3000) {
        return res.status(400).json({
          error: "Invalid prompt"
        });
      }

      if (!["video", "imagevideo"].includes(mode)) {
        return res.status(400).json({
          error: "Invalid video mode"
        });
      }

      if (![4, 6, 8].includes(Number(duration))) {
        return res.status(400).json({
          error: "Invalid duration"
        });
      }

      let imageUrl = null;

      if (mode === "imagevideo") {
        const match = typeof imageData === "string"
          ? imageData.match(
              /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
            )
          : null;

        if (!match) {
          return res.status(400).json({
            error: "Upload a valid JPG, PNG or WebP image"
          });
        }

        const imageBuffer = Buffer.from(
          match[2],
          "base64"
        );

        if (imageBuffer.length > 4 * 1024 * 1024) {
          return res.status(413).json({
            error: "Image must be smaller than 4 MB"
          });
        }

        const upload = await fetch(
          "https://media.pollinations.ai/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": match[1],
              "X-File-Name": "alnahari-reference"
            },
            body: imageBuffer
          }
        );

        if (!upload.ok) {
          throw new Error("Image upload failed");
        }

        const uploaded = await upload.json();
        imageUrl = uploaded.url;

        if (!imageUrl) {
          throw new Error("Image URL missing");
        }
      }

      const instructions = `
Follow the user's prompt literally.
Preserve the exact sequence of events.
Keep characters and objects consistent.
Do not invent additional characters.
Do not add unrelated objects or scenes.
Use realistic cinematic motion.
${imageUrl ? "Use the uploaded image as the first frame and preserve its main subject." : ""}
Generate synchronized natural audio, dialogue and realistic sound effects when supported by the video model.
Do not add unrelated sounds.
      `;

      const videoURL = new URL(
        "https://gen.pollinations.ai/video/" +
        encodeURIComponent(prompt + "\n" + instructions)
      );

      videoURL.searchParams.set(
        "model",
        "google/veo-3.1-fast"
      );

      videoURL.searchParams.set(
        "duration",
        String(duration)
      );

      if (imageUrl) {
        videoURL.searchParams.set("image", imageUrl);
      }

      const response = await fetch(videoURL, {
        headers: {
          Authorization: `Bearer ${key}`,
          Prefer: "respond-async"
        }
      });

      if (response.status === 202) {
        const job = await response.json();

        return res.status(202).json({
          jobId: job.id,
          status: job.status || "pending"
        });
      }

      if (!response.ok) {
        throw new Error(
          "Video generation failed: " +
          await response.text()
        );
      }

      const contentType =
        response.headers.get("content-type") || "";

      if (contentType.startsWith("video/")) {
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-store");

        return res.status(200).send(
          Buffer.from(await response.arrayBuffer())
        );
      }

      const result = await response.json();

      const videoUrl =
        result?.data?.[0]?.url ||
        result?.result_url;

      if (videoUrl) {
        return res.status(200).json({
          videoUrl
        });
      }

      throw new Error("Unexpected video response");
    }

    if (req.method === "GET") {
      const jobId = req.query.jobId;

      if (
        typeof jobId !== "string" ||
        !/^[A-Za-z0-9_-]{5,160}$/.test(jobId)
      ) {
        return res.status(400).json({
          error: "Invalid job ID"
        });
      }

      const statusResponse = await fetch(
        `https://gen.pollinations.ai/v1/jobs/${encodeURIComponent(jobId)}`,
        {
          headers: {
            Authorization: `Bearer ${key}`
          }
        }
      );

      const status = await statusResponse.json();

      if (!statusResponse.ok) {
        throw new Error("Could not check generation status");
      }

      if (status.status === "failed") {
        return res.status(502).json({
          status: "failed",
          error: "Video generation failed"
        });
      }

      if (status.status !== "succeeded") {
        return res.status(200).json({
          status: status.status || "processing"
        });
      }

      const resultResponse = await fetch(
        `https://gen.pollinations.ai/v1/jobs/${encodeURIComponent(jobId)}/result`,
        {
          headers: {
            Authorization: `Bearer ${key}`
          }
        }
      );

      if (!resultResponse.ok) {
        throw new Error("Could not download video");
      }

      const type =
        resultResponse.headers.get("content-type") ||
        "video/mp4";

      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "no-store");

      return res.status(200).send(
        Buffer.from(await resultResponse.arrayBuffer())
      );
    }

    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {
    return res.status(500).json({
      error: "Video engine error",
      details: error.message
    });
  }
};
